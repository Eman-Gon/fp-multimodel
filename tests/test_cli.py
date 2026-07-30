import pytest

from fp_multimodel import cli
from fp_multimodel.cli import build_parser
from fp_multimodel.models import Transcript


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


def test_transcribe_dispatch_writes_the_provider_draft(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    parser = build_parser()
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
            "--force",
        ]
    )
    calls: dict[str, object] = {}

    class FakeWhisper:
        def __init__(self, *, whisper_bin: str, model: str) -> None:
            calls["whisper_bin"] = whisper_bin
            calls["model"] = model

    def fake_create(
        video_id: str,
        audio: object,
        provider: object,
        *,
        default_speaker: str,
    ) -> Transcript:
        calls["video_id"] = video_id
        calls["audio"] = audio
        calls["provider"] = provider
        calls["speaker"] = default_speaker
        return Transcript(video_id=video_id, utterances=[])

    def fake_write(
        output: object,
        transcript: object,
        *,
        overwrite: bool,
    ) -> None:
        calls["output"] = output
        calls["transcript"] = transcript
        calls["overwrite"] = overwrite

    monkeypatch.setattr(cli, "WhisperCliMandarinAsr", FakeWhisper)
    monkeypatch.setattr(cli, "create_draft_transcript", fake_create)
    monkeypatch.setattr(cli, "write_model", fake_write)

    cli._dispatch(args)

    assert calls["whisper_bin"] == "whisper-local"
    assert calls["model"] == "large-v3"
    assert calls["video_id"] == "vid03"
    assert calls["speaker"] == "spk_unknown"
    assert calls["overwrite"] is True
