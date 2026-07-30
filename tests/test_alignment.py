from pathlib import Path

import pytest

from fp_multimodel.alignment import parse_textgrid
from fp_multimodel.models import AlignedInterval, UtteranceAlignment


FIXTURE = Path(__file__).parent / "fixtures" / "sample.TextGrid"


def test_parse_textgrid_prefers_words_and_preserves_empty_intervals() -> None:
    alignment = parse_textgrid(FIXTURE, "utt-001")

    assert alignment == UtteranceAlignment(
        utterance_id="utt-001",
        intervals=[
            AlignedInterval(surface_form="你好", start_ms=0, end_ms=500),
            AlignedInterval(surface_form="", start_ms=500, end_ms=751),
            AlignedInterval(surface_form="吧", start_ms=751, end_ms=1250),
        ],
    )


def test_parse_textgrid_uses_explicit_interval_tier() -> None:
    alignment = parse_textgrid(FIXTURE, "utt-001", tier_name="phones")

    assert [interval.surface_form for interval in alignment.intervals] == [
        "n",
        "i3",
        "sil",
    ]


def test_parse_textgrid_reports_missing_requested_tier() -> None:
    with pytest.raises(
        ValueError,
        match=r"no tier named 'syllables'.*available tiers: 'phones', 'words'",
    ):
        parse_textgrid(FIXTURE, "utt-001", tier_name="syllables")


def test_parse_textgrid_rejects_grid_without_interval_tier(tmp_path: Path) -> None:
    point_grid = tmp_path / "points.TextGrid"
    point_grid.write_text(
        """File type = "ooTextFile"
Object class = "TextGrid"

xmin = 0
xmax = 1
tiers? <exists>
size = 1
item []:
    item [1]:
        class = "TextTier"
        name = "words"
        xmin = 0
        xmax = 1
        points: size = 1
        points [1]:
            number = 0.5
            mark = "吧"
""",
        encoding="utf-8",
    )

    with pytest.raises(
        ValueError,
        match=r"No suitable word interval tier.*Available tiers: 'words'",
    ):
        parse_textgrid(point_grid, "utt-001")
