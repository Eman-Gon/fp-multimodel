"""Composition helpers that join MFA output to final-particle detection."""

from __future__ import annotations

from pathlib import Path

from fp_multimodel.alignment import parse_textgrid
from fp_multimodel.models import (
    AlignedInterval,
    ParticleDetectionResult,
    Transcript,
    Utterance,
    UtteranceAlignment,
)
from fp_multimodel.particles import detect_particles


def _find_textgrid(alignment_dir: Path, utterance: Utterance) -> Path:
    candidates = [
        path
        for path in alignment_dir.rglob("*")
        if path.is_file()
        and path.suffix.casefold() == ".textgrid"
        and path.stem == utterance.id
    ]
    if not candidates:
        raise FileNotFoundError(
            f"no TextGrid found for utterance {utterance.id!r} in {alignment_dir}"
        )
    if len(candidates) > 1:
        paths = ", ".join(str(path) for path in candidates)
        raise ValueError(
            f"multiple TextGrids found for utterance {utterance.id!r}: {paths}"
        )
    return candidates[0]


def _to_source_timeline(
    alignment: UtteranceAlignment,
    utterance: Utterance,
) -> UtteranceAlignment:
    """Offset segment-local MFA times onto the source video's timeline."""

    duration_ms = utterance.end_ms - utterance.start_ms
    tolerance_ms = 10
    for interval in alignment.intervals:
        if interval.end_ms > duration_ms + tolerance_ms:
            raise ValueError(
                f"alignment for {utterance.id!r} extends past its "
                f"{duration_ms}ms source segment"
            )

    return UtteranceAlignment(
        utterance_id=alignment.utterance_id,
        intervals=[
            AlignedInterval(
                surface_form=interval.surface_form,
                start_ms=utterance.start_ms + interval.start_ms,
                end_ms=utterance.start_ms + interval.end_ms,
            )
            for interval in alignment.intervals
        ],
    )


def detect_from_mfa_output(
    transcript: Transcript,
    alignment_dir: Path,
    *,
    tier_name: str | None = None,
) -> ParticleDetectionResult:
    """Parse each reviewed TextGrid and detect source-timeline FP instances."""

    unconfirmed = [
        utterance.id
        for utterance in transcript.utterances
        if not utterance.transcript_confirmed
    ]
    if unconfirmed:
        raise ValueError(
            "particle detection requires a human-confirmed transcript; "
            f"unconfirmed utterances: {', '.join(unconfirmed)}"
        )
    if not alignment_dir.is_dir():
        raise FileNotFoundError(
            f"MFA alignment directory does not exist: {alignment_dir}"
        )

    alignments = []
    for utterance in transcript.utterances:
        local_alignment = parse_textgrid(
            _find_textgrid(alignment_dir, utterance),
            utterance.id,
            tier_name=tier_name,
        )
        alignments.append(_to_source_timeline(local_alignment, utterance))

    return detect_particles(transcript.video_id, alignments)

