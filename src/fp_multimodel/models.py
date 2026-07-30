"""Typed JSON contracts shared by the Track A pipeline stages."""

from __future__ import annotations

from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from fp_multimodel.vocab import PARTICLE_NORMALIZATION, TARGET_PARTICLES


Milliseconds = Annotated[int, Field(ge=0)]
Confidence = Annotated[float, Field(ge=0.0, le=1.0)]


class StrictModel(BaseModel):
    """Base model that rejects misspelled or unexpected input fields."""

    model_config = ConfigDict(extra="forbid", strict=True)


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


class Utterance(StrictModel):
    """One ASR utterance and its human-review state."""

    id: str = Field(min_length=1)
    start_ms: Milliseconds
    end_ms: Milliseconds
    text: str = Field(min_length=1)
    surface_text: str = Field(min_length=1)
    speaker: str = Field(min_length=1)
    confidence: Confidence
    transcript_confirmed: bool = False
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
        return self


class Transcript(StrictModel):
    """Draft or reviewed utterances for a single source video."""

    video_id: str = Field(min_length=1)
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


class ParticleDetectionResult(StrictModel):
    """Serializable result of scanning one video's reviewed alignments."""

    video_id: str = Field(min_length=1)
    particles: list[ParticleInstance]

    @model_validator(mode="after")
    def validate_unique_instance_ids(self) -> "ParticleDetectionResult":
        instance_ids = [particle.instance_id for particle in self.particles]
        if len(instance_ids) != len(set(instance_ids)):
            raise ValueError("particle instance_ids must be unique")
        return self
