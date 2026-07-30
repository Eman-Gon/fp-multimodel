"""Typed JSON contracts shared by the Track A pipeline stages."""

from __future__ import annotations

import hashlib
import json
from datetime import datetime
from typing import Annotated, Literal

from pydantic import (
    AwareDatetime,
    BaseModel,
    ConfigDict,
    Field,
    field_validator,
    model_validator,
)

from fp_multimodel.vocab import (
    EXTENDED_PARTICLE_CANDIDATES,
    PARTICLE_NORMALIZATION,
    TARGET_PARTICLES,
)

Milliseconds = Annotated[int, Field(ge=0)]
Confidence = Annotated[float, Field(ge=0.0, le=1.0)]


class StrictModel(BaseModel):
    """Base model that rejects misspelled or unexpected input fields."""

    model_config = ConfigDict(extra="forbid", strict=True)


class FrozenStrictModel(StrictModel):
    """Strict immutable record used for original model suggestions."""

    model_config = ConfigDict(frozen=True)


class AsrDiagnostic(FrozenStrictModel):
    """One provider-native numeric diagnostic retained without reinterpretation."""

    name: str = Field(min_length=1)
    value: float = Field(allow_inf_nan=False)


class AsrSuggestionSegment(FrozenStrictModel):
    """One immutable segment exactly as proposed by the ASR stage."""

    id: str = Field(min_length=1)
    provider_segment_id: str = Field(min_length=1)
    start_ms: Milliseconds
    end_ms: Milliseconds
    surface_text: str = Field(min_length=1)
    speaker: str | None = None
    confidence: Confidence | None = None
    diagnostics: tuple[AsrDiagnostic, ...] = Field(default_factory=tuple)

    @model_validator(mode="after")
    def validate_time_range(self) -> "AsrSuggestionSegment":
        if self.end_ms <= self.start_ms:
            raise ValueError("end_ms must be greater than start_ms")
        return self


class AsrProvenance(FrozenStrictModel):
    """Immutable identity for the provider run that produced a draft."""

    provider: str = Field(min_length=1)
    model: str = Field(min_length=1)
    language: Literal["zh"]
    task: Literal["transcribe"]
    confidence_method: Literal["provider", "exp_avg_logprob"]
    source_audio_sha256: str = Field(pattern=r"^[0-9a-f]{64}$")
    provider_output_sha256: str = Field(pattern=r"^[0-9a-f]{64}$")


class TranscriptSuggestion(FrozenStrictModel):
    """Original ASR segment suggestions, separate from the reviewed transcript."""

    schema_version: Literal[1] = 1
    provenance: AsrProvenance
    segments: tuple[AsrSuggestionSegment, ...] = Field(default_factory=tuple)

    @model_validator(mode="after")
    def validate_segments(self) -> "TranscriptSuggestion":
        segment_ids = [segment.id for segment in self.segments]
        if len(segment_ids) != len(set(segment_ids)):
            raise ValueError("ASR suggestion segment ids must be unique")
        provider_ids = [segment.provider_segment_id for segment in self.segments]
        if len(provider_ids) != len(set(provider_ids)):
            raise ValueError("ASR provider segment ids must be unique")
        for previous, current in zip(self.segments, self.segments[1:], strict=False):
            if current.start_ms < previous.end_ms:
                raise ValueError(
                    "ASR suggestion segments must be ordered and non-overlapping"
                )
        return self


class AsrSuggestionArtifact(FrozenStrictModel):
    """Content-addressed A2 record kept outside the editable transcript."""

    schema_version: Literal[1] = 1
    video_id: str = Field(min_length=1)
    suggestion: TranscriptSuggestion
    provider_output_json: str = Field(min_length=2)

    @model_validator(mode="after")
    def validate_provider_output(self) -> "AsrSuggestionArtifact":
        try:
            json.loads(self.provider_output_json)
        except json.JSONDecodeError as error:
            raise ValueError("provider_output_json must contain valid JSON") from error
        actual_sha256 = hashlib.sha256(
            self.provider_output_json.encode("utf-8")
        ).hexdigest()
        if actual_sha256 != self.suggestion.provenance.provider_output_sha256:
            raise ValueError(
                "provider_output_json does not match provider_output_sha256"
            )
        return self


class Clause(StrictModel):
    """One clause in the corrected sentence, indexed by Unicode character."""

    id: str = Field(min_length=1)
    text: str = Field(min_length=1)
    start_char: Annotated[int, Field(ge=0)]
    end_char: Annotated[int, Field(gt=0)]

    @model_validator(mode="after")
    def validate_character_range(self) -> "Clause":
        if self.end_char <= self.start_char:
            raise ValueError("end_char must be greater than start_char")
        return self


