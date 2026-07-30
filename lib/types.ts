import type {
  GestureRegion,
  GestureType,
  ParticlePinyin,
  ParticleToken,
} from "./vocab.ts";

export interface TimeRange {
  readonly start_ms: number;
  readonly end_ms: number;
}

/**
 * The Track A handoff required by Track B. Times are absolute source-video
 * milliseconds, never frame numbers or window-relative offsets.
 */
export interface FinalParticleTiming {
  readonly instance_id: string;
  readonly fp_start_ms: number;
  readonly fp_end_ms: number;
}

/**
 * The JSON shape currently emitted by the Python Track A pipeline.
 */
export interface FinalParticleInstance extends FinalParticleTiming {
  readonly fp_token: ParticleToken;
  readonly fp_pinyin: ParticlePinyin;
  readonly surface_form: string;
  readonly utterance_id: string;
  readonly source: "mfa_rule";
  readonly confidence: number | null;
  readonly confirmed: false;
}

export type TrackAParticle = FinalParticleInstance;

export interface TrackAExtendedParticleCandidate {
  readonly instance_id: string;
  readonly normalized_candidate: string;
  readonly surface_form: string;
  readonly start_ms: number;
  readonly end_ms: number;
  readonly utterance_id: string;
  readonly source: "mfa_rule";
  readonly confidence: number | null;
  readonly confirmed: false;
  readonly review_required: true;
}

export interface TrackAProcessingProvenance {
  readonly duration_ms: number;
  readonly fps: 30;
  readonly transcript_sha256: string;
  readonly source_audio_sha256: string;
  readonly normalized_video_sha256: string;
  readonly dictionary_model: string;
  readonly acoustic_model: string;
}

export interface TrackAParticleDetectionResult {
  readonly schema_version: 1;
  readonly video_id: string;
  readonly provenance: TrackAProcessingProvenance;
  readonly particles: readonly TrackAParticle[];
  readonly candidates: readonly TrackAExtendedParticleCandidate[];
}

export type AiSource = "pegasus" | "mediapipe";

/**
 * Draft fields deliberately cannot claim human confirmation. A later review
 * action must construct the confirmed representation.
 */
export interface AiDraftField<T> {
  readonly value: T;
  readonly confidence: number | null;
  readonly source: AiSource;
  readonly confirmed: false;
}

export interface PegasusGesture {
  readonly gesture_type: GestureType;
  readonly gesture_region: GestureRegion | null;
  readonly segment: TimeRange | null;
  readonly confidence: number;
}

export interface MotionInterval extends TimeRange {
  readonly confidence?: number | null;
}

export interface GestureModelEvidence {
  readonly pegasus: PegasusGesture;
  readonly mediapipe_intervals: readonly MotionInterval[];
}

/**
 * Presence and boundaries are separate fields so reviewers can confirm the
 * cognitive tasks independently (Track B3).
 */
export interface GestureAnnotationDraft {
  readonly video_id: string;
  readonly instance_id: string;
  readonly analysis_window: TimeRange;
  readonly gesture_present: AiDraftField<boolean>;
  readonly gesture_type: AiDraftField<GestureType>;
  readonly gesture_region: AiDraftField<GestureRegion | null>;
  readonly gesture_boundaries: AiDraftField<TimeRange | null>;
  readonly model_evidence: GestureModelEvidence;
}

export interface TrackBRequest {
  readonly video_id: string;
  readonly video_duration_ms: number;
  readonly particle_instances: readonly FinalParticleInstance[];
}

export interface TrackBBatchRequest {
  readonly project_id: string;
  readonly videos: readonly TrackBRequest[];
}

export interface CompletedTrackBVideoDraft {
  readonly video_id: string;
  readonly status: "completed";
  readonly annotations: readonly GestureAnnotationDraft[];
}

export interface FailedTrackBVideoDraft {
  readonly video_id: string;
  readonly status: "failed";
  readonly annotations: readonly [];
  readonly error_message: string;
}

export type TrackBVideoDraft =
  | CompletedTrackBVideoDraft
  | FailedTrackBVideoDraft;

/**
 * Keeps Track A metadata available to graph/coding consumers while exposing
 * the narrow request needed by the Track B analyzer.
 */
export interface TrackBHandoff {
  readonly request: TrackBRequest;
  readonly particles_by_instance_id: Readonly<
    Record<string, TrackAParticle>
  >;
  readonly candidates_for_review: readonly TrackAExtendedParticleCandidate[];
}

export interface SemanticGestureRequest {
  readonly video_id: string;
  readonly instance_id: string;
  readonly particle: FinalParticleInstance;
  readonly window: TimeRange;
  readonly prompt: string;
  readonly response_schema: Readonly<Record<string, unknown>>;
}

export interface MotionDetectionRequest {
  readonly video_id: string;
  readonly instance_id: string;
  readonly window: TimeRange;
  readonly semantic_gesture: PegasusGesture;
}

export interface SemanticGestureAnalyzer {
  analyzeGesture(request: SemanticGestureRequest): Promise<unknown>;
}

export interface MotionAnalyzer {
  detectMotion(request: MotionDetectionRequest): Promise<readonly MotionInterval[]>;
}

export interface TrackBDependencies {
  readonly semanticAnalyzer: SemanticGestureAnalyzer;
  readonly motionAnalyzer: MotionAnalyzer;
}
