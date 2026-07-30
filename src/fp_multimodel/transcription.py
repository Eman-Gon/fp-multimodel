"""Provider boundary for Mandarin draft transcription (Track A2)."""

from __future__ import annotations

from collections.abc import Sequence
from pathlib import Path
from typing import Protocol

from pydantic import Field, model_validator

from fp_multimodel.models import (
    Confidence,
    Milliseconds,
    StrictModel,
    Transcript,
    TranscriptBatch,
    Utterance,
)


class AsrSegment(StrictModel):
    """Provider-neutral ASR output before the human review checkpoint."""

    id: str = Field(min_length=1)
    start_ms: Milliseconds
    end_ms: Milliseconds
    text: str = Field(min_length=1)
    speaker: str = Field(min_length=1)
    confidence: Confidence

    @model_validator(mode="after")
    def validate_time_range(self) -> "AsrSegment":
        if self.end_ms <= self.start_ms:
            raise ValueError("end_ms must be greater than start_ms")
        return self


class MandarinAsrProvider(Protocol):
    """Minimal contract implemented by Whisper or TwelveLabs adapters."""

    def transcribe(self, audio: Path) -> Sequence[AsrSegment]:
        """Return rough Mandarin utterance segments for human correction."""


def create_draft_transcript(
    video_id: str,
    audio: Path,
    provider: MandarinAsrProvider,
) -> Transcript:
    """Run an ASR provider and force every emitted utterance to draft state."""

    if not audio.is_file():
        raise FileNotFoundError(f"ASR audio does not exist: {audio}")
    segments = provider.transcribe(audio)
    return Transcript(
        video_id=video_id,
        utterances=[
            Utterance(
                id=segment.id,
                start_ms=segment.start_ms,
                end_ms=segment.end_ms,
                text=segment.text,
                speaker=segment.speaker,
                confidence=segment.confidence,
                transcript_confirmed=False,
            )
            for segment in segments
        ],
    )


def create_draft_transcript_batch(
    project_id: str,
    sources: Sequence[tuple[str, Path]],
    provider: MandarinAsrProvider,
) -> TranscriptBatch:
    """Transcribe multiple videos without merging their source timelines."""

    video_ids = [video_id for video_id, _ in sources]
    if len(video_ids) != len(set(video_ids)):
        raise ValueError("video ids must be unique within a transcript batch")
    if not sources:
        raise ValueError("a transcript batch requires at least one video")

    return TranscriptBatch(
        project_id=project_id,
        transcripts=[
            create_draft_transcript(video_id, audio, provider)
            for video_id, audio in sources
        ],
    )
