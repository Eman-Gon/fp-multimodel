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
    utterances: list[Utterance]

    @model_validator(mode="after")
    def validate_unique_ids(self) -> "Transcript":
        ids = [utterance.id for utterance in self.utterances]
        if len(ids) != len(set(ids)):
            raise ValueError("utterance ids must be unique")
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
