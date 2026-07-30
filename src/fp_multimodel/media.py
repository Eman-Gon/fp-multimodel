"""Video normalization and audio extraction for Track A1."""

from __future__ import annotations

import subprocess
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from pathlib import Path


CommandRunner = Callable[..., subprocess.CompletedProcess[bytes]]


@dataclass(frozen=True)
class NormalizedMedia:
    """Paths produced by the normalization stage."""

    video: Path
    audio: Path


def _run(command: Sequence[str], runner: CommandRunner) -> None:
    runner(list(command), check=True)


def normalize_media(
    input_video: Path,
    output_dir: Path,
    *,
    overwrite: bool = False,
    ffmpeg_bin: str = "ffmpeg",
    runner: CommandRunner = subprocess.run,
) -> NormalizedMedia:
    """Normalize video to 30 fps and extract a 16 kHz mono PCM WAV.

    Existing outputs are preserved unless ``overwrite`` is explicitly enabled.
    """

    input_video = input_video.resolve()
    if not input_video.is_file():
        raise FileNotFoundError(f"input video does not exist: {input_video}")

    output_dir.mkdir(parents=True, exist_ok=True)
    normalized_video = output_dir / "normalized.mp4"
    audio = output_dir / "audio.wav"

    existing = [path for path in (normalized_video, audio) if path.exists()]
    if existing and not overwrite:
        paths = ", ".join(str(path) for path in existing)
        raise FileExistsError(f"refusing to overwrite existing output: {paths}")

    overwrite_flag = "-y" if overwrite else "-n"
    _run(
        [
            ffmpeg_bin,
            "-hide_banner",
            "-loglevel",
            "error",
            overwrite_flag,
            "-i",
            str(input_video),
            "-vf",
            "fps=30",
            "-c:v",
            "libx264",
            "-preset",
            "medium",
            "-crf",
            "18",
            "-c:a",
            "aac",
            str(normalized_video),
        ],
        runner,
    )
    _run(
        [
            ffmpeg_bin,
            "-hide_banner",
            "-loglevel",
            "error",
            overwrite_flag,
            "-i",
            str(normalized_video),
            "-ac",
            "1",
            "-ar",
            "16000",
            "-vn",
            "-c:a",
            "pcm_s16le",
            str(audio),
        ],
        runner,
    )

    return NormalizedMedia(video=normalized_video, audio=audio)

