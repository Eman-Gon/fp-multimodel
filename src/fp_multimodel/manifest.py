"""Revision manifests that keep MFA artifacts tied to reviewed input."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Literal

from pydantic import Field, model_validator

from fp_multimodel.models import StrictModel, Transcript


MANIFEST_FILENAME = "track-a-manifest.json"


class TrackAManifest(StrictModel):
    """Identity and provenance for a prepared corpus or alignment output."""

    schema_version: Literal[1] = 1
    stage: Literal["corpus", "alignment"]
    video_id: str = Field(min_length=1)
    transcript_sha256: str = Field(pattern=r"^[0-9a-f]{64}$")
    source_audio_sha256: str = Field(pattern=r"^[0-9a-f]{64}$")
    dictionary_model: str | None = None
    acoustic_model: str | None = None

    @model_validator(mode="after")
    def require_models_for_alignment(self) -> "TrackAManifest":
        if self.stage == "alignment" and (
            self.dictionary_model is None or self.acoustic_model is None
        ):
            raise ValueError("alignment manifests must record both MFA models")
        return self


def transcript_sha256(transcript: Transcript) -> str:
    """Hash every reviewed field that affects alignment or particle provenance."""

    payload = {
        "video_id": transcript.video_id,
        "speakers": [speaker.model_dump() for speaker in transcript.speakers],
        "utterances": [
            {
                "id": utterance.id,
                "start_ms": utterance.start_ms,
                "end_ms": utterance.end_ms,
                "text": utterance.text,
                "surface_text": utterance.surface_text,
                "speaker": utterance.speaker,
                "transcript_confirmed": utterance.transcript_confirmed,
                "linguistic_context": (
                    utterance.linguistic_context.model_dump()
                    if utterance.linguistic_context is not None
                    else None
                ),
            }
            for utterance in transcript.utterances
        ],
    }
    encoded = json.dumps(
        payload,
        ensure_ascii=False,
        separators=(",", ":"),
        sort_keys=True,
    ).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def file_sha256(path: Path) -> str:
    """Stream a file into SHA-256 without loading large media into memory."""

    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def write_manifest(directory: Path, manifest: TrackAManifest) -> Path:
    """Write the stage manifest after its artifact has completed successfully."""

    path = directory / MANIFEST_FILENAME
    path.write_text(manifest.model_dump_json(indent=2) + "\n", encoding="utf-8")
    return path


def load_manifest(directory: Path, *, expected_stage: str) -> TrackAManifest:
    """Load a manifest and reject missing or wrong-stage artifacts."""

    path = directory / MANIFEST_FILENAME
    if not path.is_file():
        raise FileNotFoundError(
            f"missing {expected_stage} revision manifest: {path}"
        )
    manifest = TrackAManifest.model_validate_json(path.read_text(encoding="utf-8"))
    if manifest.stage != expected_stage:
        raise ValueError(
            f"expected a {expected_stage} manifest at {path}, "
            f"found {manifest.stage!r}"
        )
    return manifest
