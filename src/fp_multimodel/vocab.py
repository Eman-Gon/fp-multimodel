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

# Researcher-supplied forms that are not yet promoted to the validated
# seven-token detector. They include lexical/aspectual forms and stacked
# sequences whose sentence-final function requires contextual review.
EXTENDED_PARTICLE_CANDIDATES: Final[tuple[str, ...]] = (
    "了",
    "的",
    "嘛",
    "罢了",
    "而已",
    "哇",
    "哪",
    "呕",
    "哟",
    "罢",
    "呗",
    "啵",
    "咯",
    "啰",
    "喽",
    "噢",
    "喔",
    "了吗",
    "了吧",
    "了呢",
    "的吗",
    "的吧",
    "的呢",
    "了啊",
    "的啦",
    "的嘛",
    "的哦",
    "了哦",
    "吧啊",
    "呢啊",
    "吗啊",
    "啦啊",
    "呗啊",
    "吧吗",
    "呢吧",
    "了啦",
    "吧啦",
    "呢啦",
    "嘛啦",
    "哦啦",
    "了吗吧",
    "了呢吧",
    "了的吧",
    "了吗呢",
    "了吧呢",
    "了呢吗",
    "的了吗",
    "了吧吗",
    "的吗呢",
    "的呢吗",
    "了的吗",
    "的了吧",
    "的呢吧",
    "了啊吧",
    "了呢啊",
    "了吗啊",
    "了吧啊",
    "的啦啊",
    "的哦啊",
    "了哦啊",
    "吧了呢",
    "吗了呢",
    "呢了吧",
)

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
