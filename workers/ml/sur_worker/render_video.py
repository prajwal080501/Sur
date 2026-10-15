"""Deterministic ffmpeg renderer for the SHR-02 vertical-video contract."""

from __future__ import annotations

import shutil
import subprocess
import tempfile
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Final

from PIL import Image, ImageDraw, ImageFont

WIDTH: Final = 1080
HEIGHT: Final = 1920
FRAME_RATE: Final = 30
MAX_DURATION_MS: Final = 60_000


class RenderVideoError(RuntimeError):
    """Raised when a render request or ffmpeg execution is invalid."""


class StemsNotShareableError(RenderVideoError):
    """Raised before rendering media derived from third-party stems."""


@dataclass(frozen=True)
class ChordCue:
    t_ms: int
    symbol: str


@dataclass(frozen=True)
class RenderVideoRequest:
    audio_path: Path
    output_path: Path
    title: str
    duration_ms: int
    start_ms: int = 0
    background: str = "gradient-1"
    show_chords: bool = True
    chords: tuple[ChordCue, ...] = ()
    free_tier: bool = True
    contains_third_party_stems: bool = False


@dataclass(frozen=True)
class RenderVideoResult:
    output_path: Path
    width: int
    height: int
    duration_ms: int
    elapsed_ms: int


_BACKGROUNDS: Final = {
    "gradient-1": "0x171124",
    "midnight": "0x0b1020",
    "warm": "0x2a1518",
}


def _validate(request: RenderVideoRequest) -> None:
    if request.contains_third_party_stems:
        raise StemsNotShareableError("STEMS_NOT_SHAREABLE")
    if not request.audio_path.is_file():
        raise RenderVideoError("Input audio does not exist")
    if request.output_path.suffix.lower() != ".mp4":
        raise RenderVideoError("Video output must use the .mp4 extension")
    if not request.title.strip() or len(request.title) > 120:
        raise RenderVideoError("Title must contain 1 to 120 characters")
    if not 100 <= request.duration_ms <= MAX_DURATION_MS:
        raise RenderVideoError("Duration must be between 100 and 60000 ms")
    if request.start_ms < 0:
        raise RenderVideoError("Start time cannot be negative")
    if request.background not in _BACKGROUNDS:
        raise RenderVideoError("Unknown video background")
    previous = -1
    for cue in request.chords:
        if cue.t_ms < previous or cue.t_ms < 0:
            raise RenderVideoError("Chord cues must be sorted and non-negative")
        if not cue.symbol.strip() or len(cue.symbol) > 24:
            raise RenderVideoError("Chord symbols must contain 1 to 24 characters")
        previous = cue.t_ms


