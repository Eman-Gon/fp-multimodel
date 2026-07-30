"""Provider boundary for Mandarin draft transcription (Track A2)."""

from __future__ import annotations

import hashlib
import json
import math
import subprocess
import tempfile
from collections.abc import Callable, Sequence
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from pathlib import Path
from typing import Any, Protocol

from pydantic import Field, model_validator

from fp_multimodel.manifest import (
    asr_suggestion_artifact_sha256,
    file_sha256,
    load_media_manifest,
    write_asr_suggestion_artifact,
)
from fp_multimodel.models import (
    AsrDiagnostic,
    AsrProvenance,
    AsrSuggestionArtifact,
    AsrSuggestionSegment,
    Confidence,
    Milliseconds,
    StrictModel,
    Transcript,
    TranscriptBatch,
    TranscriptSuggestion,
    Utterance,
)


class AsrSegment(StrictModel):
    """Provider-neutral ASR output before the human review checkpoint."""

    id: str = Field(min_length=1)
    provider_segment_id: str = Field(min_length=1)
    start_ms: Milliseconds
    end_ms: Milliseconds
    text: str = Field(min_length=1)
    speaker: str | None = None
    confidence: Confidence | None = None
    diagnostics: tuple[AsrDiagnostic, ...] = Field(default_factory=tuple)

    @model_validator(mode="after")
    def validate_time_range(self) -> "AsrSegment":
        if self.end_ms <= self.start_ms:
            raise ValueError("end_ms must be greater than start_ms")
        return self


class AsrRun(StrictModel):
    """Provider-neutral result envelope with run identity and diagnostics."""

    provider: str = Field(min_length=1)
    model: str = Field(min_length=1)
    language: str = Field(min_length=1)
    task: str = Field(min_length=1)
    confidence_method: str = Field(min_length=1)
    provider_output_sha256: str = Field(pattern=r"^[0-9a-f]{64}$")
    provider_output_json: str = Field(min_length=2)
    segments: tuple[AsrSegment, ...] = Field(default_factory=tuple)

    @model_validator(mode="after")
    def validate_segments(self) -> "AsrRun":
        try:
            json.loads(self.provider_output_json)
        except json.JSONDecodeError as error:
            raise ValueError("provider_output_json must contain valid JSON") from error
        if (
            hashlib.sha256(self.provider_output_json.encode("utf-8")).hexdigest()
            != self.provider_output_sha256
        ):
            raise ValueError(
                "provider_output_json does not match provider_output_sha256"
            )
        ids = [segment.id for segment in self.segments]
        if len(ids) != len(set(ids)):
            raise ValueError("ASR segment ids must be unique")
        provider_ids = [segment.provider_segment_id for segment in self.segments]
        if len(provider_ids) != len(set(provider_ids)):
            raise ValueError("ASR provider segment ids must be unique")
        for previous, current in zip(self.segments, self.segments[1:], strict=False):
            if current.start_ms < previous.end_ms:
                raise ValueError("ASR segments must be ordered and non-overlapping")
        return self


class MandarinAsrProvider(Protocol):
    """Minimal contract implemented by Whisper or TwelveLabs adapters."""

    def transcribe(self, audio: Path) -> AsrRun:
        """Return rough Mandarin utterance segments for human correction."""


CommandRunner = Callable[..., subprocess.CompletedProcess[bytes]]


def _seconds_to_milliseconds(value: object, label: str) -> int:
    if isinstance(value, bool):
        raise ValueError(f"{label} must be a finite number of seconds")
    try:
        seconds = Decimal(str(value))
    except (InvalidOperation, ValueError) as error:
        raise ValueError(f"{label} must be a finite number of seconds") from error
    if not seconds.is_finite() or seconds < 0:
        raise ValueError(f"{label} must be a finite non-negative number of seconds")
    return int(
        (seconds * 1000).quantize(
            Decimal("1"),
            rounding=ROUND_HALF_UP,
        )
    )


