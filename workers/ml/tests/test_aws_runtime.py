from __future__ import annotations

import hashlib
import hmac
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from sur_worker.aws_runtime import S3ObjectStore, SignedHttpJobReporter, SqsRenderConsumer


class FakeSqs:
    def __init__(self, body: str = "{}") -> None:
        self.body = body
        self.deleted: list[dict[str, object]] = []
        self.visibility: list[dict[str, object]] = []

    def receive_message(self, **_kwargs: object) -> dict[str, object]:
        return {"Messages": [{"Body": self.body, "ReceiptHandle": "receipt-1"}]}

    def change_message_visibility(self, **kwargs: object) -> object:
        self.visibility.append(kwargs)
        return {}

    def delete_message(self, **kwargs: object) -> object:
        self.deleted.append(kwargs)
        return {}


class FakeProcessor:
    def __init__(self, error: Exception | None = None) -> None:
        self.error = error
        self.bodies: list[str] = []

    def process(self, body: str) -> object:
        self.bodies.append(body)
        if self.error:
            raise self.error
        return object()


class SqsRenderConsumerTests(unittest.TestCase):
    def test_deletes_a_message_only_after_successful_processing(self) -> None:
        sqs = FakeSqs("job-body")
        processor = FakeProcessor()
        consumer = SqsRenderConsumer(sqs, "https://sqs.example/jobs", processor)  # type: ignore[arg-type]
        self.assertTrue(consumer.run_once())
        self.assertEqual(processor.bodies, ["job-body"])
        self.assertEqual(sqs.deleted[0]["ReceiptHandle"], "receipt-1")

    def test_leaves_a_failed_message_for_redrive(self) -> None:
        sqs = FakeSqs("bad-job")
        processor = FakeProcessor(RuntimeError("render failed"))
        consumer = SqsRenderConsumer(sqs, "https://sqs.example/jobs", processor)  # type: ignore[arg-type]
        with self.assertRaisesRegex(RuntimeError, "render failed"):
            consumer.run_once()
        self.assertFalse(sqs.deleted)


class FakeS3:
    def __init__(self) -> None:
        self.missing = False
        self.uploads: list[tuple[object, ...]] = []

    def head_object(self, **_kwargs: object) -> object:
        if self.missing:
            error = RuntimeError("missing")
            error.response = {"Error": {"Code": "NoSuchKey"}}  # type: ignore[attr-defined]
            raise error
        return {}

    def download_file(self, _bucket: str, _key: str, filename: str) -> None:
        Path(filename).write_bytes(b"audio")

    def upload_file(
        self, filename: str, bucket: str, key: str, ExtraArgs: dict[str, str]
    ) -> None:
        self.uploads.append((filename, bucket, key, ExtraArgs))


class AwsAdapterTests(unittest.TestCase):
    def test_s3_adapter_distinguishes_missing_objects_and_sets_private_video_metadata(self) -> None:
        client = FakeS3()
        store = S3ObjectStore(client, "media")
        self.assertTrue(store.exists("renders/job-1/video.mp4"))
        client.missing = True
        self.assertFalse(store.exists("renders/job-2/video.mp4"))
        with tempfile.TemporaryDirectory() as directory:
            video = Path(directory) / "video.mp4"
            video.write_bytes(b"video")
            store.upload_video(video, "renders/job-1/video.mp4")
        self.assertEqual(client.uploads[0][1:3], ("media", "renders/job-1/video.mp4"))
        self.assertEqual(
            client.uploads[0][3],
            {"ContentType": "video/mp4", "CacheControl": "private, max-age=0"},
        )

    def test_reporter_signs_the_exact_canonical_body(self) -> None:
        class Response:
            status = 204

            def __enter__(self) -> Response:
                return self

            def __exit__(self, *_args: object) -> None:
                return None

        secret = "worker-callback-secret-that-is-long-enough"
        reporter = SignedHttpJobReporter("https://api.example.com", secret)
        with (
            patch("sur_worker.aws_runtime.time.time", return_value=1_000),
            patch(
                "sur_worker.aws_runtime.urllib.request.urlopen", return_value=Response()
            ) as open_url,
        ):
            reporter.processing("job-1")
        request = open_url.call_args.args[0]
        body = json.dumps(
            {"progress": 5, "status": "processing"}, separators=(",", ":"), sort_keys=True
        ).encode()
        expected = hmac.new(secret.encode(), b"1000." + body, hashlib.sha256).hexdigest()
        headers = {key.lower(): value for key, value in request.header_items()}
        self.assertEqual(request.data, body)
        self.assertEqual(headers["x-sur-signature"], f"sha256={expected}")
        self.assertEqual(headers["x-sur-timestamp"], "1000")

    def test_reporter_rejects_insecure_urls_and_short_secrets(self) -> None:
        with self.assertRaisesRegex(ValueError, "HTTPS"):
            SignedHttpJobReporter("http://api.example.com", "x" * 32)
        with self.assertRaisesRegex(ValueError, "32 bytes"):
            SignedHttpJobReporter("https://api.example.com", "short")


if __name__ == "__main__":
    unittest.main()
