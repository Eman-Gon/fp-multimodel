"""Typed JSON contracts shared by the Track A pipeline stages."""

from __future__ import annotations

from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, model_validator


Milliseconds = Annotated[int, Field(ge=0)]
Confidence = Annotated[float, Field(ge=0.0, le=1.0)]


class StrictModel(BaseModel):
    """Base model that rejects misspelled or unexpected input fields."""

    model_config = ConfigDict(extra="forbid")


class Utterance(StrictModel):
    """One ASR utterance and its human-review state."""

    id: str = Field(min_length=1)
    start_ms: Milliseconds
    end_ms: Milliseconds
    text: str = Field(min_length=1)
    speaker: str = Field(min_length=1)
    confidence: Confidence
    transcript_confirmed: bool = False

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

    fp_token: str
    fp_pinyin: str
    surface_form: str
    fp_start_ms: Milliseconds
    fp_end_ms: Milliseconds
    utterance_id: str = Field(min_length=1)

    @model_validator(mode="after")
    def validate_time_range(self) -> "ParticleInstance":
        if self.fp_end_ms < self.fp_start_ms:
            raise ValueError("fp_end_ms must be greater than or equal to fp_start_ms")
        return self


class ParticleDetectionResult(StrictModel):
    """Serializable result of scanning one video's reviewed alignments."""

    video_id: str = Field(min_length=1)
    particles: list[ParticleInstance]

