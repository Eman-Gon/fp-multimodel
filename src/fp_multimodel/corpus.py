"""Prepare human-confirmed utterance audio and labels for MFA."""

from __future__ import annotations

import re
import subprocess
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path

from fp_multimodel.manifest import (
    TrackAManifest,
    file_sha256,
    transcript_sha256,
    write_manifest,
)
from fp_multimodel.models import Transcript, Utterance


CommandRunner = Callable[..., subprocess.CompletedProcess[bytes]]
SAFE_COMPONENT = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.-]*$")
HAN_CHARACTER = re.compile(r"[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]")


@dataclass(frozen=True)
class CorpusEntry:
    """The MFA input pair generated for one utterance."""

    utterance_id: str
    wav: Path
    lab: Path


def _validate_component(value: str, field: str) -> str:
    if not SAFE_COMPONENT.fullmatch(value):
        raise ValueError(
            f"{field} must be an ASCII identifier containing only letters, "
            f"numbers, '.', '_' or '-': {value!r}"
        )
    return value


def _validate_reviewed_utterance(utterance: Utterance) -> None:
    if not utterance.transcript_confirmed:
        raise ValueError(
            f"utterance {utterance.id!r} has not been human-confirmed; "
            "alignment is intentionally blocked"
        )
    if not HAN_CHARACTER.search(utterance.text):
        raise ValueError(
            f"utterance {utterance.id!r} must contain corrected Chinese characters"
        )
    _validate_component(utterance.id, "utterance id")
    _validate_component(utterance.speaker, "speaker id")


def _segment_command(
    source_audio: Path,
    utterance: Utterance,
    output_wav: Path,
    *,
    overwrite: bool,
    ffmpeg_bin: str,
) -> list[str]:
    start_seconds = f"{utterance.start_ms / 1000:.3f}"
    duration_seconds = f"{(utterance.end_ms - utterance.start_ms) / 1000:.3f}"
    return [
        ffmpeg_bin,
        "-hide_banner",
        "-loglevel",
        "error",
        "-y" if overwrite else "-n",
        "-i",
        str(source_audio),
        "-ss",
        start_seconds,
        "-t",
        duration_seconds,
        "-ac",
        "1",
        "-ar",
        "16000",
        "-vn",
        "-c:a",
        "pcm_s16le",
        str(output_wav),
    ]


def prepare_mfa_corpus(
    transcript: Transcript,
    source_audio: Path,
    output_dir: Path,
    *,
    overwrite: bool = False,
    ffmpeg_bin: str = "ffmpeg",
    runner: CommandRunner = subprocess.run,
) -> list[CorpusEntry]:
    """Split audio and write `.lab` files for human-confirmed utterances only."""

    source_audio = source_audio.resolve()
    if not source_audio.is_file():
        raise FileNotFoundError(f"source audio does not exist: {source_audio}")
    if not transcript.utterances:
        raise ValueError("transcript contains no utterances")

    for utterance in transcript.utterances:
        _validate_reviewed_utterance(utterance)

    entries = [
        CorpusEntry(
            utterance_id=utterance.id,
            wav=output_dir / utterance.speaker / f"{utterance.id}.wav",
            lab=output_dir / utterance.speaker / f"{utterance.id}.lab",
        )
        for utterance in transcript.utterances
    ]

    existing = [
        path
        for entry in entries
        for path in (entry.wav, entry.lab)
        if path.exists()
    ]
    if existing and not overwrite:
        paths = ", ".join(str(path) for path in existing)
        raise FileExistsError(f"refusing to overwrite existing corpus files: {paths}")

    for utterance, entry in zip(transcript.utterances, entries, strict=True):
        entry.wav.parent.mkdir(parents=True, exist_ok=True)
        runner(
            _segment_command(
                source_audio,
                utterance,
                entry.wav,
                overwrite=overwrite,
                ffmpeg_bin=ffmpeg_bin,
            ),
            check=True,
        )
        entry.lab.write_text(utterance.text.strip() + "\n", encoding="utf-8")

    write_manifest(
        output_dir,
        TrackAManifest(
            stage="corpus",
            video_id=transcript.video_id,
            transcript_sha256=transcript_sha256(transcript),
            source_audio_sha256=file_sha256(source_audio),
        ),
    )
    return entries
