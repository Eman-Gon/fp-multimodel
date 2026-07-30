import type {
  AiDraftField,
  GestureAnnotationDraft,
} from "../types.ts";
import { createGestureAnalysisWindow } from "../track-b/analysis-window.ts";
import { reconcileGestureDraft } from "../track-b/reconcile-gesture.ts";
import {
  assertMilliseconds,
  assertTimeRange,
} from "../track-b/validation.ts";
import type {
  ClipDetail,
  ParticleReview,
  ReviewField,
  SuggestionSource,
} from "./types.ts";

const GESTURE_FIELD_NAMES = [
  "gesture_present",
  "gesture_type",
  "gesture_region",
  "gesture_timing",
] as const satisfies readonly (keyof ParticleReview["fields"])[];

/**
 * Merge B1–B3 output into an existing Track C clip shell. Track B does not own
 * clip boundaries, transcript hierarchy, participant metadata, or meaning
 * fields, so this adapter deliberately updates only gesture suggestions.
 */
export function mergeTrackBGestureDrafts(
  clip: ClipDetail,
  drafts: readonly GestureAnnotationDraft[],
): ClipDetail {
  if (clip.schema_version !== 3) {
    throw new RangeError("Track C clip schema_version must equal 3");
  }
  assertMilliseconds(clip.video.duration_ms, "clip.video.duration_ms");
  if (clip.video.duration_ms <= 0) {
    throw new RangeError("clip.video.duration_ms must be positive");
  }
  assertTimeRange(
    { start_ms: clip.clip.start_ms, end_ms: clip.clip.end_ms },
    "clip",
  );
  if (clip.clip.end_ms > clip.video.duration_ms) {
    throw new RangeError("clip.end_ms must not exceed the source video duration");
  }
  if (clip.clip.status === "confirmed" || clip.clip.status === "rejected") {
    throw new RangeError(
      `cannot import Track B drafts into a ${clip.clip.status} clip`,
    );
  }

  const particlesById = new Map(
    clip.particle_instances.map((particle) => [particle.instance_id, particle]),
  );
  if (particlesById.size !== clip.particle_instances.length) {
    throw new RangeError("clip contains duplicate particle instance_id values");
  }

  const draftsById = new Map<string, GestureAnnotationDraft>();
  for (const rawDraft of drafts as readonly unknown[]) {
    assertCanonicalTrackBDraft(rawDraft, clip);
    const draft = rawDraft;
    if (draft.video_id !== clip.video.id) {
      throw new RangeError(
        `Track B draft ${draft.instance_id} belongs to video ${draft.video_id}, not ${clip.video.id}`,
      );
    }
    if (!draft.instance_id.startsWith(`${clip.video.id}:`)) {
      throw new RangeError(
        `Track B draft instance_id ${draft.instance_id} does not belong to video ${clip.video.id}`,
      );
    }
    if (!particlesById.has(draft.instance_id)) {
      throw new RangeError(
        `Track B draft has no matching clip particle: ${draft.instance_id}`,
      );
    }
    const particle = particlesById.get(draft.instance_id);
    if (particle === undefined) {
      throw new RangeError(
        `Track B draft has no matching clip particle: ${draft.instance_id}`,
      );
    }
    if (particle.fields.fp_timing.state === "skipped") {
      throw new RangeError(
        `cannot import Track B draft for skipped FP timing: ${draft.instance_id}`,
      );
    }
    const fpTiming =
      particle.fields.fp_timing.value ??
      particle.fields.fp_timing.suggestion.value;
    const expectedWindow = createGestureAnalysisWindow(
      {
        instance_id: particle.instance_id,
        fp_start_ms: fpTiming.start_ms,
        fp_end_ms: fpTiming.end_ms,
      },
      clip.video.duration_ms,
    );
    if (!sameJsonValue(draft.analysis_window, expectedWindow)) {
      throw new RangeError(
        `Track B analysis_window is stale for particle ${draft.instance_id}`,
      );
    }
    if (draftsById.has(draft.instance_id)) {
      throw new RangeError(
        `duplicate Track B draft instance_id: ${draft.instance_id}`,
      );
    }
    draftsById.set(draft.instance_id, draft);
  }

  const missingInstanceIds = clip.particle_instances
    .map(({ instance_id }) => instance_id)
    .filter((instanceId) => !draftsById.has(instanceId));
  if (missingInstanceIds.length > 0) {
    throw new RangeError(
      `missing Track B drafts for clip particles: ${missingInstanceIds.join(", ")}`,
    );
  }

  for (const particle of clip.particle_instances) {
    for (const fieldName of GESTURE_FIELD_NAMES) {
      const field = particle.fields[fieldName];
      if (field.state !== "suggested" || field.review !== null) {
        throw new RangeError(
          `cannot overwrite reviewed gesture field ${particle.instance_id}.${fieldName}`,
        );
      }
    }
    if (particle.original_track_b_suggestion !== null) {
      throw new RangeError(
        `particle ${particle.instance_id} already retains a Track B suggestion`,
      );
    }
  }

  const nextParticles = clip.particle_instances.map((particle) => {
    const draft = draftsById.get(particle.instance_id);
    if (draft === undefined) {
      throw new RangeError(
        `missing Track B draft for clip particle ${particle.instance_id}`,
      );
    }

    return {
      ...structuredClone(particle),
      original_track_b_suggestion: structuredClone(draft),
      fields: {
        ...structuredClone(particle.fields),
        gesture_present: toReviewField(draft.gesture_present),
        gesture_type: toReviewField(draft.gesture_type),
        gesture_region: toReviewField(draft.gesture_region),
        gesture_timing: toReviewField(draft.gesture_boundaries),
      },
    } satisfies ParticleReview;
  });

  return {
    ...structuredClone(clip),
    version: clip.version + 1,
    particle_instances: nextParticles,
  };
}

