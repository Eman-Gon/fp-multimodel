import pytest

from fp_multimodel.cli import build_parser


def test_cli_exposes_track_a_stages() -> None:
    help_text = build_parser().format_help()

    assert "normalize" in help_text
    assert "transcribe" in help_text
    assert "prepare-corpus" in help_text
    assert "align" in help_text
    assert "detect-fps" in help_text


def test_normalize_requires_stable_video_id() -> None:
    parser = build_parser()

    with pytest.raises(SystemExit):
        parser.parse_args(
            [
                "normalize",
                "input.mp4",
                "--output-dir",
                "work/vid03",
            ]
        )

    args = parser.parse_args(
        [
            "normalize",
            "input.mp4",
            "--video-id",
            "vid03",
            "--output-dir",
            "work/vid03",
        ]
    )
    assert args.video_id == "vid03"


def test_transcribe_exposes_concrete_whisper_configuration() -> None:
    parser = build_parser()

    with pytest.raises(SystemExit):
        parser.parse_args(
            [
                "transcribe",
                "work/vid03/audio.wav",
                "--output",
                "work/vid03/transcript.draft.json",
            ]
        )

    args = parser.parse_args(
        [
            "transcribe",
            "work/vid03/audio.wav",
            "--video-id",
            "vid03",
            "--output",
            "work/vid03/transcript.draft.json",
            "--model",
            "large-v3",
            "--whisper-bin",
            "whisper-local",
            "--speaker-id",
            "spk_unknown",
        ]
    )

    assert args.video_id == "vid03"
    assert args.model == "large-v3"
    assert args.whisper_bin == "whisper-local"
    assert args.speaker_id == "spk_unknown"
