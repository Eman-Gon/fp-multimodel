from pathlib import Path

import pytest
from pydantic import ValidationError

from fp_multimodel.manifest import TrackAManifest, load_manifest, write_manifest
from fp_multimodel.mfa import (
    ACOUSTIC_MODEL,
    DICTIONARY_MODEL,
    align_corpus,
    download_mandarin_models,
)


def test_downloads_required_mandarin_models() -> None:
    commands: list[list[str]] = []

    def record(command: list[str], *, check: bool) -> None:
        assert check is True
        commands.append(command)

    download_mandarin_models(runner=record)

    assert commands == [
        ["mfa", "model", "download", "acoustic", ACOUSTIC_MODEL],
        ["mfa", "model", "download", "dictionary", DICTIONARY_MODEL],
    ]


def test_aligns_with_required_models(tmp_path: Path) -> None:
    corpus = tmp_path / "corpus"
    corpus.mkdir()
    write_manifest(
        corpus,
        TrackAManifest(
            stage="corpus",
            video_id="vid1",
            duration_ms=20_000,
            fps=30,
            transcript_sha256="a" * 64,
            source_audio_sha256="b" * 64,
            normalized_video_sha256="c" * 64,
        ),
    )
    commands: list[list[str]] = []

    def record(command: list[str], *, check: bool) -> None:
        assert check is True
        commands.append(command)

    align_corpus(corpus, tmp_path / "aligned", clean=True, runner=record)

    assert commands[0][0:2] == ["mfa", "align"]
    assert commands[0][3:5] == [DICTIONARY_MODEL, ACOUSTIC_MODEL]
    assert commands[0][-1] == "--clean"
    manifest = load_manifest(tmp_path / "aligned", expected_stage="alignment")
    assert manifest.transcript_sha256 == "a" * 64
    assert manifest.duration_ms == 20_000
    assert manifest.fps == 30
    assert manifest.normalized_video_sha256 == "c" * 64
    assert manifest.dictionary_model == DICTIONARY_MODEL
    assert manifest.acoustic_model == ACOUSTIC_MODEL


def test_track_a_manifest_v1_requires_regeneration(tmp_path: Path) -> None:
    (tmp_path / "track-a-manifest.json").write_text(
        """
        {
          "schema_version": 1,
          "stage": "corpus",
          "video_id": "vid1",
          "duration_ms": 20000,
          "fps": 30,
          "transcript_sha256": "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          "source_audio_sha256": "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
          "normalized_video_sha256": "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
          "dictionary_model": null,
          "acoustic_model": null
        }
        """,
        encoding="utf-8",
    )

    with pytest.raises(ValidationError, match="schema_version"):
        load_manifest(tmp_path, expected_stage="corpus")
