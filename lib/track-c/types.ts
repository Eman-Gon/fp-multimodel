import type {
  ClipStatus,
  CommunicativeFunction,
  GestureRegion,
  GestureType,
  ParticleToken,
  SentenceType,
  ToneContour,
} from "../vocab.ts";
import type { TimeRange } from "../types.ts";

export type SuggestionSource =
  | "asr"
  | "mfa"
  | "diarization"
  | "pegasus"
  | "mediapipe"
  | "openai"
  | "parselmouth"
  | "heuristic"
  | "derived"
  | "fixture";

export type ReviewFieldState = "suggested" | "confirmed" | "skipped";

export interface Suggestion<T> {
  readonly value: T;
  readonly source: SuggestionSource;
  readonly confidence: number | null;
}

export interface ReviewDecision {
  readonly action: "accepted" | "edited" | "skipped";
  readonly reviewer_id: string;
  readonly reviewed_at: string;
  readonly reason?: string;
}

/**
 * Track C keeps the original suggestion even after a reviewer edits it. The
 * current value and the review decision are separate from model provenance.
 */
export interface ReviewField<T> {
  state: ReviewFieldState;
  value: T | null;
  readonly suggestion: Suggestion<T>;
  review: ReviewDecision | null;
}

export interface ParticipantOption {
  readonly id: string;
  readonly label: string;
  readonly region: string | null;
  readonly region_source: string | null;
  readonly region_confirmed: boolean;
}

export interface ClipLevelFields {
  speaker_id: ReviewField<string>;
  addressee_id: ReviewField<string>;
  fp_count: ReviewField<number>;
  sentence_type: ReviewField<SentenceType>;
  tone_contour: ReviewField<ToneContour>;
  discourse_context: ReviewField<string>;
  sentence_text: ReviewField<string>;
  clauses: ReviewField<readonly string[]>;
  communicative_function: ReviewField<CommunicativeFunction>;
  meaning_explanation: ReviewField<string>;
}

export interface ParticleReviewFields {
  fp_token: ReviewField<ParticleToken>;
  fp_timing: ReviewField<TimeRange>;
  gesture_present: ReviewField<boolean>;
  gesture_type: ReviewField<GestureType>;
  gesture_region: ReviewField<GestureRegion>;
  gesture_timing: ReviewField<TimeRange>;
}

export interface ParticleReview {
  readonly instance_id: string;
  readonly surface_form: string;
  fp_pinyin: string;
  readonly fields: ParticleReviewFields;
}

export interface ClipDetail {
  readonly schema_version: 2;
  version: number;
  readonly demo_fixture: boolean;
  readonly fixture_note: string;
  readonly clip: {
    readonly id: string;
    readonly name: string;
    readonly start_ms: number;
    readonly end_ms: number;
    status: ClipStatus;
  };
  readonly video: {
    readonly id: string;
    readonly source_url: string;
    readonly poster_url: string;
    readonly duration_ms: number;
    readonly fps: number;
  };
  readonly utterance: {
    readonly id: string;
    readonly text: string;
  };
  readonly participant_options: readonly ParticipantOption[];
  readonly fields: ClipLevelFields;
  readonly particle_instances: readonly ParticleReview[];
}

export interface ClipListItem {
  readonly id: string;
  readonly name: string;
  readonly video_id: string;
  readonly transcript: string;
  readonly particle: ParticleToken;
  readonly particle_pinyin: string;
  readonly communicative_function: CommunicativeFunction;
  readonly sentence_type: SentenceType;
  readonly speaker_id: string;
  readonly speaker_label: string;
  readonly status: ClipStatus;
  readonly lowest_confidence: number | null;
  readonly duration_ms: number;
}

/**
 * A corpus-facing projection. Required grouping values come only from
 * human-confirmed review fields; optional display metadata stays nullable
 * instead of falling back to a skipped model suggestion.
 */
export interface ConfirmedExplorerClipListItem {
  readonly id: string;
  readonly name: string;
  readonly video_id: string;
  readonly transcript: string;
  readonly particle: ParticleToken;
  readonly particle_pinyin: string;
  readonly communicative_function: CommunicativeFunction;
  readonly sentence_type: SentenceType | null;
  readonly speaker_label: string | null;
  readonly status: "confirmed";
}

export interface VideoSourceReference {
  readonly id: string;
  readonly platform: "youtube" | "local" | "other";
  readonly source_url: string;
  readonly title: string | null;
  readonly status: "reference" | "ingested" | "excluded";
  readonly speaker_regions: readonly string[];
  readonly region_verification: "unverified" | "researcher_confirmed";
}

export type ClipFieldName =
  | "speaker_id"
  | "addressee_id"
  | "fp_count"
  | "sentence_type"
  | "tone_contour"
  | "discourse_context"
  | "sentence_text"
  | "clauses"
  | "communicative_function"
  | "meaning_explanation";

export type ParticleFieldName =
  | "fp_token"
  | "fp_timing"
  | "gesture_present"
  | "gesture_type"
  | "gesture_region"
  | "gesture_timing";

export type FieldTarget =
  | {
      readonly scope: "clip";
      readonly field: ClipFieldName;
    }
  | {
      readonly scope: "particle";
      readonly instance_id: string;
      readonly field: ParticleFieldName;
    };

export type FieldReview =
  | {
      readonly action: "accept";
    }
  | {
      readonly action: "edit";
      readonly value: unknown;
    }
  | {
      readonly action: "skip";
      readonly reason: string;
    };

export type ClipCommand =
  | {
      readonly expected_version: number;
      readonly command: "review_field";
      readonly target: FieldTarget;
      readonly review: FieldReview;
    }
  | {
      readonly expected_version: number;
      readonly command: "confirm_clip";
    };

export interface ReviewUnit {
  readonly key: string;
  readonly label: string;
  readonly target: FieldTarget;
  readonly field: ReviewField<unknown>;
}

export interface ReviewSummary {
  readonly total: number;
  readonly confirmed: number;
  readonly skipped: number;
  readonly remaining: number;
  readonly ready: boolean;
  readonly blocking_fields: readonly FieldTarget[];
}
