from pathlib import Path

import pytest

from fp_multimodel.media import normalize_media


def test_normalize_media_builds_30fps_and_mono_16khz_commands(
    tmp_path: Path,
) -> None:
    source = tmp_path / "source.mov"
    source.touch()
    commands: list[list[str]] = []

    def record(command: list[str], *, check: bool) -> None:
        assert check is True
        commands.append(command)

    outputs = normalize_media(source, tmp_path / "work", runner=record)

    assert len(commands) == 2
    assert commands[0][commands[0].index("-vf") + 1] == "fps=30"
    assert commands[1][commands[1].index("-ac") + 1] == "1"
    assert commands[1][commands[1].index("-ar") + 1] == "16000"
    assert outputs.video.name == "normalized.mp4"
    assert outputs.audio.name == "audio.wav"


def test_normalize_media_preserves_existing_output(tmp_path: Path) -> None:
    source = tmp_path / "source.mov"
    source.touch()
    output_dir = tmp_path / "work"
    output_dir.mkdir()
    (output_dir / "normalized.mp4").touch()

    with pytest.raises(FileExistsError, match="refusing to overwrite"):
        normalize_media(source, output_dir)

