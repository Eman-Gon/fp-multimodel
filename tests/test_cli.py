from fp_multimodel.cli import build_parser


def test_cli_exposes_track_a_stages() -> None:
    help_text = build_parser().format_help()

    assert "normalize" in help_text
    assert "prepare-corpus" in help_text
    assert "align" in help_text
    assert "detect-fps" in help_text

