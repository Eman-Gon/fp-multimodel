import type {
  AiDraftField,
  GestureAnnotationDraft,
} from "../types.ts";
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
  for (const draft of drafts) {
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
