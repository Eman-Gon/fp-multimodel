"""Detection of target particles at the end of aligned utterances."""

from __future__ import annotations

import unicodedata
from collections.abc import Iterable, Sequence

from fp_multimodel.models import (
    AlignedInterval,
    ExtendedParticleCandidate,
    ParticleDetectionResult,
    ParticleInstance,
    UtteranceAlignment,
)
from fp_multimodel.vocab import (
    EXTENDED_PARTICLE_CANDIDATES,
    PARTICLE_NORMALIZATION,
    TARGET_PARTICLES,
)

# MFA normally represents silence with an empty word-tier interval.  The named
# forms cover common labels found in imported or hand-edited alignments.
_SILENCE_LABELS = frozenset(
    {
        "sil",
        "silence",
        "sp",
        "<eps>",
        "<sil>",
        "<sp>",
        "[sil]",
        "[sp]",
    }
)

_EXTENDED_CANDIDATE_SET = frozenset(EXTENDED_PARTICLE_CANDIDATES)
_MAX_EXTENDED_CANDIDATE_LENGTH = max(map(len, EXTENDED_PARTICLE_CANDIDATES))


def _is_ignorable_trailing_interval(surface_form: str) -> bool:
    """Return whether an interval may follow the final lexical token."""

    stripped = surface_form.strip()
    if not stripped or stripped.casefold() in _SILENCE_LABELS:
        return True

    return all(
        unicodedata.category(character).startswith("P") for character in stripped
    )


def _particle_surface_form(surface_form: str) -> str:
    """Remove non-spoken boundary punctuation from an aligned token label."""

    characters = list(surface_form.strip())
    while characters and unicodedata.category(characters[0]).startswith("P"):
        characters.pop(0)
    while characters and unicodedata.category(characters[-1]).startswith("P"):
        characters.pop()
    return "".join(characters)


def _normalize_candidate_surface(surface_form: str) -> str:
    """Normalize only the traditional target form allowed by the contract."""

    return surface_form.replace("嗎", "吗")


def detect_extended_particle_candidate(
    utterance_id: str,
    intervals: Sequence[AlignedInterval],
    *,
    video_id: str | None = None,
) -> ExtendedParticleCandidate | None:
    """Return the longest researcher-supplied suffix for human review.

    Candidate text is assembled across MFA lexical intervals after ignoring
    silence and punctuation-only labels. A match remains a candidate: this
    helper never promotes it to the validated seven-token inventory.
    """

    lexical_intervals = [
        (interval, _particle_surface_form(interval.surface_form))
        for interval in intervals
        if not _is_ignorable_trailing_interval(interval.surface_form)
    ]
    lexical_intervals = [
        (interval, surface_form)
        for interval, surface_form in lexical_intervals
        if surface_form
    ]
    if not lexical_intervals:
        return None

    matched_intervals: list[tuple[AlignedInterval, str]] | None = None
    normalized_candidate: str | None = None
    suffix_intervals: list[tuple[AlignedInterval, str]] = []
    for interval_and_surface in reversed(lexical_intervals):
        suffix_intervals.insert(0, interval_and_surface)
        normalized_suffix = "".join(
            _normalize_candidate_surface(surface_form)
            for _, surface_form in suffix_intervals
        )
        if len(normalized_suffix) > _MAX_EXTENDED_CANDIDATE_LENGTH:
            break
        if normalized_suffix in _EXTENDED_CANDIDATE_SET:
            matched_intervals = list(suffix_intervals)
            normalized_candidate = normalized_suffix

    if matched_intervals is None or normalized_candidate is None:
        return None

    first_interval = matched_intervals[0][0]
    final_interval = matched_intervals[-1][0]
    surface_form = "".join(
        interval_surface for _, interval_surface in matched_intervals
    )
    return ExtendedParticleCandidate(
        instance_id=(
            f"{video_id}:{utterance_id}" if video_id is not None else utterance_id
        ),
        normalized_candidate=normalized_candidate,
        surface_form=surface_form,
        start_ms=first_interval.start_ms,
        end_ms=final_interval.end_ms,
        utterance_id=utterance_id,
    )


def detect_final_particle(
    utterance_id: str,
    intervals: Sequence[AlignedInterval],
    *,
    video_id: str | None = None,
) -> ParticleInstance | None:
    """Return the utterance-final target particle, if one is present.

    Empty, silence, and punctuation-only intervals at the end of an alignment
    are ignored.  The first remaining interval is the sole candidate, which
    prevents a target token earlier in the utterance from being misclassified
    as utterance-final.
    """

    if (
        detect_extended_particle_candidate(
            utterance_id,
            intervals,
            video_id=video_id,
        )
        is not None
    ):
        return None

    final_interval = next(
        (
            interval
            for interval in reversed(intervals)
            if not _is_ignorable_trailing_interval(interval.surface_form)
        ),
        None,
    )
    if final_interval is None:
        return None

    surface_form = _particle_surface_form(final_interval.surface_form)
    canonical_token = PARTICLE_NORMALIZATION.get(surface_form)
    if canonical_token is None:
        return None

    return ParticleInstance(
        instance_id=(
            f"{video_id}:{utterance_id}" if video_id is not None else utterance_id
        ),
        fp_token=canonical_token,
        fp_pinyin=TARGET_PARTICLES[canonical_token],
        surface_form=surface_form,
        fp_start_ms=final_interval.start_ms,
        fp_end_ms=final_interval.end_ms,
        utterance_id=utterance_id,
    )


def detect_particles(
    video_id: str,
    alignments: Iterable[UtteranceAlignment],
) -> ParticleDetectionResult:
    """Detect one canonical particle or review-only candidate per alignment."""

    particles: list[ParticleInstance] = []
    candidates: list[ExtendedParticleCandidate] = []
    for alignment in alignments:
        candidate = detect_extended_particle_candidate(
            utterance_id=alignment.utterance_id,
            intervals=alignment.intervals,
            video_id=video_id,
        )
        if candidate is not None:
            candidates.append(candidate)
            continue

        particle = detect_final_particle(
            utterance_id=alignment.utterance_id,
            intervals=alignment.intervals,
            video_id=video_id,
        )
        if particle is not None:
            particles.append(particle)

    return ParticleDetectionResult(
        video_id=video_id,
        particles=particles,
        candidates=candidates,
    )
