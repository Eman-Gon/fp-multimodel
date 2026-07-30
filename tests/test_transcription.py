import hashlib
import json
import math
from pathlib import Path
import subprocess

import pytest
from pydantic import ValidationError

from fp_multimodel.manifest import (
    MediaManifest,
    file_sha256,
    transcript_sha256,
    write_media_manifest,
)
from fp_multimodel.models import Transcript
from fp_multimodel.transcription import (
    AsrRun,
    AsrSegment,
    WhisperCliMandarinAsr,
    create_draft_transcript,
    create_draft_transcript_batch,
)


class FakeMandarinAsr:
    def transcribe(self, audio: Path) -> AsrRun:
        assert audio.name == "audio.wav"
        return AsrRun(
            provider="fake_mandarin_asr",
            model="fake-model-1",
            language="zh",
            task="transcribe",
            confidence_method="provider",
            provider_output_sha256="d" * 64,
            segments=(
                AsrSegment(
                    id="u1",
                    provider_segment_id="provider-7",
                    start_ms=12_400,
                    end_ms=15_100,
                    text="你吃飯了嗎",
                    speaker="spkA",
                    confidence=0.82,
                ),
            ),
        )


def make_verified_audio(
    directory: Path,
    *,
    video_id: str = "vid1",
    duration_ms: int = 20_000,
) -> Path:
    directory.mkdir(parents=True, exist_ok=True)
    audio = directory / "audio.wav"
    audio.write_bytes(b"verified ASR audio")
    write_media_manifest(
        directory,
        MediaManifest(
            video_id=video_id,
            duration_ms=duration_ms,
            fps=30,
            audio_sample_rate_hz=16_000,
            audio_channels=1,
            source_video_sha256="a" * 64,
            normalized_video_sha256="b" * 64,
            audio_sha256=file_sha256(audio),
        ),
    )
    return audio


def test_provider_output_is_always_an_unconfirmed_normalized_draft(
    tmp_path: Path,
) -> None:
    audio = make_verified_audio(tmp_path)

    transcript = create_draft_transcript("vid1", audio, FakeMandarinAsr())

    assert transcript.transcript_origin == "asr"
    assert transcript.asr_suggestion is not None
    assert transcript.asr_suggestion.provenance.provider == "fake_mandarin_asr"
    assert (
        transcript.asr_suggestion.provenance.source_audio_sha256
        == file_sha256(audio)
    )
    suggestion = transcript.asr_suggestion.segments[0]
    assert suggestion.provider_segment_id == "provider-7"
    assert suggestion.surface_text == "你吃飯了嗎"
    assert suggestion.speaker == "spkA"
    assert suggestion.confidence == 0.82

    utterance = transcript.utterances[0]
    assert utterance.text == "你吃飯了吗"
    assert utterance.surface_text == "你吃飯了嗎"
    assert utterance.source_segment_ids == ["u1"]
    assert utterance.transcript_confirmed is False

    with pytest.raises(ValidationError, match="frozen"):
        transcript.asr_suggestion = None
    with pytest.raises(ValidationError, match="frozen"):
        suggestion.surface_text = "被覆盖"


def test_reviewed_working_copy_can_change_without_losing_asr_suggestion(
    tmp_path: Path,
) -> None:
    draft = create_draft_transcript(
        "vid1",
        make_verified_audio(tmp_path),
        FakeMandarinAsr(),
    )
    original_suggestion = draft.asr_suggestion
    draft_hash = transcript_sha256(draft)
    payload = draft.model_dump(mode="json")
    payload["utterances"] = [
        {
            **payload["utterances"][0],
            "id": "u-reviewed",
            "start_ms": 12_450,
            "end_ms": 15_050,
            "text": "你吃饭了吗",
            "surface_text": "你吃饭了吗",
            "speaker": "spkB",
            "transcript_confirmed": True,
        }
    ]

    reviewed = Transcript.model_validate_json(
        json.dumps(payload, ensure_ascii=False)
    )

    assert reviewed.asr_suggestion == original_suggestion
    assert reviewed.utterances[0].source_segment_ids == ["u1"]
    assert reviewed.utterances[0].text == "你吃饭了吗"
    assert reviewed.utterances[0].speaker == "spkB"
    assert reviewed.utterances[0].transcript_confirmed is True
    assert transcript_sha256(reviewed) != draft_hash


def test_multiple_videos_remain_separate_in_a_draft_batch(tmp_path: Path) -> None:
    first_audio = make_verified_audio(tmp_path / "first", video_id="vid1")
    second_audio = make_verified_audio(tmp_path / "second", video_id="vid2")

    batch = create_draft_transcript_batch(
        "project-1",
        [("vid1", first_audio), ("vid2", second_audio)],
        FakeMandarinAsr(),
    )

    assert [item.video_id for item in batch.transcripts] == ["vid1", "vid2"]
    assert all(item.utterances[0].start_ms == 12_400 for item in batch.transcripts)
    assert all(item.asr_suggestion is not None for item in batch.transcripts)


