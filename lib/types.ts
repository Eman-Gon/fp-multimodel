import type { GestureRegion, GestureType } from "./vocab.ts";

export interface TimeRange {
  readonly start_ms: number;
  readonly end_ms: number;
}

/**
 * The Track A handoff required by Track B. Times are absolute source-video
 * milliseconds, never frame numbers or window-relative offsets.
 */
export interface FinalParticleInstance {
  readonly instance_id: string;
  readonly fp_start_ms: number;
  readonly fp_end_ms: number;
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

/**
 * Presence and boundaries are separate fields so reviewers can confirm the
 * cognitive tasks independently (Track B3).
 */
export interface GestureAnnotationDraft {
  readonly instance_id: string;
  readonly analysis_window: TimeRange;
  readonly gesture_present: AiDraftField<boolean>;
  readonly gesture_type: AiDraftField<GestureType>;
  readonly gesture_region: AiDraftField<GestureRegion | null>;
  readonly gesture_boundaries: AiDraftField<TimeRange | null>;
}

export interface TrackBRequest {
  readonly video_id: string;
  readonly video_duration_ms: number;
  readonly particle_instances: readonly FinalParticleInstance[];
}

export interface SemanticGestureRequest {
  readonly video_id: string;
  readonly instance_id: string;
  readonly window: TimeRange;
  readonly prompt: string;
  readonly response_schema: Readonly<Record<string, unknown>>;
}

export interface MotionDetectionRequest {
  readonly video_id: string;
  readonly instance_id: string;
  readonly window: TimeRange;
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

