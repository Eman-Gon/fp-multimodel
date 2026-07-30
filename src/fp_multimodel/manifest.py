"""Provenance manifests for Track A media and revision-bound MFA artifacts."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path
from typing import Annotated, Literal

from pydantic import Field, model_validator

from fp_multimodel.models import AsrSuggestionArtifact, StrictModel, Transcript


MANIFEST_FILENAME = "track-a-manifest.json"
MEDIA_MANIFEST_FILENAME = "media-manifest.json"
ASR_SUGGESTION_DIRECTORY = "asr-suggestions"
SHA256_PATTERN = r"^[0-9a-f]{64}$"


class MediaManifest(StrictModel):
    """Verified identity and encoding metadata for one normalized source video."""

    schema_version: Literal[1] = 1
    video_id: str = Field(min_length=1, pattern=r".*\S.*")
    duration_ms: Annotated[int, Field(gt=0)]
    fps: Literal[30]
    audio_sample_rate_hz: Literal[16000]
    audio_channels: Literal[1]
    source_video_sha256: str = Field(pattern=SHA256_PATTERN)
    normalized_video_sha256: str = Field(pattern=SHA256_PATTERN)
    audio_sha256: str = Field(pattern=SHA256_PATTERN)


class TrackAManifest(StrictModel):
    """Identity and provenance for a prepared corpus or alignment output."""

    schema_version: Literal[2] = 2
    stage: Literal["corpus", "alignment"]
    video_id: str = Field(min_length=1)
    duration_ms: Annotated[int, Field(gt=0)]
    fps: Literal[30]
    transcript_sha256: str = Field(pattern=SHA256_PATTERN)
    source_audio_sha256: str = Field(pattern=SHA256_PATTERN)
    normalized_video_sha256: str = Field(pattern=SHA256_PATTERN)
    asr_suggestion_artifact_sha256: str | None = Field(
        default=None,
        pattern=SHA256_PATTERN,
    )
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
        "transcript_origin": transcript.transcript_origin,
        "asr_suggestion": (
            transcript.asr_suggestion.model_dump(mode="json")
            if transcript.asr_suggestion is not None
            else None
        ),
        "asr_suggestion_artifact_sha256": (
            transcript.asr_suggestion_artifact_sha256
        ),
        "speakers": [speaker.model_dump() for speaker in transcript.speakers],
        "utterances": [
            {
                "id": utterance.id,
                "start_ms": utterance.start_ms,
                "end_ms": utterance.end_ms,
                "text": utterance.text,
                "surface_text": utterance.surface_text,
                "speaker": utterance.speaker,
                "confidence": utterance.confidence,
                "source_segment_ids": list(utterance.source_segment_ids),
                "transcript_confirmed": utterance.transcript_confirmed,
                "transcript_review": (
                    utterance.transcript_review.model_dump(mode="json")
                    if utterance.transcript_review is not None
                    else None
                ),
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


def asr_suggestion_artifact_bytes(artifact: AsrSuggestionArtifact) -> bytes:
    """Serialize an A2 sidecar canonically for content-addressed storage."""

    return (
        json.dumps(
            artifact.model_dump(mode="json"),
            ensure_ascii=False,
            separators=(",", ":"),
            sort_keys=True,
        )
        + "\n"
    ).encode("utf-8")


def asr_suggestion_artifact_sha256(artifact: AsrSuggestionArtifact) -> str:
    """Return the digest used as the immutable A2 sidecar filename."""

    return hashlib.sha256(asr_suggestion_artifact_bytes(artifact)).hexdigest()


def write_asr_suggestion_artifact(
    directory: Path,
    artifact: AsrSuggestionArtifact,
) -> Path:
    """Persist a content-addressed A2 sidecar without overwriting prior runs."""

    encoded = asr_suggestion_artifact_bytes(artifact)
    digest = hashlib.sha256(encoded).hexdigest()
    artifact_directory = directory / ASR_SUGGESTION_DIRECTORY
    artifact_directory.mkdir(parents=True, exist_ok=True)
    path = artifact_directory / f"{digest}.json"
    try:
        with path.open("xb") as destination:
            destination.write(encoded)
    except FileExistsError:
        if path.read_bytes() != encoded:
            raise ValueError(
                f"content-addressed ASR suggestion artifact is corrupt: {path}"
            ) from None
    return path


def load_asr_suggestion_artifact(
    directory: Path,
    expected_sha256: str,
) -> AsrSuggestionArtifact:
    """Load a sidecar only when both its bytes and typed content are intact."""

    path = (
        directory
        / ASR_SUGGESTION_DIRECTORY
        / f"{expected_sha256}.json"
    )
    if not path.is_file():
        raise FileNotFoundError(f"missing original ASR suggestion artifact: {path}")
    if file_sha256(path) != expected_sha256:
        raise ValueError(
            f"original ASR suggestion artifact failed its SHA-256 check: {path}"
        )
    return AsrSuggestionArtifact.model_validate_json(
        path.read_text(encoding="utf-8")
    )


def verify_transcript_asr_artifact(
    transcript: Transcript,
    directory: Path,
) -> AsrSuggestionArtifact | None:
    """Bind an editable transcript to its separately persisted A2 suggestion."""

    artifact_directory = directory / ASR_SUGGESTION_DIRECTORY
    if transcript.transcript_origin == "researcher":
        if artifact_directory.is_dir() and any(artifact_directory.glob("*.json")):
            raise ValueError(
                "researcher-origin transcript cannot discard existing ASR "
                "suggestion provenance in this video directory"
            )
        return None

    if (
        transcript.asr_suggestion is None
        or transcript.asr_suggestion_artifact_sha256 is None
    ):
        raise ValueError("ASR transcript is missing its suggestion artifact reference")
    artifact = load_asr_suggestion_artifact(
        directory,
        transcript.asr_suggestion_artifact_sha256,
    )
    if artifact.video_id != transcript.video_id:
        raise ValueError(
            "ASR suggestion artifact belongs to a different source video"
        )
    if artifact.suggestion != transcript.asr_suggestion:
        raise ValueError(
            "editable transcript changed the original ASR suggestion; restore "
            "it from the content-addressed artifact"
        )
    return artifact


def file_sha256(path: Path) -> str:
    """Stream a file into SHA-256 without loading large media into memory."""

    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def write_media_manifest(directory: Path, manifest: MediaManifest) -> Path:
    """Write verified media provenance after normalization has succeeded."""

    path = directory / MEDIA_MANIFEST_FILENAME
    path.write_text(manifest.model_dump_json(indent=2) + "\n", encoding="utf-8")
    return path


def load_media_manifest(directory: Path) -> MediaManifest:
    """Load and strictly validate a normalized-media manifest."""

    path = directory / MEDIA_MANIFEST_FILENAME
    if not path.is_file():
        raise FileNotFoundError(f"missing media manifest: {path}")
    return MediaManifest.model_validate_json(path.read_text(encoding="utf-8"))


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