def _numeric_diagnostic(
    segment: dict[str, Any],
    name: str,
) -> AsrDiagnostic | None:
    value = segment.get(name)
    if value is None:
        return None
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError(f"Whisper segment {name} must be numeric")
    numeric_value = float(value)
    if not math.isfinite(numeric_value):
        raise ValueError(f"Whisper segment {name} must be finite")
    return AsrDiagnostic(name=name, value=numeric_value)


class WhisperCliMandarinAsr:
    """Concrete adapter for the external `openai-whisper` command-line tool."""

    def __init__(
        self,
        *,
        whisper_bin: str = "whisper",
        model: str = "large-v3",
        runner: CommandRunner = subprocess.run,
    ) -> None:
        if not whisper_bin.strip():
            raise ValueError("whisper_bin must not be empty")
        if not model.strip():
            raise ValueError("model must not be empty")
        self.whisper_bin = whisper_bin
        self.model = model
        self.runner = runner

    def transcribe(self, audio: Path) -> AsrRun:
        """Run Whisper in Mandarin mode and parse its segment-level JSON."""

        with tempfile.TemporaryDirectory(prefix="fp-track-a-whisper-") as directory:
            output_dir = Path(directory)
            self.runner(
                [
                    self.whisper_bin,
                    str(audio),
                    "--model",
                    self.model,
                    "--language",
                    "zh",
                    "--task",
                    "transcribe",
                    "--output_format",
                    "json",
                    "--output_dir",
                    str(output_dir),
                    "--verbose",
                    "False",
                ],
                check=True,
                capture_output=True,
            )
            output_path = output_dir / f"{audio.stem}.json"
            if not output_path.is_file():
                raise FileNotFoundError(
                    f"Whisper did not create its JSON output: {output_path}"
                )
            raw_output = output_path.read_bytes()

        try:
            provider_output_json = raw_output.decode("utf-8")
            payload = json.loads(provider_output_json)
        except (UnicodeDecodeError, json.JSONDecodeError) as error:
            raise ValueError("Whisper returned invalid JSON") from error
        if not isinstance(payload, dict):
            raise ValueError("Whisper JSON output must be an object")
        if payload.get("language") != "zh":
            raise ValueError("Whisper output must identify Mandarin language code 'zh'")
        raw_segments = payload.get("segments")
        if not isinstance(raw_segments, list):
            raise ValueError("Whisper JSON output must contain a segments array")

        segments: list[AsrSegment] = []
        for index, raw_segment in enumerate(raw_segments, start=1):
            if not isinstance(raw_segment, dict):
                raise ValueError(f"Whisper segment {index} must be an object")
            provider_segment_id = raw_segment.get("id")
            if isinstance(provider_segment_id, bool) or not isinstance(
                provider_segment_id,
                (int, str),
            ):
                raise ValueError(f"Whisper segment {index} requires an id")
            raw_text = raw_segment.get("text")
            if not isinstance(raw_text, str) or not raw_text.strip():
                raise ValueError(f"Whisper segment {index} requires non-empty text")

            diagnostics = tuple(
                diagnostic
                for name in (
                    "avg_logprob",
                    "no_speech_prob",
                    "compression_ratio",
                    "temperature",
                )
                if (diagnostic := _numeric_diagnostic(raw_segment, name)) is not None
            )
            avg_logprob = next(
                (
                    diagnostic.value
                    for diagnostic in diagnostics
                    if diagnostic.name == "avg_logprob"
                ),
                None,
            )
            confidence = (
                1.0
                if avg_logprob is not None and avg_logprob >= 0
                else math.exp(avg_logprob)
                if avg_logprob is not None
                else None
            )
            segments.append(
                AsrSegment(
                    id=f"u{index:06d}",
                    provider_segment_id=str(provider_segment_id),
                    start_ms=_seconds_to_milliseconds(
                        raw_segment.get("start"),
                        f"Whisper segment {index} start",
                    ),
                    end_ms=_seconds_to_milliseconds(
                        raw_segment.get("end"),
                        f"Whisper segment {index} end",
                    ),
                    text=raw_text,
                    confidence=confidence,
                    diagnostics=diagnostics,
                )
            )

        return AsrRun(
            provider="openai_whisper_cli",
            model=self.model,
            language="zh",
            task="transcribe",
            confidence_method="exp_avg_logprob",
            provider_output_sha256=hashlib.sha256(raw_output).hexdigest(),
            provider_output_json=provider_output_json,
            segments=tuple(segments),
        )


