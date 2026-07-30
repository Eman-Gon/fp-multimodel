"""Video normalization and audio extraction for Track A1."""

from __future__ import annotations

import json
import subprocess
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from fractions import Fraction
from pathlib import Path
from typing import Any

from fp_multimodel.manifest import (
    MEDIA_MANIFEST_FILENAME,
    MediaManifest,
    file_sha256,
    write_media_manifest,
)


CommandRunner = Callable[..., subprocess.CompletedProcess[bytes]]


@dataclass(frozen=True)
class NormalizedMedia:
    """Paths and verified provenance produced by the normalization stage."""

    video: Path
    audio: Path
    manifest_path: Path
    manifest: MediaManifest


def _run(command: Sequence[str], runner: CommandRunner) -> None:
    runner(list(command), check=True)


def _probe(
    path: Path,
    *,
    ffprobe_bin: str,
    runner: CommandRunner,
) -> dict[str, Any]:
    result = runner(
        [
            ffprobe_bin,
            "-v",
            "error",
            "-show_streams",
            "-show_format",
            "-of",
            "json",
            str(path),
        ],
        check=True,
        capture_output=True,
    )
    output = result.stdout
    if isinstance(output, bytes):
        output = output.decode("utf-8")
    if not isinstance(output, str):
        raise ValueError(f"ffprobe returned no JSON for {path}")
    try:
        payload = json.loads(output)
    except json.JSONDecodeError as error:
        raise ValueError(f"ffprobe returned invalid JSON for {path}") from error
    if not isinstance(payload, dict):
        raise ValueError(f"ffprobe returned invalid metadata for {path}")
    return payload


def _stream(
    payload: dict[str, Any],
    stream_type: str,
    *,
    path: Path,
) -> dict[str, Any]:
    streams = payload.get("streams")
    if not isinstance(streams, list):
        raise ValueError(f"ffprobe metadata has no streams for {path}")
    for candidate in streams:
        if (
            isinstance(candidate, dict)
            and candidate.get("codec_type") == stream_type
        ):
            return candidate
    raise ValueError(f"normalized {stream_type} stream missing from {path}")


def _parse_fps(stream: dict[str, Any], *, path: Path) -> Fraction:
    raw_fps = stream.get("avg_frame_rate")
    if raw_fps in (None, "", "0/0", 0):
        raw_fps = stream.get("r_frame_rate")
    try:
        fps = Fraction(str(raw_fps))
    except (ValueError, ZeroDivisionError) as error:
        raise ValueError(f"invalid video frame rate reported for {path}") from error
    if fps <= 0:
        raise ValueError(f"invalid video frame rate reported for {path}")
    return fps


def _parse_duration_ms(
    payload: dict[str, Any],
    stream: dict[str, Any],
    *,
    path: Path,
) -> int:
    format_metadata = payload.get("format")
    format_duration = (
        format_metadata.get("duration")
        if isinstance(format_metadata, dict)
        else None
    )
    # Prefer the picture stream: container duration can be slightly longer
    # because of AAC priming/padding and should not extend the video timeline.
    raw_duration = stream.get("duration") or format_duration
    try:
        duration_seconds = Decimal(str(raw_duration))
    except (InvalidOperation, ValueError) as error:
        raise ValueError(f"invalid video duration reported for {path}") from error
    if not duration_seconds.is_finite() or duration_seconds <= 0:
        raise ValueError(f"invalid video duration reported for {path}")
    duration_ms = int(
        (duration_seconds * 1000).quantize(
            Decimal("1"),
            rounding=ROUND_HALF_UP,
        )
    )
    if duration_ms <= 0:
        raise ValueError(f"invalid video duration reported for {path}")
    return duration_ms


def _parse_integer_stream_value(
    stream: dict[str, Any],
    field: str,
    *,
    path: Path,
) -> int:
    raw_value = stream.get(field)
    try:
        value = int(raw_value)
    except (TypeError, ValueError) as error:
        raise ValueError(f"invalid audio {field} reported for {path}") from error
    if value <= 0:
        raise ValueError(f"invalid audio {field} reported for {path}")
    return value


def normalize_media(
    input_video: Path,
    output_dir: Path,
    *,
    video_id: str,
    overwrite: bool = False,
    ffmpeg_bin: str = "ffmpeg",
    ffprobe_bin: str = "ffprobe",
    runner: CommandRunner = subprocess.run,
    ffprobe_runner: CommandRunner = subprocess.run,
) -> NormalizedMedia:
    """Normalize and verify one video's 30 fps/16 kHz mono media artifacts.

    Existing outputs are preserved unless ``overwrite`` is explicitly enabled.
    """

    if not isinstance(video_id, str) or not video_id.strip():
        raise ValueError("video_id must contain at least one non-whitespace character")

    input_video = input_video.resolve()
    if not input_video.is_file():
        raise FileNotFoundError(f"input video does not exist: {input_video}")

    output_dir.mkdir(parents=True, exist_ok=True)
    normalized_video = output_dir / "normalized.mp4"
    audio = output_dir / "audio.wav"
    manifest_path = output_dir / MEDIA_MANIFEST_FILENAME

    existing = [
        path
        for path in (normalized_video, audio, manifest_path)
        if path.exists()
    ]
    if existing and not overwrite:
        paths = ", ".join(str(path) for path in existing)
        raise FileExistsError(f"refusing to overwrite existing output: {paths}")
    if overwrite:
        # A failed replacement must never leave provenance for older media next
        # to newly written or partially written outputs.
        manifest_path.unlink(missing_ok=True)

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

    if not normalized_video.is_file():
        raise FileNotFoundError(
            f"ffmpeg did not create normalized video: {normalized_video}"
        )
    if not audio.is_file():
        raise FileNotFoundError(f"ffmpeg did not create normalized audio: {audio}")

    video_metadata = _probe(
        normalized_video,
        ffprobe_bin=ffprobe_bin,
        runner=ffprobe_runner,
    )
    audio_metadata = _probe(
        audio,
        ffprobe_bin=ffprobe_bin,
        runner=ffprobe_runner,
    )
    video_stream = _stream(video_metadata, "video", path=normalized_video)
    audio_stream = _stream(audio_metadata, "audio", path=audio)

    fps = _parse_fps(video_stream, path=normalized_video)
    if fps != 30:
        raise ValueError(
            f"normalized video must be 30 fps; ffprobe reported {fps}"
        )
    sample_rate_hz = _parse_integer_stream_value(
        audio_stream,
        "sample_rate",
        path=audio,
    )
    if sample_rate_hz != 16_000:
        raise ValueError(
            "normalized audio must have a 16000 Hz sample rate; "
            f"ffprobe reported {sample_rate_hz}"
        )
    channels = _parse_integer_stream_value(
        audio_stream,
        "channels",
        path=audio,
    )
    if channels != 1:
        raise ValueError(
            f"normalized audio must be mono; ffprobe reported {channels} channels"
        )

    manifest = MediaManifest(
        video_id=video_id,
        duration_ms=_parse_duration_ms(
            video_metadata,
            video_stream,
            path=normalized_video,
        ),
        fps=30,
        audio_sample_rate_hz=sample_rate_hz,
        audio_channels=channels,
        source_video_sha256=file_sha256(input_video),
        normalized_video_sha256=file_sha256(normalized_video),
        audio_sha256=file_sha256(audio),
    )
    written_manifest_path = write_media_manifest(output_dir, manifest)

    return NormalizedMedia(
        video=normalized_video,
        audio=audio,
        manifest_path=written_manifest_path,
        manifest=manifest,
    )
