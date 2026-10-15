from __future__ import annotations

import json
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

from sur_worker.render_video import (
    ChordCue,
    RenderVideoError,
    RenderVideoRequest,
    StemsNotShareableError,
    render_video,
)


class RenderVideoTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary_directory = tempfile.TemporaryDirectory(prefix="sur-video-test-")
        self.temp = Path(self.temporary_directory.name)
        self.audio = self.temp / "fixture.wav"

    def tearDown(self) -> None:
        self.temporary_directory.cleanup()

    def request(self, **overrides: object) -> RenderVideoRequest:
        values: dict[str, object] = {
            "audio_path": self.audio,
            "output_path": self.temp / "render.mp4",
            "title": "Morning Riyaz",
            "duration_ms": 1_000,
            "chords": (ChordCue(t_ms=0, symbol="Am"), ChordCue(t_ms=500, symbol="F")),
        }
        values.update(overrides)
        return RenderVideoRequest(**values)  # type: ignore[arg-type]

    def make_audio(self) -> None:
        ffmpeg = shutil.which("ffmpeg")
        if ffmpeg is None:
            self.skipTest("ffmpeg is not installed")
        subprocess.run(
            [
                ffmpeg,
                "-hide_banner",
                "-loglevel",
                "error",
                "-y",
                "-f",
                "lavfi",
                "-i",
                "sine=frequency=220:duration=2:sample_rate=48000",
                str(self.audio),
            ],
            check=True,
        )

    def test_rejects_third_party_stems_before_reading_audio(self) -> None:
        with self.assertRaisesRegex(StemsNotShareableError, "STEMS_NOT_SHAREABLE"):
            render_video(self.request(contains_third_party_stems=True))

    def test_rejects_invalid_bounds(self) -> None:
        self.audio.touch()
        with self.assertRaisesRegex(RenderVideoError, "Duration"):
            render_video(self.request(duration_ms=60_001))
        with self.assertRaisesRegex(RenderVideoError, "sorted"):
            render_video(
                self.request(
                    chords=(ChordCue(t_ms=500, symbol="F"), ChordCue(t_ms=100, symbol="Am"))
                )
            )

    def test_renders_h264_aac_1080_by_1920_fixture(self) -> None:
        ffprobe = shutil.which("ffprobe")
        if ffprobe is None:
            self.skipTest("ffprobe is not installed")
        self.make_audio()
        result = render_video(self.request(title="A title; $(never executed)"))
        self.assertEqual((result.width, result.height), (1080, 1920))
        self.assertGreater(result.output_path.stat().st_size, 0)

        probe = subprocess.run(
            [
                ffprobe,
                "-v",
                "error",
                "-show_entries",
                "stream=codec_name,codec_type,width,height",
                "-of",
                "json",
                str(result.output_path),
            ],
            capture_output=True,
            text=True,
            check=True,
        )
        streams = json.loads(probe.stdout)["streams"]
        video = next(stream for stream in streams if stream["codec_type"] == "video")
        audio = next(stream for stream in streams if stream["codec_type"] == "audio")
        self.assertEqual(video["codec_name"], "h264")
        self.assertEqual((video["width"], video["height"]), (1080, 1920))
        self.assertEqual(audio["codec_name"], "aac")


if __name__ == "__main__":
    unittest.main()
