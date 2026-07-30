"""Montreal Forced Aligner command wrapper for Track A4."""

from __future__ import annotations

import subprocess
from collections.abc import Callable
from pathlib import Path

from fp_multimodel.manifest import TrackAManifest, load_manifest, write_manifest


CommandRunner = Callable[..., subprocess.CompletedProcess[bytes]]
ACOUSTIC_MODEL = "mandarin_mfa"
DICTIONARY_MODEL = "mandarin_china_mfa"


def download_mandarin_models(
    *,
    mfa_bin: str = "mfa",
    runner: CommandRunner = subprocess.run,
) -> None:
    """Download the pinned-by-name Mandarin acoustic and dictionary models."""

    runner(
        [mfa_bin, "model", "download", "acoustic", ACOUSTIC_MODEL],
        check=True,
    )
    runner(
        [mfa_bin, "model", "download", "dictionary", DICTIONARY_MODEL],
        check=True,
    )


def align_corpus(
    corpus_dir: Path,
    output_dir: Path,
    *,
    clean: bool = False,
    mfa_bin: str = "mfa",
    runner: CommandRunner = subprocess.run,
) -> None:
    """Run MFA over a prepared corpus and emit TextGrid files."""

    corpus_dir = corpus_dir.resolve()
    if not corpus_dir.is_dir():
        raise FileNotFoundError(f"MFA corpus directory does not exist: {corpus_dir}")
    corpus_manifest = load_manifest(corpus_dir, expected_stage="corpus")
    output_dir.mkdir(parents=True, exist_ok=True)

    command = [
        mfa_bin,
        "align",
        str(corpus_dir),
        DICTIONARY_MODEL,
        ACOUSTIC_MODEL,
        str(output_dir.resolve()),
    ]
    if clean:
        command.append("--clean")
    runner(command, check=True)
    write_manifest(
        output_dir,
        TrackAManifest(
            stage="alignment",
            video_id=corpus_manifest.video_id,
            duration_ms=corpus_manifest.duration_ms,
            fps=corpus_manifest.fps,
            transcript_sha256=corpus_manifest.transcript_sha256,
            source_audio_sha256=corpus_manifest.source_audio_sha256,
            normalized_video_sha256=corpus_manifest.normalized_video_sha256,
            asr_suggestion_artifact_sha256=(
                corpus_manifest.asr_suggestion_artifact_sha256
            ),
            dictionary_model=DICTIONARY_MODEL,
            acoustic_model=ACOUSTIC_MODEL,
        ),
    )
