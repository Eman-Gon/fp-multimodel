"""Detection of target particles at the end of aligned utterances."""

from __future__ import annotations

import unicodedata
from collections.abc import Iterable, Sequence

from fp_multimodel.models import (
    AlignedInterval,
    ParticleDetectionResult,
    ParticleInstance,
    UtteranceAlignment,
)
from fp_multimodel.vocab import PARTICLE_NORMALIZATION, TARGET_PARTICLES


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


def _is_ignorable_trailing_interval(surface_form: str) -> bool:
    """Return whether an interval may follow the final lexical token."""

    stripped = surface_form.strip()
    if not stripped or stripped.casefold() in _SILENCE_LABELS:
        return True

    return all(unicodedata.category(character).startswith("P") for character in stripped)


def detect_final_particle(
    utterance_id: str,
    intervals: Sequence[AlignedInterval],
) -> ParticleInstance | None:
    """Return the utterance-final target particle, if one is present.

    Empty, silence, and punctuation-only intervals at the end of an alignment
    are ignored.  The first remaining interval is the sole candidate, which
    prevents a target token earlier in the utterance from being misclassified
    as utterance-final.
    """

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

    surface_form = final_interval.surface_form.strip()
    canonical_token = PARTICLE_NORMALIZATION.get(surface_form)
    if canonical_token is None:
        return None

    return ParticleInstance(
        instance_id=f"{utterance_id}:fp:{final_interval.start_ms}",
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
    """Detect at most one utterance-final particle in each alignment."""

    particles: list[ParticleInstance] = []
    for alignment in alignments:
        particle = detect_final_particle(
            utterance_id=alignment.utterance_id,
            intervals=alignment.intervals,
        )
        if particle is not None:
            particles.append(particle)

    return ParticleDetectionResult(video_id=video_id, particles=particles)
