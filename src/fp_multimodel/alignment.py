"""Read Montreal Forced Aligner word timings from Praat TextGrids."""

from __future__ import annotations

import re
from os import PathLike
from pathlib import Path

from praatio import textgrid
from praatio.utilities.errors import PraatioException

from fp_multimodel.models import AlignedInterval, UtteranceAlignment


def parse_textgrid(
    path: str | PathLike[str],
    utterance_id: str,
    tier_name: str | None = None,
) -> UtteranceAlignment:
    """Parse one MFA TextGrid into canonical millisecond word intervals.

    Empty labels and aligner-provided silence labels are intentionally retained.
    Downstream particle detection owns the policy for ignoring them.

    Args:
        path: TextGrid file emitted by MFA.
        utterance_id: Identifier to attach to the returned alignment.
        tier_name: Optional exact name of the interval tier to parse. When omitted,
            a tier named ``word``/``words`` (including speaker-prefixed variants)
            is preferred.

    Raises:
        ValueError: If the requested tier is missing or is not an interval tier,
            or if no unambiguous word-like interval tier can be selected.
    """

    textgrid_path = Path(path)
    if not textgrid_path.is_file():
        raise FileNotFoundError(f"TextGrid does not exist: {textgrid_path}")
    try:
        parsed = textgrid.openTextgrid(
            str(textgrid_path),
            includeEmptyIntervals=True,
        )
    except (IndexError, PraatioException, UnicodeError, ValueError) as error:
        raise ValueError(f"could not parse TextGrid {textgrid_path}: {error}") from error
    tier = _select_interval_tier(parsed, textgrid_path, tier_name)

    intervals = [
        AlignedInterval(
            surface_form=entry.label,
            start_ms=_seconds_to_milliseconds(entry.start),
            end_ms=_seconds_to_milliseconds(entry.end),
        )
        for entry in tier.entries
    ]
    return UtteranceAlignment(utterance_id=utterance_id, intervals=intervals)


def _select_interval_tier(
    parsed: textgrid.Textgrid,
    path: Path,
    tier_name: str | None,
) -> textgrid.IntervalTier:
    tier_names = list(parsed.tierNames)

    if tier_name is not None:
        if tier_name not in tier_names:
            raise ValueError(
                f"TextGrid {path} has no tier named {tier_name!r}; "
                f"available tiers: {_format_tier_names(tier_names)}"
            )

        requested = parsed.getTier(tier_name)
        if not isinstance(requested, textgrid.IntervalTier):
            raise ValueError(
                f"Tier {tier_name!r} in TextGrid {path} is not an interval tier"
            )
        return requested

    interval_tiers = [
        (name, tier)
        for name in tier_names
        if isinstance((tier := parsed.getTier(name)), textgrid.IntervalTier)
    ]

    exact_word_tiers = [
        tier
        for name, tier in interval_tiers
        if name.strip().casefold() in {"word", "words"}
    ]
    if len(exact_word_tiers) == 1:
        return exact_word_tiers[0]

    word_tiers = [
        tier for name, tier in interval_tiers if _has_word_name_component(name)
    ]
    if len(word_tiers) == 1:
        return word_tiers[0]

    non_phone_tiers = [
        tier for name, tier in interval_tiers if not _has_phone_name_component(name)
    ]
    if not word_tiers and len(non_phone_tiers) == 1:
        return non_phone_tiers[0]

    raise ValueError(
        f"No suitable word interval tier found in TextGrid {path}; "
        "pass tier_name explicitly. "
        f"Available tiers: {_format_tier_names(tier_names)}"
    )


def _has_word_name_component(name: str) -> bool:
    return bool(re.search(r"(?<![a-z0-9])words?(?![a-z0-9])", name.casefold()))


def _has_phone_name_component(name: str) -> bool:
    return bool(
        re.search(r"(?<![a-z0-9])(?:phones?|phonemes?)(?![a-z0-9])", name.casefold())
    )


def _seconds_to_milliseconds(seconds: float) -> int:
    return round(seconds * 1000)


def _format_tier_names(tier_names: list[str]) -> str:
    if not tier_names:
        return "(none)"
    return ", ".join(repr(name) for name in tier_names)