function toReviewField<T>(draft: AiDraftField<T>): ReviewField<T> {
  if (draft.confirmed !== false) {
    throw new TypeError("Track B draft fields must remain unconfirmed");
  }

  const source: SuggestionSource = draft.source;
  return {
    state: "suggested",
    value: structuredClone(draft.value),
    suggestion: {
      value: structuredClone(draft.value),
      source,
      confidence: draft.confidence,
    },
    review: null,
  };
}

function assertCanonicalTrackBDraft(
  value: unknown,
  clip: ClipDetail,
): asserts value is GestureAnnotationDraft {
  if (!isRecord(value)) {
    throw new TypeError("Track B draft must be an object");
  }
  const draft = value as unknown as GestureAnnotationDraft;
  if (
    !isRecord(draft.model_evidence) ||
    !isRecord(draft.model_evidence.pegasus) ||
    !Array.isArray(draft.model_evidence.mediapipe_intervals)
  ) {
    throw new TypeError(
      "Track B draft model_evidence must contain Pegasus output and MediaPipe intervals",
    );
  }
  const canonical = reconcileGestureDraft(
    draft.video_id,
    draft.instance_id,
    draft.analysis_window,
    draft.model_evidence.pegasus,
    draft.model_evidence.mediapipe_intervals,
    draft.model_evidence.provider,
  );
  if (canonical.analysis_window.end_ms > clip.video.duration_ms) {
    throw new RangeError(
      "Track B analysis_window must not exceed the source video duration",
    );
  }
  const providerWindow = canonical.model_evidence.provider?.provider_window;
  if (
    providerWindow !== undefined &&
    providerWindow.end_ms > clip.video.duration_ms
  ) {
    throw new RangeError(
      "Track B provider_window must not exceed the source video duration",
    );
  }
  const boundaries = canonical.gesture_boundaries.value;
  if (
    boundaries !== null &&
    (boundaries.start_ms < clip.clip.start_ms ||
      boundaries.end_ms > clip.clip.end_ms)
  ) {
    throw new RangeError(
      "Track B gesture boundaries must fall within the review clip",
    );
  }
  if (!sameJsonValue(draft, canonical)) {
    throw new TypeError(
      "Track B draft must exactly match its canonical model evidence",
    );
  }
}

function sameJsonValue(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) {
    return true;
  }
  if (Array.isArray(left) || Array.isArray(right)) {
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((value, index) => sameJsonValue(value, right[index]))
    );
  }
  if (!isRecord(left) || !isRecord(right)) {
    return false;
  }

  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every(
      (key, index) =>
        key === rightKeys[index] && sameJsonValue(left[key], right[key]),
    )
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
