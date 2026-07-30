import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path

import pytest

from fp_multimodel.corpus import prepare_mfa_corpus
from fp_multimodel.manifest import (
    MediaManifest,
    asr_suggestion_artifact_sha256,
    file_sha256,
    load_manifest,
    transcript_sha256,
    write_asr_suggestion_artifact,
    write_media_manifest,
)
from fp_multimodel.models import (
    AsrProvenance,
    AsrSuggestionArtifact,
    AsrSuggestionSegment,
    SpeakerProfile,
    Transcript,
    TranscriptReview,
    TranscriptSuggestion,
    Utterance,
)


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


def make_verified_audio(
    directory: Path,
    *,
    video_id: str = "vid1",
    duration_ms: int = 20_000,
) -> Path:
    audio = directory / "audio.wav"
    audio.write_bytes(b"verified audio")
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
    audio = make_verified_audio(tmp_path)
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
    assert manifest.duration_ms == 20_000
    assert manifest.fps == 30
    assert manifest.normalized_video_sha256 == "b" * 64
    assert manifest.transcript_sha256 == transcript_sha256(make_transcript())


def test_prepare_corpus_aligns_canonical_ma_not_traditional_surface(
    tmp_path: Path,
) -> None:
    audio = make_verified_audio(tmp_path)
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


def test_prepare_corpus_rejects_cross_video_audio(tmp_path: Path) -> None:
    audio = make_verified_audio(tmp_path, video_id="vid2")

    with pytest.raises(ValueError, match="does not match media video_id"):
        prepare_mfa_corpus(
            make_transcript(),
            audio,
            tmp_path / "corpus",
            runner=lambda _command, *, check: None,
        )


def test_prepare_corpus_rejects_audio_changed_after_verification(
    tmp_path: Path,
) -> None:
    audio = make_verified_audio(tmp_path)
    audio.write_bytes(b"different audio")

    with pytest.raises(ValueError, match="does not match its media manifest"):
        prepare_mfa_corpus(
            make_transcript(),
            audio,
            tmp_path / "corpus",
            runner=lambda _command, *, check: None,
        )


def test_prepare_corpus_rejects_utterance_past_video_duration(
    tmp_path: Path,
) -> None:
    audio = make_verified_audio(tmp_path, duration_ms=15_000)

    with pytest.raises(ValueError, match="extend past the source video duration"):
        prepare_mfa_corpus(
            make_transcript(),
            audio,
            tmp_path / "corpus",
            runner=lambda _command, *, check: None,
        )


def test_prepare_corpus_rejects_asr_suggestion_from_different_audio(
    tmp_path: Path,
) -> None:
    audio = make_verified_audio(tmp_path)
    reviewed = make_transcript()
    provider_output_json = json.dumps(
        {"segments": [{"id": 0, "text": "你吃饭了吗"}]},
        ensure_ascii=False,
        separators=(",", ":"),
    )
    provider_output_sha256 = hashlib.sha256(
        provider_output_json.encode("utf-8")
    ).hexdigest()
    suggestion = TranscriptSuggestion(
        provenance=AsrProvenance(
            provider="openai_whisper_cli",
            model="large-v3",
            language="zh",
            task="transcribe",
            confidence_method="exp_avg_logprob",
            source_audio_sha256="f" * 64,
            provider_output_sha256=provider_output_sha256,
        ),
        segments=(
            AsrSuggestionSegment(
                id="source-u1",
                provider_segment_id="0",
                start_ms=12_400,
                end_ms=15_100,
                surface_text="你吃饭了吗",
                confidence=0.82,
            ),
        ),
    )
    artifact = AsrSuggestionArtifact(
        video_id=reviewed.video_id,
        suggestion=suggestion,
        provider_output_json=provider_output_json,
    )
    write_asr_suggestion_artifact(tmp_path, artifact)
    reviewed = Transcript(
        video_id=reviewed.video_id,
        transcript_origin="asr",
        asr_suggestion=suggestion,
        asr_suggestion_artifact_sha256=asr_suggestion_artifact_sha256(
            artifact
        ),
        speakers=[SpeakerProfile(id="spkA", label="Speaker A")],
        utterances=[
            reviewed.utterances[0].model_copy(
                update={
                    "source_segment_ids": ["source-u1"],
                    "transcript_review": TranscriptReview(
                        action="accept",
                        reviewer_id="researcher-1",
                        reviewed_at=datetime(
                            2026,
                            7,
                            30,
                            20,
                            0,
                            tzinfo=timezone.utc,
                        ),
                    ),
                }
            )
        ],
    )

    with pytest.raises(ValueError, match="belongs to different audio"):
        prepare_mfa_corpus(
            reviewed,
            audio,
            tmp_path / "corpus",
            runner=lambda _command, *, check: None,
        )
