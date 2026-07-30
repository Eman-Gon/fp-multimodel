from datetime import datetime, timezone

import pytest
from pydantic import ValidationError

from fp_multimodel.models import (
    AsrProvenance,
    AsrSuggestionSegment,
    Clause,
    LinguisticContext,
    ParticleDetectionProvenance,
    ParticleDetectionResult,
    ParticleInstance,
    ParticleScanResult,
    SpeakerProfile,
    Transcript,
    TranscriptBatch,
    TranscriptReview,
    TranscriptSuggestion,
    Utterance,
    VideoReference,
)


def test_utterance_requires_forward_time_range() -> None:
    with pytest.raises(ValidationError, match="end_ms must be greater"):
        Utterance(
            id="u1",
            start_ms=1000,
            end_ms=1000,
            text="你好吗",
            speaker="spkA",
            confidence=0.8,
        )


def test_transcript_rejects_duplicate_utterance_ids() -> None:
    utterance = Utterance(
        id="u1",
        start_ms=1000,
        end_ms=2000,
        text="你好吗",
        speaker="spkA",
        confidence=0.8,
    )
    with pytest.raises(ValidationError, match="utterance ids must be unique"):
        Transcript(video_id="vid1", utterances=[utterance, utterance])


def test_linguistic_context_validates_clause_ranges() -> None:
    context = LinguisticContext(
        discourse_id="d1",
        discourse_text="A asks whether B has eaten.",
        sentence_id="s1",
        sentence_text="你吃饭了吗",
        clauses=[
            Clause(id="c1", text="你吃饭了吗", start_char=0, end_char=5),
        ],
    )

    assert context.clauses[0].text == "你吃饭了吗"


def test_transcript_batch_rejects_duplicate_video_ids() -> None:
    transcript = Transcript(video_id="vid1", utterances=[])
    with pytest.raises(ValidationError, match="video ids must be unique"):
        TranscriptBatch(
            project_id="project-1",
            transcripts=[transcript, transcript],
        )


def test_asr_transcript_requires_immutable_suggestion_lineage() -> None:
    suggestion = TranscriptSuggestion(
        provenance=AsrProvenance(
            provider="openai_whisper_cli",
            model="large-v3",
            language="zh",
            task="transcribe",
            confidence_method="exp_avg_logprob",
            source_audio_sha256="a" * 64,
            provider_output_sha256="b" * 64,
        ),
        segments=(
            AsrSuggestionSegment(
                id="u000001",
                provider_segment_id="0",
                start_ms=1000,
                end_ms=2000,
                surface_text="你好吗",
                speaker="spkA",
            ),
        ),
    )
    utterance = Utterance(
        id="u1",
        start_ms=1000,
        end_ms=2000,
        text="你好吗",
        speaker="spk_unknown",
        confidence=None,
        source_segment_ids=["u000001"],
    )

    transcript = Transcript(
        video_id="vid1",
        transcript_origin="asr",
        asr_suggestion=suggestion,
        asr_suggestion_artifact_sha256="c" * 64,
        utterances=[utterance],
    )
    assert transcript.asr_suggestion is suggestion

    with pytest.raises(ValidationError, match="require the original ASR"):
        Transcript(
            video_id="vid1",
            transcript_origin="asr",
            asr_suggestion_artifact_sha256="c" * 64,
            utterances=[utterance],
        )
    with pytest.raises(ValidationError, match="cannot claim an ASR suggestion"):
        Transcript(
            video_id="vid1",
            transcript_origin="researcher",
            asr_suggestion=suggestion,
            utterances=[],
        )
    with pytest.raises(ValidationError, match="reference the original ASR"):
        Transcript(
            video_id="vid1",
            transcript_origin="asr",
            asr_suggestion=suggestion,
            asr_suggestion_artifact_sha256="c" * 64,
            utterances=[
                utterance.model_copy(
                    update={"source_segment_ids": ["missing-segment"]}
                )
            ],
        )


