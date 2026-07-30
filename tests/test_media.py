import hashlib
import json
from pathlib import Path
import subprocess
from typing import Any

import pytest

from fp_multimodel.manifest import (
    MEDIA_MANIFEST_FILENAME,
    MediaManifest,
    load_media_manifest,
)
from fp_multimodel.media import normalize_media


def probe_result(payload: dict[str, Any]) -> subprocess.CompletedProcess[bytes]:
    return subprocess.CompletedProcess(
        args=[],
        returncode=0,
        stdout=json.dumps(payload).encode("utf-8"),
    )


def video_probe(*, fps: str = "30/1", duration: str = "2.3456") -> dict[str, Any]:
    return {
        "streams": [
            {
                "codec_type": "video",
                "avg_frame_rate": fps,
                "r_frame_rate": fps,
            }
        ],
        "format": {"duration": duration},
    }


def audio_probe(
    *,
    sample_rate: str = "16000",
    channels: int = 1,
) -> dict[str, Any]:
    return {
        "streams": [
            {
                "codec_type": "audio",
                "sample_rate": sample_rate,
                "channels": channels,
            }
        ],
        "format": {"duration": "2.3456"},
    }


def test_normalize_media_builds_30fps_and_mono_16khz_commands(
    tmp_path: Path,
) -> None:
    source = tmp_path / "source.mov"
    source.write_bytes(b"source")
    commands: list[list[str]] = []
    probes: list[list[str]] = []

    def record(command: list[str], *, check: bool) -> None:
        assert check is True
        commands.append(command)
        Path(command[-1]).write_bytes(
            b"normalized" if command[-1].endswith(".mp4") else b"audio"
        )

    def probe(
        command: list[str],
        *,
        check: bool,
        capture_output: bool,
    ) -> subprocess.CompletedProcess[bytes]:
        assert check is True
        assert capture_output is True
        probes.append(command)
        payload = (
            video_probe()
            if command[-1].endswith(".mp4")
            else audio_probe()
        )
        return probe_result(payload)

    outputs = normalize_media(
        source,
        tmp_path / "work",
        video_id="vid03",
        runner=record,
        ffprobe_runner=probe,
    )

    assert len(commands) == 2
    assert len(probes) == 2
    assert commands[0][commands[0].index("-vf") + 1] == "fps=30"
    assert commands[1][commands[1].index("-ac") + 1] == "1"
    assert commands[1][commands[1].index("-ar") + 1] == "16000"
    assert outputs.video.name == "normalized.mp4"
    assert outputs.audio.name == "audio.wav"
    assert outputs.manifest_path.name == MEDIA_MANIFEST_FILENAME
    assert outputs.manifest == MediaManifest(
        video_id="vid03",
        duration_ms=2346,
        fps=30,
        audio_sample_rate_hz=16_000,
        audio_channels=1,
        source_video_sha256=hashlib.sha256(b"source").hexdigest(),
        normalized_video_sha256=hashlib.sha256(b"normalized").hexdigest(),
        audio_sha256=hashlib.sha256(b"audio").hexdigest(),
    )
    assert load_media_manifest(tmp_path / "work") == outputs.manifest


def test_normalize_media_preserves_existing_output(tmp_path: Path) -> None:
    source = tmp_path / "source.mov"
    source.touch()
    output_dir = tmp_path / "work"
    output_dir.mkdir()
    (output_dir / "normalized.mp4").touch()

    with pytest.raises(FileExistsError, match="refusing to overwrite"):
        normalize_media(source, output_dir, video_id="vid03")


def test_normalize_media_requires_video_id_before_running_ffmpeg(
    tmp_path: Path,
) -> None:
    source = tmp_path / "source.mov"
    source.touch()
    called = False

    def record(command: list[str], *, check: bool) -> None:
        nonlocal called
        called = True

    with pytest.raises(ValueError, match="video_id"):
        normalize_media(source, tmp_path / "work", video_id=" ", runner=record)

    assert called is False


def test_normalize_media_rejects_noncanonical_video_probe(
    tmp_path: Path,
) -> None:
    source = tmp_path / "source.mov"
    source.write_bytes(b"source")

    def create_output(command: list[str], *, check: bool) -> None:
        Path(command[-1]).write_bytes(b"output")

    def probe(
        command: list[str],
        *,
        check: bool,
        capture_output: bool,
    ) -> subprocess.CompletedProcess[bytes]:
        payload = (
            video_probe(fps="30000/1001")
            if command[-1].endswith(".mp4")
            else audio_probe()
        )
        return probe_result(payload)

    output_dir = tmp_path / "work"
    with pytest.raises(ValueError, match="must be 30 fps"):
        normalize_media(
            source,
            output_dir,
            video_id="vid03",
            runner=create_output,
            ffprobe_runner=probe,
        )

    assert not (output_dir / MEDIA_MANIFEST_FILENAME).exists()


@pytest.mark.parametrize(
    ("sample_rate", "channels", "message"),
    [
        ("48000", 1, "16000 Hz"),
        ("16000", 2, "must be mono"),
    ],
)
def test_normalize_media_rejects_noncanonical_audio_probe(
    tmp_path: Path,
    sample_rate: str,
    channels: int,
    message: str,
) -> None:
    source = tmp_path / "source.mov"
    source.write_bytes(b"source")

    def create_output(command: list[str], *, check: bool) -> None:
        Path(command[-1]).write_bytes(b"output")

    def probe(
        command: list[str],
        *,
        check: bool,
        capture_output: bool,
    ) -> subprocess.CompletedProcess[bytes]:
        payload = (
            video_probe()
            if command[-1].endswith(".mp4")
            else audio_probe(sample_rate=sample_rate, channels=channels)
        )
        return probe_result(payload)

    output_dir = tmp_path / "work"
    with pytest.raises(ValueError, match=message):
        normalize_media(
            source,
            output_dir,
            video_id="vid03",
            runner=create_output,
            ffprobe_runner=probe,
        )

    assert not (output_dir / MEDIA_MANIFEST_FILENAME).exists()


def test_overwrite_replaces_stale_manifest_only_after_verification(
    tmp_path: Path,
) -> None:
    source = tmp_path / "source.mov"
    source.write_bytes(b"new source")
    output_dir = tmp_path / "work"
    output_dir.mkdir()
    (output_dir / "normalized.mp4").write_bytes(b"old video")
    (output_dir / "audio.wav").write_bytes(b"old audio")
    stale_manifest = output_dir / MEDIA_MANIFEST_FILENAME
    stale_manifest.write_text("stale", encoding="utf-8")
    commands: list[list[str]] = []

    def create_output(command: list[str], *, check: bool) -> None:
        commands.append(command)
        Path(command[-1]).write_bytes(b"new output")

    def probe(
        command: list[str],
        *,
        check: bool,
        capture_output: bool,
    ) -> subprocess.CompletedProcess[bytes]:
        payload = (
            video_probe()
            if command[-1].endswith(".mp4")
            else audio_probe()
        )
        return probe_result(payload)

    outputs = normalize_media(
        source,
        output_dir,
        video_id="vid04",
        overwrite=True,
        runner=create_output,
        ffprobe_runner=probe,
    )

    assert all("-y" in command for command in commands)
    assert outputs.manifest.video_id == "vid04"
    assert load_media_manifest(output_dir) == outputs.manifest
