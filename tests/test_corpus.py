from pathlib import Path

import pytest

from fp_multimodel.corpus import prepare_mfa_corpus
from fp_multimodel.manifest import load_manifest, transcript_sha256
from fp_multimodel.models import Transcript, Utterance


def make_transcript(*, confirmed: bool = True) -> Transcript:
    return Transcript(
        video_id="vid1",
        utterances=[
            Utterance(
                id="u1",
                start_ms=12_400,
                end_ms=15_100,
                text="你吃饭了吗",
                speaker="spkA",
                confidence=0.82,
                transcript_confirmed=confirmed,
            )
        ],
    )


def test_prepare_corpus_blocks_unreviewed_transcript(tmp_path: Path) -> None:
    audio = tmp_path / "audio.wav"
    audio.touch()

    with pytest.raises(ValueError, match="has not been human-confirmed"):
        prepare_mfa_corpus(
            make_transcript(confirmed=False),
            audio,
            tmp_path / "corpus",
        )


def test_prepare_corpus_writes_lab_and_precise_segment_command(
    tmp_path: Path,
) -> None:
    audio = tmp_path / "audio.wav"
    audio.touch()
    commands: list[list[str]] = []

    def record(command: list[str], *, check: bool) -> None:
        assert check is True
        commands.append(command)

    entries = prepare_mfa_corpus(
        make_transcript(),
        audio,
        tmp_path / "corpus",
        runner=record,
    )

    assert entries[0].lab.read_text(encoding="utf-8") == "你吃饭了吗\n"
    assert entries[0].wav == tmp_path / "corpus" / "spkA" / "u1.wav"
    assert commands[0][commands[0].index("-ss") + 1] == "12.400"
    assert commands[0][commands[0].index("-t") + 1] == "2.700"
    assert commands[0][commands[0].index("-ar") + 1] == "16000"
    manifest = load_manifest(tmp_path / "corpus", expected_stage="corpus")
    assert manifest.video_id == "vid1"
    assert manifest.transcript_sha256 == transcript_sha256(make_transcript())


def test_prepare_corpus_aligns_canonical_ma_not_traditional_surface(
    tmp_path: Path,
) -> None:
    audio = tmp_path / "audio.wav"
    audio.touch()
    reviewed = make_transcript()
    reviewed.utterances[0] = Utterance(
        id="u1",
        start_ms=12_400,
        end_ms=15_100,
        text="你吃飯了嗎",
        speaker="spkA",
        confidence=0.82,
        transcript_confirmed=True,
    )

    entries = prepare_mfa_corpus(
        reviewed,
        audio,
        tmp_path / "corpus",
        runner=lambda _command, *, check: None,
    )

    assert entries[0].lab.read_text(encoding="utf-8") == "你吃飯了吗\n"
    assert reviewed.utterances[0].surface_text == "你吃飯了嗎"
