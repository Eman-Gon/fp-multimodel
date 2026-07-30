"""Composition helpers that join MFA output to final-particle detection."""

from __future__ import annotations

import unicodedata
from pathlib import Path

from fp_multimodel.alignment import parse_textgrid
from fp_multimodel.manifest import load_manifest, transcript_sha256
from fp_multimodel.models import (
    AlignedInterval,
    ExtendedParticleCandidate,
    ParticleDetectionResult,
    ParticleDetectionProvenance,
    ParticleInstance,
    Transcript,
    Utterance,
    UtteranceAlignment,
)
from fp_multimodel.particles import detect_particles
from fp_multimodel.vocab import (
    EXTENDED_PARTICLE_CANDIDATES,
    PARTICLE_NORMALIZATION,
)


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


def _strip_trailing_nonlexical(text: str) -> str:
    characters = list(text.strip())
    while characters and (
        characters[-1].isspace()
        or unicodedata.category(characters[-1]).startswith("P")
    ):
        characters.pop()
    return "".join(characters)


def _final_surface_particle(utterance: Utterance) -> str | None:
    text = _strip_trailing_nonlexical(utterance.surface_text)
    if not text:
        return None
    final_character = text[-1]
    return (
        final_character
        if final_character in PARTICLE_NORMALIZATION
        else None
    )


def _final_surface_candidate(
    utterance: Utterance,
    normalized_candidate: str,
) -> str | None:
    text = _strip_trailing_nonlexical(utterance.surface_text)
    if len(text) < len(normalized_candidate):
        return None
    surface_form = text[-len(normalized_candidate) :]
    if surface_form.replace("嗎", "吗") != normalized_candidate:
        return None
    return surface_form


def _expected_terminal_detection(
    utterance: Utterance,
) -> tuple[str, str] | None:
    normalized_text = _strip_trailing_nonlexical(utterance.text)
    candidate_matches = [
        candidate
        for candidate in EXTENDED_PARTICLE_CANDIDATES
        if normalized_text.endswith(candidate)
    ]
    if candidate_matches:
        return ("candidate", max(candidate_matches, key=len))

    surface_form = _final_surface_particle(utterance)
    if surface_form is None:
        return None
    return ("particle", PARTICLE_NORMALIZATION[surface_form])


def _restore_particle_surface_forms(
    result: ParticleDetectionResult,
    transcript: Transcript,
) -> ParticleDetectionResult:
    utterances = {utterance.id: utterance for utterance in transcript.utterances}
    restored_particles: list[ParticleInstance] = []
    restored_candidates: list[ExtendedParticleCandidate] = []

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
        restored_particles.append(
            ParticleInstance.model_validate(
                {
                    **particle.model_dump(),
                    "surface_form": surface_form,
                }
            )
        )

    for candidate in result.candidates:
        surface_form = _final_surface_candidate(
            utterances[candidate.utterance_id],
            candidate.normalized_candidate,
        )
        if surface_form is None:
            raise ValueError(
                f"alignment final candidate for {candidate.utterance_id!r} does "
                "not match the confirmed transcript"
            )
        restored_candidates.append(
            ExtendedParticleCandidate.model_validate(
                {
                    **candidate.model_dump(),
                    "surface_form": surface_form,
                }
            )
        )

    restored_result = ParticleDetectionResult(
        video_id=result.video_id,
        particles=restored_particles,
        candidates=restored_candidates,
    )
    detections = {
        detection.utterance_id: detection
        for detection in [*restored_particles, *restored_candidates]
    }
    for utterance in transcript.utterances:
        expected = _expected_terminal_detection(utterance)
        if expected is None:
            continue
        detection = detections.get(utterance.id)
        if detection is None:
            kind, value = expected
            raise ValueError(
                f"alignment did not detect confirmed transcript {kind} "
                f"{value!r} for utterance {utterance.id!r}; review the "
                "alignment before continuing"
            )

    return restored_result


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
    out_of_bounds = [
        utterance.id
        for utterance in transcript.utterances
        if utterance.end_ms > manifest.duration_ms
    ]
    if out_of_bounds:
        raise ValueError(
            "confirmed transcript extends past the aligned source video: "
            + ", ".join(out_of_bounds)
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

    restored = _restore_particle_surface_forms(
        detect_particles(transcript.video_id, alignments),
        transcript,
    )
    return ParticleDetectionResult(
        video_id=restored.video_id,
        provenance=ParticleDetectionProvenance(
            duration_ms=manifest.duration_ms,
            fps=manifest.fps,
            transcript_sha256=manifest.transcript_sha256,
            source_audio_sha256=manifest.source_audio_sha256,
            normalized_video_sha256=manifest.normalized_video_sha256,
            dictionary_model=manifest.dictionary_model,
            acoustic_model=manifest.acoustic_model,
        ),
        particles=restored.particles,
        candidates=restored.candidates,
    )