class LinguisticContext(StrictModel):
    """Human-reviewable discourse, sentence, and clause context."""

    discourse_id: str = Field(min_length=1)
    discourse_text: str = Field(min_length=1)
    sentence_id: str = Field(min_length=1)
    sentence_text: str = Field(min_length=1)
    clauses: list[Clause] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_clauses(self) -> "LinguisticContext":
        clause_ids = [clause.id for clause in self.clauses]
        if len(clause_ids) != len(set(clause_ids)):
            raise ValueError("clause ids must be unique within an utterance")
        for clause in self.clauses:
            if clause.end_char > len(self.sentence_text):
                raise ValueError("clause character range exceeds sentence_text")
            if self.sentence_text[clause.start_char : clause.end_char] != clause.text:
                raise ValueError("clause text must match its sentence_text range")
        return self


class SpeakerProfile(StrictModel):
    """Per-video speaker metadata, including researcher-confirmed origin."""

    id: str = Field(min_length=1)
    label: str = Field(min_length=1)
    region: str | None = None
    region_source: str | None = None
    region_confirmed: bool = False

    @model_validator(mode="after")
    def validate_region_provenance(self) -> "SpeakerProfile":
        if self.region_confirmed and self.region is None:
            raise ValueError("a confirmed speaker region requires a region value")
        return self


class TranscriptReview(FrozenStrictModel):
    """Explicit human decision over one ASR-derived working utterance."""

    action: Literal["accept", "edit"]
    reviewer_id: str = Field(min_length=1, pattern=r".*\S.*")
    reviewed_at: AwareDatetime
    suggestion_artifact_sha256: str = Field(pattern=r"^[0-9a-f]{64}$")
    evidence: str | None = None

    @field_validator("reviewed_at", mode="before")
    @classmethod
    def parse_json_datetime(cls, value: object) -> object:
        if isinstance(value, str):
            try:
                return datetime.fromisoformat(value.replace("Z", "+00:00"))
            except ValueError as error:
                raise ValueError("reviewed_at must be an ISO-8601 datetime") from error
        return value


class Utterance(StrictModel):
    """One ASR utterance and its human-review state."""

    id: str = Field(min_length=1)
    start_ms: Milliseconds
    end_ms: Milliseconds
    text: str = Field(min_length=1)
    surface_text: str = Field(min_length=1)
    speaker: str = Field(min_length=1)
    # Compatibility projection used to prioritize review. For ASR-origin
    # transcripts, the authoritative model score remains in asr_suggestion.
    confidence: Confidence | None = None
    source_segment_ids: list[str] = Field(default_factory=list)
    transcript_confirmed: bool = False
    transcript_review: TranscriptReview | None = None
    linguistic_context: LinguisticContext | None = None

    @model_validator(mode="before")
    @classmethod
    def normalize_target_particles(cls, value: object) -> object:
        if not isinstance(value, dict):
            return value
        text = value.get("text")
        if not isinstance(text, str):
            return value

        normalized = dict(value)
        normalized.setdefault("surface_text", text)
        normalized["text"] = text.replace("嗎", "吗")
        return normalized

    @model_validator(mode="after")
    def validate_time_range(self) -> "Utterance":
        if self.end_ms <= self.start_ms:
            raise ValueError("end_ms must be greater than start_ms")
        if len(self.source_segment_ids) != len(set(self.source_segment_ids)):
            raise ValueError("source_segment_ids must be unique")
        if self.transcript_review is not None and not self.transcript_confirmed:
            raise ValueError(
                "transcript_review requires transcript_confirmed=true"
            )
        return self


