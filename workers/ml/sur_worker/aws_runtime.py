"""AWS adapters and process entry point for the render-job consumer."""

from __future__ import annotations

import hashlib
import hmac
import json
import logging
import os
import signal
import threading
import time
import urllib.request
from pathlib import Path
from typing import Protocol
from urllib.parse import quote, urlparse

from .job_consumer import JobResultReporter, ObjectStore, RenderJobProcessor

logger = logging.getLogger(__name__)


class S3Client(Protocol):
    def head_object(self, **kwargs: object) -> object: ...

    def download_file(self, bucket: str, key: str, filename: str) -> None: ...

    def upload_file(
        self, filename: str, bucket: str, key: str, ExtraArgs: dict[str, str]
    ) -> None: ...


class SqsClient(Protocol):
    def receive_message(self, **kwargs: object) -> dict[str, object]: ...

    def change_message_visibility(self, **kwargs: object) -> object: ...

    def delete_message(self, **kwargs: object) -> object: ...


class S3ObjectStore(ObjectStore):
    def __init__(self, client: S3Client, bucket: str) -> None:
        self._client = client
        self._bucket = bucket

    def exists(self, key: str) -> bool:
        try:
            self._client.head_object(Bucket=self._bucket, Key=key)
            return True
        except Exception as error:
            response = getattr(error, "response", {})
            error_details = response.get("Error", {}) if isinstance(response, dict) else {}
            metadata = response.get("ResponseMetadata", {}) if isinstance(response, dict) else {}
            code = error_details.get("Code") if isinstance(error_details, dict) else None
            status = metadata.get("HTTPStatusCode") if isinstance(metadata, dict) else None
            if code in {"404", "NoSuchKey", "NotFound"} or status == 404:
                return False
            raise

    def download(self, key: str, destination: Path) -> None:
        self._client.download_file(self._bucket, key, str(destination))

    def upload_video(self, source: Path, key: str) -> None:
        self._client.upload_file(
            str(source),
            self._bucket,
            key,
            ExtraArgs={"ContentType": "video/mp4", "CacheControl": "private, max-age=0"},
        )


class SignedHttpJobReporter(JobResultReporter):
    def __init__(self, api_base_url: str, secret: str, timeout_seconds: float = 10) -> None:
        parsed = urlparse(api_base_url)
        if parsed.scheme != "https" or parsed.username or parsed.password:
            raise ValueError("WORKER_API_BASE_URL must be HTTPS without embedded credentials")
        if len(secret.encode()) < 32:
            raise ValueError("WORKER_CALLBACK_SECRET must contain at least 32 bytes")
        self._api_base_url = api_base_url.rstrip("/")
        self._secret = secret.encode()
        self._timeout_seconds = timeout_seconds

    def processing(self, job_id: str) -> None:
        self._send(job_id, {"status": "processing", "progress": 5})

    def done(self, job_id: str, output_key: str, elapsed_ms: int, reused: bool) -> None:
        self._send(
            job_id,
            {
                "status": "done",
                "progress": 100,
                "output": {"videoObjectKey": output_key},
                "metrics": {"elapsedMs": elapsed_ms, "reused": reused},
            },
        )

    def failed(self, job_id: str, code: str, message: str) -> None:
        self._send(
            job_id,
            {"status": "failed", "progress": 0, "error": {"code": code, "message": message}},
        )

    def _send(self, job_id: str, payload: dict[str, object]) -> None:
        body = json.dumps(payload, separators=(",", ":"), sort_keys=True).encode()
        timestamp = str(int(time.time()))
        signature = hmac.new(
            self._secret, timestamp.encode() + b"." + body, hashlib.sha256
        ).hexdigest()
        request = urllib.request.Request(
            f"{self._api_base_url}/api/v1/internal/jobs/{quote(job_id, safe='')}/status",
            data=body,
            method="POST",
            headers={
                "Content-Type": "application/json",
                "X-Sur-Timestamp": timestamp,
                "X-Sur-Signature": f"sha256={signature}",
            },
        )
        with urllib.request.urlopen(request, timeout=self._timeout_seconds) as response:
            if not 200 <= response.status < 300:
                raise RuntimeError(f"Job callback returned HTTP {response.status}")


class SqsRenderConsumer:
    def __init__(
        self,
        client: SqsClient,
        queue_url: str,
        processor: RenderJobProcessor,
        visibility_seconds: int = 180,
    ) -> None:
        self._client = client
        self._queue_url = queue_url
        self._processor = processor
        self._visibility_seconds = visibility_seconds

    def run_once(self) -> bool:
        response = self._client.receive_message(
            QueueUrl=self._queue_url,
            MaxNumberOfMessages=1,
            WaitTimeSeconds=20,
            VisibilityTimeout=self._visibility_seconds,
        )
        messages = response.get("Messages", [])
        if not isinstance(messages, list) or not messages:
            return False
        message = messages[0]
        if not isinstance(message, dict):
            return False
        body = message.get("Body")
        receipt = message.get("ReceiptHandle")
        if not isinstance(body, str) or not isinstance(receipt, str):
            return False

        stopped = threading.Event()
        heartbeat = threading.Thread(
            target=self._extend_visibility,
            args=(receipt, stopped),
            name="sqs-visibility-heartbeat",
            daemon=True,
        )
        heartbeat.start()
        try:
            self._processor.process(body)
        finally:
            stopped.set()
            heartbeat.join(timeout=2)
        self._client.delete_message(QueueUrl=self._queue_url, ReceiptHandle=receipt)
        return True

    def _extend_visibility(self, receipt: str, stopped: threading.Event) -> None:
        interval = max(10, self._visibility_seconds // 3)
        while not stopped.wait(interval):
            self._client.change_message_visibility(
                QueueUrl=self._queue_url,
                ReceiptHandle=receipt,
                VisibilityTimeout=self._visibility_seconds,
            )


def _required(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise RuntimeError(f"{name} is required")
    return value


def main() -> None:
    import boto3

    logging.basicConfig(level=os.environ.get("LOG_LEVEL", "INFO"))
    region = _required("AWS_REGION")
    queue_url = _required("SQS_JOBS_URL")
    bucket = _required("S3_BUCKET_MEDIA")
    reporter = SignedHttpJobReporter(
        _required("WORKER_API_BASE_URL"), _required("WORKER_CALLBACK_SECRET")
    )
    objects = S3ObjectStore(boto3.client("s3", region_name=region), bucket)
    processor = RenderJobProcessor(objects, reporter)
    consumer = SqsRenderConsumer(
        boto3.client("sqs", region_name=region), queue_url, processor
    )
    stopping = False

    def stop(_signal: int, _frame: object) -> None:
        nonlocal stopping
        stopping = True

    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)
    while not stopping:
        try:
            consumer.run_once()
        except Exception:
            logger.exception("Render job attempt failed; the message remains available for redrive")
            time.sleep(1)