def create_draft_transcript(
    video_id: str,
    audio: Path,
    provider: MandarinAsrProvider,
    *,
    default_speaker: str = "spk_unknown",
) -> Transcript:
    """Run ASR over verified A1 audio and preserve original segment suggestions."""

    audio = audio.resolve()
    if not audio.is_file():
        raise FileNotFoundError(f"ASR audio does not exist: {audio}")
    if not default_speaker.strip():
        raise ValueError("default_speaker must not be empty")
    media_manifest = load_media_manifest(audio.parent)
    if media_manifest.video_id != video_id:
        raise ValueError(
            f"requested video_id {video_id!r} does not match "
            f"media video_id {media_manifest.video_id!r}"
        )
    source_audio_sha256 = file_sha256(audio)
    if source_audio_sha256 != media_manifest.audio_sha256:
        raise ValueError(
            "ASR audio does not match its media manifest; normalize or select "
            "the correct video before transcribing"
        )

    run = provider.transcribe(audio)
    if file_sha256(audio) != source_audio_sha256:
        raise ValueError(
            "ASR audio changed while transcription was running; normalize and "
            "transcribe the source video again"
        )
    if run.language != "zh" or run.task != "transcribe":
        raise ValueError("Mandarin ASR providers must emit zh transcription results")
    if run.confidence_method not in {"provider", "exp_avg_logprob"}:
        raise ValueError("ASR confidence_method is not supported")
    out_of_bounds = [
        segment.id
        for segment in run.segments
        if segment.end_ms > media_manifest.duration_ms
    ]
    if out_of_bounds:
        raise ValueError(
            "ASR segments extend past the source video duration: "
            + ", ".join(out_of_bounds)
        )

    suggestion = TranscriptSuggestion(
        provenance=AsrProvenance(
            provider=run.provider,
            model=run.model,
            language="zh",
            task="transcribe",
            confidence_method=run.confidence_method,
            source_audio_sha256=source_audio_sha256,
            provider_output_sha256=run.provider_output_sha256,
        ),
        segments=tuple(
            AsrSuggestionSegment(
                id=segment.id,
                provider_segment_id=segment.provider_segment_id,
                start_ms=segment.start_ms,
                end_ms=segment.end_ms,
                surface_text=segment.text,
                speaker=segment.speaker,
                confidence=segment.confidence,
                diagnostics=segment.diagnostics,
            )
            for segment in run.segments
        ),
    )
    artifact = AsrSuggestionArtifact(
        video_id=video_id,
        suggestion=suggestion,
        provider_output_json=run.provider_output_json,
    )
    artifact_sha256 = asr_suggestion_artifact_sha256(artifact)
    transcript = Transcript(
        video_id=video_id,
        transcript_origin="asr",
        asr_suggestion=suggestion,
        asr_suggestion_artifact_sha256=artifact_sha256,
        utterances=[
            Utterance(
                id=segment.id,
                start_ms=segment.start_ms,
                end_ms=segment.end_ms,
                text=segment.text.strip(),
                speaker=segment.speaker or default_speaker,
                confidence=segment.confidence,
                source_segment_ids=[segment.id],
                transcript_confirmed=False,
            )
            for segment in run.segments
        ],
    )
    artifact_path = write_asr_suggestion_artifact(audio.parent, artifact)
    if artifact_path.stem != artifact_sha256:
        raise AssertionError("ASR suggestion artifact digest changed during write")
    return transcript


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
