"""Montreal Forced Aligner command wrapper for Track A4."""

from __future__ import annotations

import subprocess
from collections.abc import Callable
from pathlib import Path


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