class Transcript(StrictModel):
    """Draft or reviewed utterances for a single source video."""

    model_config = ConfigDict(validate_assignment=True)

    video_id: str = Field(min_length=1)
    transcript_origin: Literal["researcher", "asr"] = Field(
        default="researcher",
        frozen=True,
    )
    asr_suggestion: TranscriptSuggestion | None = Field(
        default=None,
        frozen=True,
    )
    asr_suggestion_artifact_sha256: str | None = Field(
        default=None,
        frozen=True,
        pattern=r"^[0-9a-f]{64}$",
    )
    speakers: list[SpeakerProfile] = Field(default_factory=list)
    utterances: list[Utterance]

    @model_validator(mode="after")
    def validate_unique_ids(self) -> "Transcript":
        ids = [utterance.id for utterance in self.utterances]
        if len(ids) != len(set(ids)):
            raise ValueError("utterance ids must be unique")
        speaker_ids = [speaker.id for speaker in self.speakers]
        if len(speaker_ids) != len(set(speaker_ids)):
            raise ValueError("speaker ids must be unique within a video")
        if self.transcript_origin == "asr":
            if self.asr_suggestion is None:
                raise ValueError("ASR transcripts require the original ASR suggestion")
            if self.asr_suggestion_artifact_sha256 is None:
                raise ValueError(
                    "ASR transcripts require a content-addressed suggestion artifact"
                )
            suggestion_ids = {
                segment.id for segment in self.asr_suggestion.segments
            }
            suggestions_by_id = {
                segment.id: segment for segment in self.asr_suggestion.segments
            }
            for utterance in self.utterances:
                if not utterance.source_segment_ids:
                    raise ValueError(
                        "ASR utterances require at least one source_segment_id"
                    )
                unknown_ids = set(utterance.source_segment_ids) - suggestion_ids
                if unknown_ids:
                    raise ValueError(
                        "utterance source_segment_ids must reference the original "
                        "ASR suggestion"
                    )
                if utterance.transcript_confirmed:
                    if utterance.transcript_review is None:
                        raise ValueError(
                            "confirmed ASR utterances require an explicit "
                            "transcript_review"
                        )
                    if (
                        utterance.transcript_review.suggestion_artifact_sha256
                        != self.asr_suggestion_artifact_sha256
                    ):
                        raise ValueError(
                            "transcript_review must reference the original "
                            "ASR suggestion artifact"
                        )
                    if utterance.speaker == "spk_unknown":
                        raise ValueError(
                            "confirmed ASR utterances require a reviewed speaker"
                        )
                    if utterance.speaker not in speaker_ids:
                        raise ValueError(
                            "confirmed ASR utterance speakers require a "
                            "video speaker profile"
                        )
                    if utterance.transcript_review.action == "accept":
                        if len(utterance.source_segment_ids) != 1:
                            raise ValueError(
                                "split or merged ASR utterances require an edit review"
                            )
                        suggestion = suggestions_by_id[
                            utterance.source_segment_ids[0]
                        ]
                        suggested_surface = suggestion.surface_text.strip()
                        if (
                            utterance.start_ms != suggestion.start_ms
                            or utterance.end_ms != suggestion.end_ms
                            or utterance.surface_text != suggested_surface
                            or utterance.text
                            != suggested_surface.replace("嗎", "吗")
                            or utterance.speaker != suggestion.speaker
                        ):
                            raise ValueError(
                                "changed ASR utterances require an edit review"
                            )
        else:
            if self.asr_suggestion is not None:
                raise ValueError(
                    "researcher-origin transcripts cannot claim an ASR suggestion"
                )
            if self.asr_suggestion_artifact_sha256 is not None:
                raise ValueError(
                    "researcher-origin transcripts cannot reference an ASR "
                    "suggestion artifact"
                )
            if any(utterance.source_segment_ids for utterance in self.utterances):
                raise ValueError(
                    "researcher-origin utterances cannot reference ASR segments"
                )
        if speaker_ids:
            unknown = sorted(
                {
                    utterance.speaker
                    for utterance in self.utterances
                    if utterance.speaker not in speaker_ids
                }
            )
            if unknown:
                raise ValueError(
                    "utterance speakers must have a video speaker profile: "
                    + ", ".join(unknown)
                )
        return self


class VideoReference(StrictModel):
    """A source selected for the project but not necessarily ingested yet."""

    id: str = Field(min_length=1)
    source_url: str = Field(min_length=1)
    platform: Literal["youtube", "local", "other"]
    title: str | None = None
    speaker_regions: list[str] = Field(default_factory=list)
    region_verification: Literal["unverified", "researcher_confirmed"] = "unverified"
    status: Literal["reference", "ingested", "excluded"] = "reference"


class TranscriptBatch(StrictModel):
    """A research project containing independently reviewable source videos."""

    project_id: str = Field(min_length=1)
    transcripts: list[Transcript] = Field(min_length=1)
    video_references: list[VideoReference] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_unique_video_ids(self) -> "TranscriptBatch":
        video_ids = [transcript.video_id for transcript in self.transcripts]
        if len(video_ids) != len(set(video_ids)):
            raise ValueError("video ids must be unique within a transcript batch")
        reference_ids = [reference.id for reference in self.video_references]
        if len(reference_ids) != len(set(reference_ids)):
            raise ValueError("video reference ids must be unique within a batch")
        return self


class AlignedInterval(StrictModel):
    """A word-tier interval emitted by Montreal Forced Aligner."""

    surface_form: str
    start_ms: Milliseconds
    end_ms: Milliseconds

    @model_validator(mode="after")
    def validate_time_range(self) -> "AlignedInterval":
        if self.end_ms < self.start_ms:
            raise ValueError("end_ms must be greater than or equal to start_ms")
        return self


class UtteranceAlignment(StrictModel):
    """All aligned word intervals for one reviewed utterance."""

    utterance_id: str = Field(min_length=1)
    intervals: list[AlignedInterval]

    @model_validator(mode="after")
    def validate_interval_order(self) -> UtteranceAlignment:
        for previous, current in zip(self.intervals, self.intervals[1:], strict=False):
            if current.start_ms < previous.end_ms:
                raise ValueError(
                    "alignment intervals must be ordered and non-overlapping"
                )
        return self


