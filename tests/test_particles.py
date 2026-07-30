from __future__ import annotations

import pytest
from pydantic import ValidationError

from fp_multimodel.models import (
    AlignedInterval,
    ExtendedParticleCandidate,
    ParticleDetectionResult,
    UtteranceAlignment,
)
from fp_multimodel.particles import (
    detect_extended_particle_candidate,
    detect_final_particle,
    detect_particles,
)
from fp_multimodel.vocab import EXTENDED_PARTICLE_CANDIDATES, TARGET_PARTICLES


def interval(surface_form: str, start_ms: int, end_ms: int) -> AlignedInterval:
    return AlignedInterval(
        surface_form=surface_form,
        start_ms=start_ms,
        end_ms=end_ms,
    )


def test_extended_candidates_are_unique_and_not_silently_promoted() -> None:
    assert len(EXTENDED_PARTICLE_CANDIDATES) == len(
        set(EXTENDED_PARTICLE_CANDIDATES)
    )
    assert set(EXTENDED_PARTICLE_CANDIDATES).isdisjoint(TARGET_PARTICLES)
    assert "哇" in EXTENDED_PARTICLE_CANDIDATES
    assert "了吗吧" in EXTENDED_PARTICLE_CANDIDATES


@pytest.mark.parametrize(("token", "pinyin"), TARGET_PARTICLES.items())
def test_recognizes_each_target_token(token: str, pinyin: str) -> None:
    particle = detect_final_particle(
        "u1",
        [interval("你", 100, 200), interval(token, 200, 275)],
    )

    assert particle is not None
    assert particle.instance_id == "u1"
    assert particle.fp_token == token
    assert particle.fp_pinyin == pinyin
    assert particle.surface_form == token
    assert particle.fp_start_ms == 200
    assert particle.fp_end_ms == 275
    assert particle.utterance_id == "u1"


def test_normalizes_traditional_ma_but_preserves_surface_form() -> None:
    particle = detect_final_particle("u2", [interval("嗎", 510, 590)])

    assert particle is not None
    assert particle.fp_token == "吗"
    assert particle.fp_pinyin == "ma"
    assert particle.surface_form == "嗎"


def test_split_extended_sequence_uses_longest_suffix() -> None:
    intervals = [
        interval("看", 100, 200),
        interval("了", 200, 260),
        interval("吗", 260, 320),
        interval("吧", 320, 380),
    ]

    result = detect_particles(
        "video-1",
        [UtteranceAlignment(utterance_id="u1", intervals=intervals)],
    )

    assert result.particles == []
    assert len(result.candidates) == 1
    candidate = result.candidates[0]
    assert candidate.instance_id == "video-1:u1"
    assert candidate.normalized_candidate == "了吗吧"
    assert candidate.surface_form == "了吗吧"
    assert candidate.start_ms == 200
    assert candidate.end_ms == 380
    assert candidate.source == "mfa_rule"
    assert candidate.confirmed is False
    assert candidate.review_required is True
    assert detect_final_particle("u1", intervals) is None


def test_extended_candidate_normalizes_traditional_ma_only_for_matching() -> None:
    candidate = detect_extended_particle_candidate(
        "u2",
        [
            interval("你", 0, 100),
            interval("了", 100, 160),
            interval("嗎", 160, 220),
        ],
        video_id="video-1",
    )

    assert candidate is not None
    assert candidate.instance_id == "video-1:u2"
    assert candidate.normalized_candidate == "了吗"
    assert candidate.surface_form == "了嗎"
    assert candidate.start_ms == 100
    assert candidate.end_ms == 220


def test_detects_extended_sequence_within_one_aligned_interval() -> None:
    result = detect_particles(
        "video-1",
        [
            UtteranceAlignment(
                utterance_id="u3",
                intervals=[
                    interval("说", 500, 600),
                    interval("了呢吧", 600, 760),
                    interval("。", 760, 770),
                ],
            )
        ],
    )

    assert result.particles == []
    assert len(result.candidates) == 1
    candidate = result.candidates[0]
    assert candidate.normalized_candidate == "了呢吧"
    assert candidate.surface_form == "了呢吧"
    assert candidate.start_ms == 600
    assert candidate.end_ms == 760


def test_accepts_punctuation_attached_to_the_final_particle_label() -> None:
    particle = detect_final_particle("u2", [interval("「嗎？」", 510, 590)])

    assert particle is not None
    assert particle.fp_token == "吗"
    assert particle.surface_form == "嗎"


def test_ignores_trailing_empty_silence_and_punctuation_intervals() -> None:
    particle = detect_final_particle(
        "u3",
        [
            interval("好", 0, 100),
            interval("吧", 100, 180),
            interval("？", 180, 190),
            interval("，…", 190, 200),
            interval("", 200, 240),
            interval("SIL", 240, 300),
            interval("   ", 300, 310),
        ],
    )

    assert particle is not None
    assert particle.fp_token == "吧"
    assert particle.fp_start_ms == 100
    assert particle.fp_end_ms == 180


def test_rejects_target_particle_that_is_mid_utterance() -> None:
    particle = detect_final_particle(
        "u4",
        [
            interval("吗", 0, 80),
            interval("我", 80, 160),
            interval("。", 160, 170),
        ],
    )

    assert particle is None


def test_returns_only_the_final_match() -> None:
    particle = detect_final_particle(
        "u5",
        [
            interval("吗", 0, 80),
            interval("呢", 80, 160),
            interval("！", 160, 170),
        ],
    )

    assert particle is not None
    assert particle.fp_token == "呢"
    assert particle.fp_start_ms == 80


def test_returns_none_when_there_is_no_lexical_interval() -> None:
    assert (
        detect_final_particle(
            "u6",
            [interval("", 0, 10), interval("。", 10, 20), interval("<sil>", 20, 30)],
        )
        is None
    )


def test_batch_helper_returns_one_match_per_matching_utterance() -> None:
    result = detect_particles(
        "video-1",
        [
            UtteranceAlignment(
                utterance_id="u1",
                intervals=[interval("走", 0, 100), interval("啦", 100, 150)],
            ),
            UtteranceAlignment(
                utterance_id="u2",
                intervals=[interval("吗", 200, 250), interval("真的", 250, 400)],
            ),
            UtteranceAlignment(
                utterance_id="u3",
                intervals=[interval("哦", 500, 550), interval("。", 550, 560)],
            ),
        ],
    )

    assert result.video_id == "video-1"
    detected = [
        (particle.utterance_id, particle.fp_token) for particle in result.particles
    ]
    assert detected == [
        ("u1", "啦"),
        ("u3", "哦"),
    ]
    assert [particle.instance_id for particle in result.particles] == [
        "video-1:u1",
        "video-1:u3",
    ]
    assert result.candidates == []


def test_alignment_intervals_must_be_ordered_and_non_overlapping() -> None:
    with pytest.raises(ValidationError, match="ordered and non-overlapping"):
        UtteranceAlignment(
            utterance_id="u1",
            intervals=[
                interval("你", 100, 200),
                interval("吗", 199, 250),
            ],
        )


def test_detection_result_requires_video_scoped_instance_identity() -> None:
    candidate = ExtendedParticleCandidate(
        instance_id="u1",
        normalized_candidate="了吗",
        surface_form="了吗",
        start_ms=100,
        end_ms=200,
        utterance_id="u1",
    )

    with pytest.raises(ValidationError, match="instance_id must equal"):
        ParticleDetectionResult(
            video_id="video-1",
            particles=[],
            candidates=[candidate],
        )
