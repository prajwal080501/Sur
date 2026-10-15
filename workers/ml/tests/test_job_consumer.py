from __future__ import annotations

import json
import unittest
from pathlib import Path

from sur_worker.job_consumer import (
    JobContractError,
    RenderJobProcessor,
    parse_render_job,
)
from sur_worker.render_video import RenderVideoRequest, RenderVideoResult


def message(**payload_overrides: object) -> str:
    payload: dict[str, object] = {
        "inputKeys": ["private/user-1/take-1/mix.mp3"],
        "params": {
            "aspect": "9:16",
            "durationMs": 1_000,
            "startMs": 0,
            "title": "Morning riyaz",
            "background": "gradient-1",
            "showChords": True,
        },
        "policy": {"containsThirdPartyStems": False, "freeTier": True},
    }
    payload.update(payload_overrides)
    return json.dumps(
        {
            "id": "job:job-1",
            "type": "render_video.requested",
            "jobId": "job-1",
            "payload": payload,
        }
    )


class FakeObjects:
    def __init__(self, output_exists: bool = False) -> None:
        self.output_exists = output_exists
        self.downloads: list[tuple[str, Path]] = []
        self.uploads: list[tuple[Path, str]] = []

    def exists(self, _key: str) -> bool:
        return self.output_exists

    def download(self, key: str, destination: Path) -> None:
        self.downloads.append((key, destination))
        destination.write_bytes(b"audio")

    def upload_video(self, source: Path, key: str) -> None:
        self.uploads.append((source, key))


class FakeReporter:
    def __init__(self) -> None:
        self.calls: list[tuple[object, ...]] = []

    def processing(self, job_id: str) -> None:
        self.calls.append(("processing", job_id))

    def done(self, job_id: str, output_key: str, elapsed_ms: int, reused: bool) -> None:
        self.calls.append(("done", job_id, output_key, elapsed_ms, reused))

    def failed(self, job_id: str, code: str, message: str) -> None:
        self.calls.append(("failed", job_id, code, message))


class RenderJobContractTests(unittest.TestCase):
    def test_parses_the_stable_queue_contract(self) -> None:
        event = parse_render_job(message())
        self.assertEqual(event.job_id, "job-1")
        self.assertEqual(event.params.duration_ms, 1_000)
        self.assertTrue(event.free_tier)

    def test_rejects_invalid_json_paths_ranges_and_missing_policy(self) -> None:
        invalid_messages = [
            "not-json",
            message(inputKeys=["../secret"]),
            message(inputKeys=["one", "two"]),
            message(params={"aspect": "1:1"}),
            message(policy={}),
        ]
        for body in invalid_messages:
            with self.subTest(body=body), self.assertRaises(JobContractError):
                parse_render_job(body)


class RenderJobProcessorTests(unittest.TestCase):
    def test_downloads_renders_uploads_and_reports_success(self) -> None:
        objects = FakeObjects()
        reporter = FakeReporter()
        rendered: list[RenderVideoRequest] = []

        def render(request: RenderVideoRequest) -> RenderVideoResult:
            rendered.append(request)
            request.output_path.write_bytes(b"video")
            return RenderVideoResult(request.output_path, 1080, 1920, 1_000, 321)

        processor = RenderJobProcessor(objects, reporter, render)
        processor.process(message())

        self.assertEqual(len(rendered), 1)
        self.assertEqual(objects.downloads[0][0], "private/user-1/take-1/mix.mp3")
        self.assertEqual(objects.uploads[0][1], "renders/job-1/video.mp4")
        self.assertEqual(
            reporter.calls,
            [
                ("processing", "job-1"),
                ("done", "job-1", "renders/job-1/video.mp4", 321, False),
            ],
        )

    def test_reuses_a_deterministic_existing_output(self) -> None:
        objects = FakeObjects(output_exists=True)
        reporter = FakeReporter()

        def should_not_render(_request: RenderVideoRequest) -> RenderVideoResult:
            raise AssertionError("renderer should not run")

        RenderJobProcessor(objects, reporter, should_not_render).process(message())
        self.assertFalse(objects.downloads)
        self.assertEqual(
            reporter.calls[-1],
            ("done", "job-1", "renders/job-1/video.mp4", 0, True),
        )

    def test_rechecks_stem_policy_before_downloading_and_reports_failure(self) -> None:
        objects = FakeObjects()
        reporter = FakeReporter()
        policy = {"containsThirdPartyStems": True, "freeTier": True}
        with self.assertRaisesRegex(RuntimeError, "STEMS_NOT_SHAREABLE"):
            RenderJobProcessor(objects, reporter).process(message(policy=policy))
        self.assertFalse(objects.downloads)
        self.assertEqual(reporter.calls[-1][0:3], ("failed", "job-1", "STEMS_NOT_SHAREABLE"))


if __name__ == "__main__":
    unittest.main()