def test_confirmed_asr_transcript_requires_human_review_and_speaker_profile() -> None:
    suggestion = TranscriptSuggestion(
        provenance=AsrProvenance(
            provider="openai_whisper_cli",
            model="large-v3",
            language="zh",
            task="transcribe",
            confidence_method="exp_avg_logprob",
            source_audio_sha256="a" * 64,
            provider_output_sha256="b" * 64,
        ),
        segments=(
            AsrSuggestionSegment(
                id="source-1",
                provider_segment_id="0",
                start_ms=1000,
                end_ms=2000,
                surface_text="你好吗",
                speaker="spkA",
            ),
        ),
    )
    review = TranscriptReview(
        action="accept",
        reviewer_id="researcher-1",
        reviewed_at=datetime(2026, 7, 30, 20, 0, tzinfo=timezone.utc),
        suggestion_artifact_sha256="c" * 64,
    )

    with pytest.raises(ValidationError, match="explicit transcript_review"):
        Transcript(
            video_id="vid1",
            transcript_origin="asr",
            asr_suggestion=suggestion,
            asr_suggestion_artifact_sha256="c" * 64,
            utterances=[
                Utterance(
                    id="u1",
                    start_ms=1000,
                    end_ms=2000,
                    text="你好吗",
                    speaker="spkA",
                    source_segment_ids=["source-1"],
                    transcript_confirmed=True,
                )
            ],
        )

    with pytest.raises(ValidationError, match="reviewed speaker"):
        Transcript(
            video_id="vid1",
            transcript_origin="asr",
            asr_suggestion=suggestion,
            asr_suggestion_artifact_sha256="c" * 64,
            speakers=[SpeakerProfile(id="spkA", label="Speaker A")],
            utterances=[
                Utterance(
                    id="u1",
                    start_ms=1000,
                    end_ms=2000,
                    text="你好吗",
                    speaker="spk_unknown",
                    source_segment_ids=["source-1"],
                    transcript_confirmed=True,
                    transcript_review=review,
                )
            ],
        )

    with pytest.raises(ValidationError, match="changed ASR utterances"):
        Transcript(
            video_id="vid1",
            transcript_origin="asr",
            asr_suggestion=suggestion,
            asr_suggestion_artifact_sha256="c" * 64,
            speakers=[SpeakerProfile(id="spkA", label="Speaker A")],
            utterances=[
                Utterance(
                    id="u1",
                    start_ms=1000,
                    end_ms=2000,
                    text="你好吧",
                    speaker="spkA",
                    source_segment_ids=["source-1"],
                    transcript_confirmed=True,
                    transcript_review=review,
                )
            ],
        )

    with pytest.raises(ValidationError, match="changed ASR utterances"):
        Transcript(
            video_id="vid1",
            transcript_origin="asr",
            asr_suggestion=suggestion,
            asr_suggestion_artifact_sha256="c" * 64,
            speakers=[SpeakerProfile(id="spkB", label="Speaker B")],
            utterances=[
                Utterance(
                    id="u1",
                    start_ms=1000,
                    end_ms=2000,
                    text="你好吗",
                    speaker="spkB",
                    source_segment_ids=["source-1"],
                    transcript_confirmed=True,
                    transcript_review=review,
                )
            ],
        )

    wrong_artifact_review = review.model_copy(
        update={"suggestion_artifact_sha256": "d" * 64}
    )
    with pytest.raises(ValidationError, match="reference the original ASR"):
        Transcript(
            video_id="vid1",
            transcript_origin="asr",
            asr_suggestion=suggestion,
            asr_suggestion_artifact_sha256="c" * 64,
            speakers=[SpeakerProfile(id="spkA", label="Speaker A")],
            utterances=[
                Utterance(
                    id="u1",
                    start_ms=1000,
                    end_ms=2000,
                    text="你好吗",
                    speaker="spkA",
                    source_segment_ids=["source-1"],
                    transcript_confirmed=True,
                    transcript_review=wrong_artifact_review,
                )
            ],
        )

    accepted = Transcript(
        video_id="vid1",
        transcript_origin="asr",
        asr_suggestion=suggestion,
        asr_suggestion_artifact_sha256="c" * 64,
        speakers=[SpeakerProfile(id="spkA", label="Speaker A")],
        utterances=[
            Utterance(
                id="u1",
                start_ms=1000,
                end_ms=2000,
                text="你好吗",
                speaker="spkA",
                source_segment_ids=["source-1"],
                transcript_confirmed=True,
                transcript_review=review,
            )
        ],
    )
    assert accepted.utterances[0].transcript_review == review


def test_speaker_region_requires_explicit_value_before_confirmation() -> None:
    with pytest.raises(ValidationError, match="confirmed speaker region"):
        SpeakerProfile(
            id="spkA",
            label="Speaker A",
            region_confirmed=True,
        )


