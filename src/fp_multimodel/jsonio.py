"""JSON input/output helpers for Track A artifacts."""

from __future__ import annotations

import json
from pathlib import Path
from typing import TypeVar

from pydantic import BaseModel

from fp_multimodel.manifest import verify_transcript_asr_artifact
from fp_multimodel.models import Transcript, TranscriptBatch


ModelT = TypeVar("ModelT", bound=BaseModel)


def load_transcript(path: Path) -> Transcript:
    """Load a transcript and verify its durable A2 suggestion boundary."""

    raw_document = path.read_text(encoding="utf-8")
    payload = json.loads(raw_document)
    if not isinstance(payload, dict) or "transcript_origin" not in payload:
        raise ValueError(
            "transcript JSON requires explicit transcript_origin; migrate "
            "legacy drafts before continuing"
        )
    transcript = Transcript.model_validate_json(raw_document)
    verify_transcript_asr_artifact(transcript, path.parent)
    return transcript


def load_transcript_batch(path: Path) -> TranscriptBatch:
    """Load and strictly validate a multi-video transcript batch."""

    return TranscriptBatch.model_validate_json(path.read_text(encoding="utf-8"))


def write_model(path: Path, model: BaseModel, *, overwrite: bool = False) -> None:
    """Write a Pydantic model as stable, human-readable UTF-8 JSON."""

    if path.exists() and not overwrite:
        raise FileExistsError(f"refusing to overwrite existing file: {path}")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        model.model_dump_json(indent=2) + "\n",
        encoding="utf-8",
    )
