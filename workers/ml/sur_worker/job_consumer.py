"""Validated, idempotent render-job application service."""

from __future__ import annotations

import json
import re
import tempfile
from collections.abc import Callable
from contextlib import suppress
from dataclasses import dataclass
from pathlib import Path, PurePosixPath
from typing import Protocol

from .render_video import (
    RenderVideoError,
    RenderVideoRequest,
    RenderVideoResult,
    StemsNotShareableError,
    render_video,
)

_ID = re.compile(r"^[A-Za-z0-9:_-]{1,128}$")
_BACKGROUNDS = {"gradient-1", "midnight", "warm"}


class JobContractError(ValueError):
    """Raised when a queue message does not match the versioned worker contract."""


@dataclass(frozen=True)
class RenderJobParams:
    duration_ms: int
    start_ms: int
    title: str
    background: str
    show_chords: bool


@dataclass(frozen=True)
class RenderJobEnvelope:
    event_id: str
    job_id: str
    input_key: str
    params: RenderJobParams
    contains_third_party_stems: bool
    free_tier: bool


class ObjectStore(Protocol):
    def exists(self, key: str) -> bool: ...

    def download(self, key: str, destination: Path) -> None: ...

    def upload_video(self, source: Path, key: str) -> None: ...


class JobResultReporter(Protocol):
    def processing(self, job_id: str) -> None: ...

    def done(self, job_id: str, output_key: str, elapsed_ms: int, reused: bool) -> None: ...

    def failed(self, job_id: str, code: str, message: str) -> None: ...


def _mapping(value: object, path: str) -> dict[str, object]:
    if not isinstance(value, dict) or not all(isinstance(key, str) for key in value):
        raise JobContractError(f"{path} must be an object")
    return value


def _text(value: object, path: str, maximum: int) -> str:
    if not isinstance(value, str) or not value or len(value) > maximum:
        raise JobContractError(f"{path} must contain 1 to {maximum} characters")
    return value


def _integer(value: object, path: str, minimum: int, maximum: int) -> int:
    if type(value) is not int or not minimum <= value <= maximum:
        raise JobContractError(f"{path} must be an integer from {minimum} to {maximum}")
    return value


def _boolean(value: object, path: str) -> bool:
    if type(value) is not bool:
        raise JobContractError(f"{path} must be a boolean")
    return value


def parse_render_job(body: str) -> RenderJobEnvelope:
    """Parse the stable JSON queue envelope without trusting producer types."""

    try:
        root = _mapping(json.loads(body), "message")
    except (json.JSONDecodeError, UnicodeDecodeError) as error:
        raise JobContractError("message must be valid JSON") from error

    event_id = _text(root.get("id"), "id", 128)
    job_id = _text(root.get("jobId"), "jobId", 128)
    if not _ID.fullmatch(event_id) or not _ID.fullmatch(job_id):
        raise JobContractError("id and jobId contain unsupported characters")
    if root.get("type") != "render_video.requested":
        raise JobContractError("type must be render_video.requested")

    payload = _mapping(root.get("payload"), "payload")
    input_keys = payload.get("inputKeys")
    if not isinstance(input_keys, list) or len(input_keys) != 1:
        raise JobContractError("payload.inputKeys must contain exactly one object key")
    input_key = _text(input_keys[0], "payload.inputKeys[0]", 1024)
    key_path = PurePosixPath(input_key)
    if key_path.is_absolute() or ".." in key_path.parts:
        raise JobContractError("payload.inputKeys[0] must be a relative object key")

    raw_params = _mapping(payload.get("params"), "payload.params")
    if raw_params.get("aspect") != "9:16":
        raise JobContractError("payload.params.aspect must be 9:16")
    duration_ms = _integer(raw_params.get("durationMs"), "durationMs", 100, 60_000)
    start_ms = _integer(raw_params.get("startMs"), "startMs", 0, 3_599_900)
    if start_ms + duration_ms > 3_600_000:
        raise JobContractError("render range must end within one hour")
    title = _text(raw_params.get("title"), "title", 120)
    if title.strip() != title:
        raise JobContractError("title must not have surrounding whitespace")
    background = _text(raw_params.get("background"), "background", 32)
    if background not in _BACKGROUNDS:
        raise JobContractError("background is not supported")
    show_chords = _boolean(raw_params.get("showChords"), "showChords")

    policy = _mapping(payload.get("policy"), "payload.policy")
    return RenderJobEnvelope(
        event_id=event_id,
        job_id=job_id,
        input_key=input_key,
        params=RenderJobParams(
            duration_ms=duration_ms,
            start_ms=start_ms,
            title=title,
            background=background,
            show_chords=show_chords,
        ),
        contains_third_party_stems=_boolean(
            policy.get("containsThirdPartyStems"), "containsThirdPartyStems"
        ),
        free_tier=_boolean(policy.get("freeTier"), "freeTier"),
    )


class RenderJobProcessor:
    def __init__(
        self,
        objects: ObjectStore,
        reporter: JobResultReporter,
        renderer: Callable[[RenderVideoRequest], RenderVideoResult] = render_video,
    ) -> None:
        self._objects = objects
        self._reporter = reporter
        self._renderer = renderer

    def process(self, body: str) -> RenderJobEnvelope:
        event = parse_render_job(body)
        output_key = f"renders/{event.job_id}/video.mp4"
        self._reporter.processing(event.job_id)
        try:
            if event.contains_third_party_stems:
                raise StemsNotShareableError("STEMS_NOT_SHAREABLE")
            if self._objects.exists(output_key):
                self._reporter.done(event.job_id, output_key, elapsed_ms=0, reused=True)
                return event

            with tempfile.TemporaryDirectory(prefix=f"sur-job-{event.job_id}-") as directory:
                work = Path(directory)
                audio_path = work / "input-audio"
                video_path = work / "video.mp4"
                self._objects.download(event.input_key, audio_path)
                result = self._renderer(
                    RenderVideoRequest(
                        audio_path=audio_path,
                        output_path=video_path,
                        title=event.params.title,
                        duration_ms=event.params.duration_ms,
                        start_ms=event.params.start_ms,
                        background=event.params.background,
                        show_chords=event.params.show_chords,
                        free_tier=event.free_tier,
                        contains_third_party_stems=event.contains_third_party_stems,
                    )
                )
                self._objects.upload_video(result.output_path, output_key)
                self._reporter.done(
                    event.job_id, output_key, elapsed_ms=result.elapsed_ms, reused=False
                )
            return event
        except Exception as error:
            code = self._error_code(error)
            message = str(error).strip()[:500] or "Render job failed"
            with suppress(Exception):
                self._reporter.failed(event.job_id, code, message)
            raise

    @staticmethod
    def _error_code(error: Exception) -> str:
        if isinstance(error, StemsNotShareableError):
            return "STEMS_NOT_SHAREABLE"
        if isinstance(error, RenderVideoError):
            return "RENDER_INVALID"
        return "RENDER_FAILED"
