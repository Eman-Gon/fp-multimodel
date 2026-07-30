"""JSON input/output helpers for Track A artifacts."""

from __future__ import annotations

from pathlib import Path
from typing import TypeVar

from pydantic import BaseModel

from fp_multimodel.models import Transcript, TranscriptBatch


ModelT = TypeVar("ModelT", bound=BaseModel)


def load_transcript(path: Path) -> Transcript:
    """Load and strictly validate a transcript JSON document."""

    return Transcript.model_validate_json(path.read_text(encoding="utf-8"))


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
