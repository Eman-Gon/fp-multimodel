from __future__ import annotations

import pytest

from fp_multimodel.models import AlignedInterval, UtteranceAlignment
from fp_multimodel.particles import detect_final_particle, detect_particles
from fp_multimodel.vocab import TARGET_PARTICLES


def interval(surface_form: str, start_ms: int, end_ms: int) -> AlignedInterval:
    return AlignedInterval(
        surface_form=surface_form,
        start_ms=start_ms,
        end_ms=end_ms,
    )


@pytest.mark.parametrize(("token", "pinyin"), TARGET_PARTICLES.items())
def test_recognizes_each_target_token(token: str, pinyin: str) -> None:
    particle = detect_final_particle(
        "u1",
        [interval("你", 100, 200), interval(token, 200, 275)],
    )

    assert particle is not None
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
    assert [(particle.utterance_id, particle.fp_token) for particle in result.particles] == [
        ("u1", "啦"),
        ("u3", "哦"),
    ]