def test_transcript_batch_retains_unverified_public_video_reference() -> None:
    batch = TranscriptBatch(
        project_id="project-1",
        transcripts=[Transcript(video_id="vid1", utterances=[])],
        video_references=[
            VideoReference(
                id="yt_OvX0ccTNYDs",
                source_url="https://www.youtube.com/watch?v=OvX0ccTNYDs",
                platform="youtube",
            )
        ],
    )

    assert batch.video_references[0].region_verification == "unverified"


def test_traditional_ma_is_canonicalized_while_surface_text_is_preserved() -> None:
    utterance = Utterance(
        id="u1",
        start_ms=1000,
        end_ms=2000,
        text="你吃飯了嗎？",
        speaker="spkA",
        confidence=0.8,
    )

    assert utterance.text == "你吃飯了吗？"
    assert utterance.surface_text == "你吃飯了嗎？"


def test_confidence_is_bounded() -> None:
    with pytest.raises(ValidationError):
        Utterance(
            id="u1",
            start_ms=1000,
            end_ms=2000,
            text="你好吗",
            speaker="spkA",
            confidence=1.1,
        )


@pytest.mark.parametrize("coercible_value", ["true", 1])
def test_confirmation_must_be_a_json_boolean(coercible_value: object) -> None:
    with pytest.raises(ValidationError):
        Utterance.model_validate(
            {
                "id": "u1",
                "start_ms": 1000,
                "end_ms": 2000,
                "text": "你好吗",
                "speaker": "spkA",
                "confidence": 0.8,
                "transcript_confirmed": coercible_value,
            }
        )


def test_millisecond_fields_do_not_accept_numeric_strings() -> None:
    with pytest.raises(ValidationError):
        Utterance.model_validate(
            {
                "id": "u1",
                "start_ms": "1000",
                "end_ms": 2000,
                "text": "你好吗",
                "speaker": "spkA",
                "confidence": 0.8,
            }
        )


def test_particle_interval_must_have_positive_duration() -> None:
    with pytest.raises(ValidationError, match="fp_end_ms must be greater"):
        ParticleInstance(
            instance_id="vid1:u1",
            fp_token="吗",
            fp_pinyin="ma",
            surface_form="嗎",
            fp_start_ms=1000,
            fp_end_ms=1000,
            utterance_id="u1",
        )


def test_particle_surface_and_pinyin_must_match_canonical_token() -> None:
    with pytest.raises(ValidationError, match="surface_form and fp_token"):
        ParticleInstance(
            instance_id="vid1:u1",
            fp_token="吧",
            fp_pinyin="ba",
            surface_form="嗎",
            fp_start_ms=1000,
            fp_end_ms=1100,
            utterance_id="u1",
        )


def test_particle_detection_result_rejects_duplicate_instance_ids() -> None:
    particle = ParticleInstance(
        instance_id="vid1:u1",
        fp_token="吗",
        fp_pinyin="ma",
        surface_form="嗎",
        fp_start_ms=1000,
        fp_end_ms=1100,
        utterance_id="u1",
    )
    with pytest.raises(ValidationError, match="instance_ids must be unique"):
        ParticleScanResult(video_id="vid1", particles=[particle, particle])


def test_final_particle_artifact_requires_provenance_and_source_bounds() -> None:
    particle = ParticleInstance(
        instance_id="vid1:u1",
        fp_token="吗",
        fp_pinyin="ma",
        surface_form="吗",
        fp_start_ms=1000,
        fp_end_ms=1100,
        utterance_id="u1",
    )

    with pytest.raises(ValidationError, match="provenance"):
        ParticleDetectionResult(video_id="vid1", particles=[particle])

    with pytest.raises(ValidationError, match="must not exceed provenance"):
        ParticleDetectionResult(
            video_id="vid1",
            provenance=ParticleDetectionProvenance(
                duration_ms=1050,
                fps=30,
                transcript_sha256="a" * 64,
                source_audio_sha256="b" * 64,
                normalized_video_sha256="c" * 64,
                dictionary_model="mandarin_china_mfa",
                acoustic_model="mandarin_mfa",
            ),
            particles=[particle],
        )


def test_rule_derived_particle_cannot_claim_human_confirmation() -> None:
    with pytest.raises(ValidationError):
        ParticleInstance(
            instance_id="vid1:u1",
            fp_token="吗",
            fp_pinyin="ma",
            surface_form="吗",
            fp_start_ms=1000,
            fp_end_ms=1100,
            utterance_id="u1",
            confirmed=True,
        )