def test_draft_transcription_rejects_cross_video_mutated_and_out_of_bounds_audio(
    tmp_path: Path,
) -> None:
    cross_video = make_verified_audio(tmp_path / "cross", video_id="vid2")
    with pytest.raises(ValueError, match="does not match media video_id"):
        create_draft_transcript("vid1", cross_video, FakeMandarinAsr())

    mutated = make_verified_audio(tmp_path / "mutated")
    mutated.write_bytes(b"changed after manifest")
    with pytest.raises(ValueError, match="does not match its media manifest"):
        create_draft_transcript("vid1", mutated, FakeMandarinAsr())

    too_short = make_verified_audio(tmp_path / "short", duration_ms=15_000)
    with pytest.raises(ValueError, match="extend past the source video duration"):
        create_draft_transcript("vid1", too_short, FakeMandarinAsr())


def test_whisper_cli_adapter_forces_mandarin_and_preserves_raw_diagnostics(
    tmp_path: Path,
) -> None:
    audio = tmp_path / "audio.wav"
    audio.write_bytes(b"audio")
    payload = {
        "text": "你吃飯了嗎 好吧",
        "language": "zh",
        "segments": [
            {
                "id": 10,
                "start": 0.3335,
                "end": 1.2345,
                "text": " 你吃飯了嗎 ",
                "avg_logprob": -0.2,
                "no_speech_prob": 0.01,
                "compression_ratio": 1.1,
                "temperature": 0,
            },
            {
                "id": 11,
                "start": 1.2345,
                "end": 2.0,
                "text": "好吧",
            },
        ],
    }
    raw_output = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    commands: list[list[str]] = []

    def run(
        command: list[str],
        *,
        check: bool,
        capture_output: bool,
    ) -> subprocess.CompletedProcess[bytes]:
        assert check is True
        assert capture_output is True
        commands.append(command)
        output_dir = Path(command[command.index("--output_dir") + 1])
        (output_dir / "audio.json").write_bytes(raw_output)
        return subprocess.CompletedProcess(command, 0, stdout=b"", stderr=b"")

    result = WhisperCliMandarinAsr(
        whisper_bin="whisper-test",
        model="large-v3",
        runner=run,
    ).transcribe(audio)

    assert commands[0][0] == "whisper-test"
    assert commands[0][commands[0].index("--model") + 1] == "large-v3"
    assert commands[0][commands[0].index("--language") + 1] == "zh"
    assert commands[0][commands[0].index("--task") + 1] == "transcribe"
    assert result.provider == "openai_whisper_cli"
    assert result.provider_output_sha256 == hashlib.sha256(raw_output).hexdigest()
    assert [segment.id for segment in result.segments] == ["u000001", "u000002"]
    assert result.segments[0].provider_segment_id == "10"
    assert result.segments[0].start_ms == 334
    assert result.segments[0].end_ms == 1_235
    assert result.segments[0].text == "你吃飯了嗎"
    assert result.segments[0].confidence == pytest.approx(math.exp(-0.2))
    assert {
        diagnostic.name: diagnostic.value
        for diagnostic in result.segments[0].diagnostics
    } == {
        "avg_logprob": -0.2,
        "no_speech_prob": 0.01,
        "compression_ratio": 1.1,
        "temperature": 0.0,
    }
    assert result.segments[1].confidence is None


def test_whisper_cli_adapter_rejects_non_mandarin_or_missing_json(
    tmp_path: Path,
) -> None:
    audio = tmp_path / "audio.wav"
    audio.write_bytes(b"audio")

    def wrong_language(
        command: list[str],
        *,
        check: bool,
        capture_output: bool,
    ) -> subprocess.CompletedProcess[bytes]:
        output_dir = Path(command[command.index("--output_dir") + 1])
        (output_dir / "audio.json").write_text(
            '{"language":"en","segments":[]}',
            encoding="utf-8",
        )
        return subprocess.CompletedProcess(command, 0, stdout=b"", stderr=b"")

    with pytest.raises(ValueError, match="Mandarin language code"):
        WhisperCliMandarinAsr(runner=wrong_language).transcribe(audio)

    def no_output(
        command: list[str],
        *,
        check: bool,
        capture_output: bool,
    ) -> subprocess.CompletedProcess[bytes]:
        return subprocess.CompletedProcess(command, 0, stdout=b"", stderr=b"")

    with pytest.raises(FileNotFoundError, match="did not create"):
        WhisperCliMandarinAsr(runner=no_output).transcribe(audio)