def _font(size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    try:
        return ImageFont.truetype("DejaVuSans.ttf", size)
    except OSError:
        return ImageFont.load_default(size=size)


def _write_card(path: Path, text: str, size: tuple[int, int], font_size: int) -> None:
    image = Image.new("RGBA", size, (15, 11, 25, 220))
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle(
        (1, 1, size[0] - 2, size[1] - 2),
        radius=28,
        fill=(15, 11, 25, 220),
        outline=(232, 180, 255, 220),
        width=3,
    )
    font = _font(font_size)
    box = draw.textbbox((0, 0), text, font=font)
    x = max(20, (size[0] - (box[2] - box[0])) // 2)
    y = max(10, (size[1] - (box[3] - box[1])) // 2 - box[1])
    draw.text((x, y), text, font=font, fill=(255, 250, 255, 255))
    image.save(path, format="PNG", optimize=True)


def _chord_intervals(request: RenderVideoRequest) -> list[tuple[ChordCue, float, float]]:
    if not request.show_chords:
        return []
    duration_seconds = request.duration_ms / 1000
    visible = [cue for cue in request.chords if cue.t_ms < request.duration_ms]
    intervals: list[tuple[ChordCue, float, float]] = []
    for index, cue in enumerate(visible):
        next_ms = visible[index + 1].t_ms if index + 1 < len(visible) else request.duration_ms
        intervals.append((cue, cue.t_ms / 1000, min(next_ms / 1000, duration_seconds)))
    return intervals


def _build_command(
    request: RenderVideoRequest,
    title_path: Path,
    watermark_path: Path | None,
    chord_cards: list[tuple[Path, float, float]],
) -> list[str]:
    ffmpeg = shutil.which("ffmpeg")
    if ffmpeg is None:
        raise RenderVideoError("ffmpeg is not installed")
    duration_seconds = request.duration_ms / 1000
    command = [
        ffmpeg,
        "-hide_banner",
        "-loglevel",
        "error",
        "-y",
        "-f",
        "lavfi",
        "-i",
        f"color=c={_BACKGROUNDS[request.background]}:s={WIDTH}x{HEIGHT}:r={FRAME_RATE}",
        "-ss",
        f"{request.start_ms / 1000:.3f}",
        "-t",
        f"{duration_seconds:.3f}",
        "-i",
        str(request.audio_path),
        "-loop",
        "1",
        "-i",
        str(title_path),
    ]
    image_paths = [path for path, _, _ in chord_cards]
    if watermark_path is not None:
        image_paths.append(watermark_path)
    for path in image_paths:
        command.extend(["-loop", "1", "-i", str(path)])

    filters = [
        "[1:a]showwaves=s=900x240:mode=line:colors=0xe8b4ff:rate=30,format=rgba[wave]",
        "[0:v][wave]overlay=(W-w)/2:1050[waveform]",
        "[waveform][2:v]overlay=(W-w)/2:260[title]",
    ]
    current = "title"
    next_input = 3
    for index, (_, start, end) in enumerate(chord_cards):
        output = f"chord{index}"
        filters.append(
            f"[{current}][{next_input}:v]overlay=(W-w)/2:720:enable='between(t,{start:.3f},{end:.3f})'[{output}]"
        )
        current = output
        next_input += 1
    if watermark_path is not None:
        filters.append(f"[{current}][{next_input}:v]overlay=W-w-48:H-h-48[outv]")
    else:
        filters.append(f"[{current}]null[outv]")

    command.extend(
        [
            "-filter_complex",
            ";".join(filters),
            "-map",
            "[outv]",
            "-map",
            "1:a:0",
            "-t",
            f"{duration_seconds:.3f}",
            "-c:v",
            "libx264",
            "-preset",
            "veryfast",
            "-profile:v",
            "high",
            "-level",
            "4.0",
            "-pix_fmt",
            "yuv420p",
            "-r",
            str(FRAME_RATE),
            "-c:a",
            "aac",
            "-b:a",
            "192k",
            "-ar",
            "48000",
            "-movflags",
            "+faststart",
            str(request.output_path),
        ]
    )
    return command


def render_video(request: RenderVideoRequest) -> RenderVideoResult:
    """Render one validated vertical MP4 without invoking a shell."""

    _validate(request)
    request.output_path.parent.mkdir(parents=True, exist_ok=True)
    started = time.monotonic()
    with tempfile.TemporaryDirectory(prefix="sur-render-") as temp_directory:
        temp = Path(temp_directory)
        title_path = temp / "title.png"
        _write_card(title_path, request.title.strip(), (900, 220), 72)

        chord_cards: list[tuple[Path, float, float]] = []
        for index, (cue, start, end) in enumerate(_chord_intervals(request)):
            path = temp / f"chord-{index}.png"
            _write_card(path, cue.symbol, (500, 160), 80)
            chord_cards.append((path, start, end))

        watermark_path: Path | None = None
        if request.free_tier:
            watermark_path = temp / "watermark.png"
            _write_card(watermark_path, "Made with Sur", (360, 88), 34)

        command = _build_command(request, title_path, watermark_path, chord_cards)
        completed = subprocess.run(command, capture_output=True, text=True, check=False)
        if completed.returncode != 0:
            request.output_path.unlink(missing_ok=True)
            message = completed.stderr.strip()[-2000:]
            raise RenderVideoError(f"ffmpeg render failed: {message}")

    if not request.output_path.is_file() or request.output_path.stat().st_size == 0:
        raise RenderVideoError("ffmpeg completed without a video output")
    return RenderVideoResult(
        output_path=request.output_path,
        width=WIDTH,
        height=HEIGHT,
        duration_ms=request.duration_ms,
        elapsed_ms=round((time.monotonic() - started) * 1000),
    )
