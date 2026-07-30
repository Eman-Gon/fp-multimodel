"""Composition helpers that join MFA output to final-particle detection."""

from __future__ import annotations

import unicodedata
from pathlib import Path

from fp_multimodel.alignment import parse_textgrid
from fp_multimodel.manifest import load_manifest, transcript_sha256
from fp_multimodel.models import (
    AlignedInterval,
    ParticleDetectionResult,
    ParticleInstance,
    Transcript,
    Utterance,
    UtteranceAlignment,
)
from fp_multimodel.particles import detect_particles
from fp_multimodel.vocab import PARTICLE_NORMALIZATION


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


def _final_surface_particle(utterance: Utterance) -> str | None:
    for character in reversed(utterance.surface_text.strip()):
        if character.isspace() or unicodedata.category(character).startswith("P"):
            continue
        return character if character in PARTICLE_NORMALIZATION else None
    return None


def _restore_particle_surface_forms(
    result: ParticleDetectionResult,
    transcript: Transcript,
) -> ParticleDetectionResult:
    utterances = {utterance.id: utterance for utterance in transcript.utterances}
    restored: list[ParticleInstance] = []

    for particle in result.particles:
        surface_form = _final_surface_particle(utterances[particle.utterance_id])
        if (
            surface_form is None
            or PARTICLE_NORMALIZATION[surface_form] != particle.fp_token
        ):
            raise ValueError(
                f"alignment final particle for {particle.utterance_id!r} does not "
                "match the confirmed transcript"
            )
        restored.append(
            ParticleInstance.model_validate(
                {
                    **particle.model_dump(),
                    "surface_form": surface_form,
                }
            )
        )

    return ParticleDetectionResult(video_id=result.video_id, particles=restored)


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
    manifest = load_manifest(alignment_dir, expected_stage="alignment")
    if manifest.video_id != transcript.video_id:
        raise ValueError(
            f"alignment belongs to video {manifest.video_id!r}, "
            f"not {transcript.video_id!r}"
        )
    if manifest.transcript_sha256 != transcript_sha256(transcript):
        raise ValueError(
            "alignment was produced from a different transcript revision; "
            "prepare and align the reviewed corpus again"
        )

    alignments = []
    for utterance in transcript.utterances:
        local_alignment = parse_textgrid(
            _find_textgrid(alignment_dir, utterance),
            utterance.id,
            tier_name=tier_name,
        )
        alignments.append(_to_source_timeline(local_alignment, utterance))

    return _restore_particle_surface_forms(
        detect_particles(transcript.video_id, alignments),
        transcript,
    )