class ParticleInstance(StrictModel):
    """One utterance-final target particle with canonical millisecond timing."""

    instance_id: str = Field(min_length=1)
    fp_token: str
    fp_pinyin: str
    surface_form: str
    fp_start_ms: Milliseconds
    fp_end_ms: Milliseconds
    utterance_id: str = Field(min_length=1)
    source: Literal["mfa_rule"] = "mfa_rule"
    confidence: Confidence | None = None
    confirmed: Literal[False] = False

    @model_validator(mode="after")
    def validate_time_range(self) -> "ParticleInstance":
        if self.fp_end_ms <= self.fp_start_ms:
            raise ValueError("fp_end_ms must be greater than fp_start_ms")
        canonical_token = PARTICLE_NORMALIZATION.get(self.surface_form)
        if canonical_token != self.fp_token:
            raise ValueError(
                "surface_form and fp_token must identify the same target particle"
            )
        if TARGET_PARTICLES.get(self.fp_token) != self.fp_pinyin:
            raise ValueError("fp_pinyin does not match fp_token")
        return self


class ExtendedParticleCandidate(StrictModel):
    """One review-only match from the researcher-supplied candidate inventory."""

    instance_id: str = Field(min_length=1)
    normalized_candidate: str = Field(min_length=1)
    surface_form: str = Field(min_length=1)
    start_ms: Milliseconds
    end_ms: Milliseconds
    utterance_id: str = Field(min_length=1)
    source: Literal["mfa_rule"] = "mfa_rule"
    confidence: Confidence | None = None
    confirmed: Literal[False] = False
    review_required: Literal[True] = True

    @model_validator(mode="after")
    def validate_candidate(self) -> ExtendedParticleCandidate:
        if self.end_ms <= self.start_ms:
            raise ValueError("end_ms must be greater than start_ms")
        if self.normalized_candidate not in EXTENDED_PARTICLE_CANDIDATES:
            raise ValueError(
                "normalized_candidate must be in EXTENDED_PARTICLE_CANDIDATES"
            )
        if self.surface_form.replace("嗎", "吗") != self.normalized_candidate:
            raise ValueError(
                "surface_form must normalize exactly to normalized_candidate"
            )
        return self


class ParticleDetectionProvenance(StrictModel):
    """Versioned media, transcript, and MFA identity carried across Track A."""

    duration_ms: Annotated[int, Field(gt=0)]
    fps: Literal[30]
    transcript_sha256: str = Field(pattern=r"^[0-9a-f]{64}$")
    source_audio_sha256: str = Field(pattern=r"^[0-9a-f]{64}$")
    normalized_video_sha256: str = Field(pattern=r"^[0-9a-f]{64}$")
    dictionary_model: str = Field(min_length=1)
    acoustic_model: str = Field(min_length=1)


class ParticleScanResult(StrictModel):
    """Internal result before alignment provenance is attached."""

    video_id: str = Field(min_length=1)
    particles: list[ParticleInstance]
    candidates: list[ExtendedParticleCandidate] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_instance_identity(self) -> ParticleScanResult:
        detections: list[ParticleInstance | ExtendedParticleCandidate] = [
            *self.particles,
            *self.candidates,
        ]
        instance_ids = [detection.instance_id for detection in detections]
        if len(instance_ids) != len(set(instance_ids)):
            raise ValueError("particle instance_ids must be unique")
        utterance_ids = [detection.utterance_id for detection in detections]
        if len(utterance_ids) != len(set(utterance_ids)):
            raise ValueError("only one particle result is allowed per utterance")
        for detection in detections:
            expected_instance_id = f"{self.video_id}:{detection.utterance_id}"
            if detection.instance_id != expected_instance_id:
                raise ValueError(
                    "particle instance_id must equal "
                    f"{expected_instance_id!r} for this video and utterance"
                )
        return self


class ParticleDetectionResult(ParticleScanResult):
    """Versioned Track A artifact emitted after reviewed MFA alignment."""

    schema_version: Literal[1] = 1
    provenance: ParticleDetectionProvenance

    @model_validator(mode="after")
    def validate_source_timeline_bounds(self) -> ParticleDetectionResult:
        for particle in self.particles:
            if particle.fp_end_ms > self.provenance.duration_ms:
                raise ValueError(
                    "particle fp_end_ms must not exceed provenance duration_ms"
                )
        for candidate in self.candidates:
            if candidate.end_ms > self.provenance.duration_ms:
                raise ValueError(
                    "candidate end_ms must not exceed provenance duration_ms"
                )
        return self
