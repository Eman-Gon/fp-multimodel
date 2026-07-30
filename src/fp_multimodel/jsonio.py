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


def load_transcript_batch(
    path: Path,
    *,
    artifact_root: Path | None = None,
) -> TranscriptBatch:
    """Load a batch and verify every video-scoped A2 sidecar."""

    raw_document = path.read_text(encoding="utf-8")
    payload = json.loads(raw_document)
    raw_transcripts = payload.get("transcripts") if isinstance(payload, dict) else None
    if not isinstance(raw_transcripts, list) or any(
        not isinstance(transcript, dict)
        or "transcript_origin" not in transcript
        for transcript in raw_transcripts
    ):
        raise ValueError(
            "every batch transcript requires explicit transcript_origin; "
            "migrate legacy drafts before continuing"
        )
    batch = TranscriptBatch.model_validate_json(raw_document)
    root = (artifact_root or path.parent).resolve()
    for transcript in batch.transcripts:
        verify_transcript_asr_artifact(transcript, root / transcript.video_id)
    return batch


def write_model(path: Path, model: BaseModel, *, overwrite: bool = False) -> None:
    """Write a Pydantic model as stable, human-readable UTF-8 JSON."""

    if path.exists() and not overwrite:
        raise FileExistsError(f"refusing to overwrite existing file: {path}")
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        model.model_dump_json(indent=2) + "\n",
        encoding="utf-8",
    )
