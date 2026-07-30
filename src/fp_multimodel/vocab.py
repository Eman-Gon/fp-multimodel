"""Controlled vocabularies for Track A.

Keep these values fixed: downstream graph queries depend on exact matching.
"""

from __future__ import annotations

from typing import Final, Literal


TARGET_PARTICLES: Final[dict[str, str]] = {
    "呢": "ne",
    "吧": "ba",
    "哦": "ou",
    "啊": "a",
    "啦": "la",
    "呀": "ya",
    "吗": "ma",
}

PARTICLE_NORMALIZATION: Final[dict[str, str]] = {
    **{token: token for token in TARGET_PARTICLES},
    "嗎": "吗",
}

SentenceType = Literal[
    "declarative",
    "polar_question",
    "content_question",
    "alternative_question",
    "imperative",
    "exclamative",
]

SENTENCE_TYPES: Final[tuple[str, ...]] = (
    "declarative",
    "polar_question",
    "content_question",
    "alternative_question",
    "imperative",
    "exclamative",
)

