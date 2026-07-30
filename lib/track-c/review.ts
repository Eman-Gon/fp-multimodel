import {
  GESTURE_REGIONS,
  GESTURE_TYPES,
  SENTENCE_TYPES,
  TARGET_PARTICLES,
  TONE_CONTOURS,
} from "../vocab.ts";
import type { TimeRange } from "../types.ts";
import type {
  ClipCommand,
  ClipDetail,
  FieldTarget,
  ParticleReview,
  ReviewDecision,
  ReviewField,
  ReviewSummary,
  ReviewUnit,
} from "./types.ts";

const PARTICLE_PINYIN = new Map(
  TARGET_PARTICLES.map(({ token, pinyin }) => [token, pinyin]),
);

export class ReviewCommandError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: unknown;

  constructor(code: string, message: string, status = 422, details?: unknown) {
    super(message);
    this.name = "ReviewCommandError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export function targetKey(target: FieldTarget): string {
  return target.scope === "clip"
    ? `clip:${target.field}`
    : `particle:${target.instance_id}:${target.field}`;
}

export function listReviewUnits(clip: ClipDetail): readonly ReviewUnit[] {
  const units: ReviewUnit[] = [
    clipUnit(clip, "speaker_id", "Speaker"),
    clipUnit(clip, "addressee_id", "Addressee"),
    clipUnit(clip, "fp_count", "FP count"),
    clipUnit(clip, "sentence_type", "Sentence type"),
    clipUnit(clip, "tone_contour", "Tone contour"),
  ];

  for (const [index, particle] of clip.particle_instances.entries()) {
    const prefix =
      clip.particle_instances.length === 1 ? "" : `Particle ${index + 1} · `;
    units.push(
      particleUnit(particle, "fp_token", `${prefix}FP token`),
      particleUnit(particle, "fp_timing", `${prefix}FP timing`),
      particleUnit(
        particle,
        "gesture_present",
        `${prefix}Gesture present`,
      ),
      particleUnit(particle, "gesture_type", `${prefix}Gesture type`),
      particleUnit(particle, "gesture_region", `${prefix}Gesture region`),
      particleUnit(particle, "gesture_timing", `${prefix}Gesture timing`),
    );
  }

  return units;
}

export function summarizeReview(clip: ClipDetail): ReviewSummary {
  const units = listReviewUnits(clip);
  const confirmed = units.filter(
    ({ field }) => field.state === "confirmed",
  ).length;
  const skipped = units.filter(({ field }) => field.state === "skipped").length;
  const blockingFields = units
    .filter(({ field }) => field.state === "suggested")
    .map(({ target }) => target);

  return {
    total: units.length,
    confirmed,
    skipped,
    remaining: blockingFields.length,
    ready: blockingFields.length === 0,
    blocking_fields: blockingFields,
  };
}

export function applyClipCommand(
  current: ClipDetail,
  command: ClipCommand,
  reviewerId = "local-reviewer",
  reviewedAt = new Date().toISOString(),
): ClipDetail {
  if (command.expected_version !== current.version) {
    throw new ReviewCommandError(
      "VERSION_CONFLICT",
      "The clip changed after this review action was prepared.",
      409,
      { current_version: current.version },
    );
  }

  const next = structuredClone(current);

  if (command.command === "confirm_clip") {
    const summary = summarizeReview(next);
    if (!summary.ready) {
      throw new ReviewCommandError(
        "CLIP_NOT_READY",
        `${summary.remaining} review fields still need a decision.`,
        422,
        { blocking_fields: summary.blocking_fields },
      );
    }
    validateResolvedGestureSemantics(next);
    next.clip.status = "confirmed";
    next.version += 1;
    return next;
  }

  const field = findReviewField(next, command.target);
  const review = command.review;

  if (review.action === "accept") {
    const value = field.value ?? field.suggestion.value;
    if (value === null || value === undefined) {
      throw new ReviewCommandError(
        "EMPTY_FIELD",
        "A field without a value cannot be confirmed.",
      );
    }
    field.value = value;
    field.state = "confirmed";
    field.review = decision(
      isSameValue(value, field.suggestion.value) ? "accepted" : "edited",
      reviewerId,
      reviewedAt,
    );
  } else if (review.action === "edit") {
    validateFieldValue(next, command.target, review.value);
    field.value = structuredClone(review.value);

    // Addressee is the least reliable draft. Choosing a different person
    // updates the working value, but the reviewer must still explicitly accept.
    if (
      command.target.scope === "clip" &&
      command.target.field === "addressee_id"
    ) {
      field.state = "suggested";
      field.review = null;
    } else {
      field.state = "confirmed";
      field.review = decision(
        "edited",
        reviewerId,
        reviewedAt,
      );
    }

    if (
      command.target.scope === "particle" &&
      command.target.field === "fp_token"
    ) {
      const particle = findParticle(next, command.target.instance_id);
      particle.fp_pinyin =
        PARTICLE_PINYIN.get(review.value as never) ?? particle.fp_pinyin;
    }
  } else {
    if (review.reason.trim().length === 0) {
      throw new ReviewCommandError(
        "SKIP_REASON_REQUIRED",
        "Skipping a field requires a reason.",
      );
    }
    field.value = null;
    field.state = "skipped";
    field.review = {
      ...decision("skipped", reviewerId, reviewedAt),
      reason: review.reason,
    };
  }

  if (next.clip.status === "draft") {
    next.clip.status = "in_review";
  }
  next.version += 1;
  return next;
}

function decision(
  action: ReviewDecision["action"],
  reviewerId: string,
  reviewedAt: string,
): ReviewDecision {
  return { action, reviewer_id: reviewerId, reviewed_at: reviewedAt };
}

function clipUnit(
  clip: ClipDetail,
  fieldName: keyof ClipDetail["fields"],
  label: string,
): ReviewUnit {
  const target = { scope: "clip", field: fieldName } as const;
  return {
    key: targetKey(target),
    label,
    target,
    field: clip.fields[fieldName] as ReviewField<unknown>,
  };
}

function particleUnit(
  particle: ParticleReview,
  fieldName: keyof ParticleReview["fields"],
  label: string,
): ReviewUnit {
  const target = {
    scope: "particle",
    instance_id: particle.instance_id,
    field: fieldName,
  } as const;
  return {
    key: targetKey(target),
    label,
    target,
    field: particle.fields[fieldName] as ReviewField<unknown>,
  };
}

function findReviewField(
  clip: ClipDetail,
  target: FieldTarget,
): ReviewField<unknown> {
  if (target.scope === "clip") {
    return clip.fields[target.field] as ReviewField<unknown>;
  }

  const particle = findParticle(clip, target.instance_id);
  return particle.fields[target.field] as ReviewField<unknown>;
}

function findParticle(
  clip: ClipDetail,
  instanceId: string,
): ParticleReview {
  const particle = clip.particle_instances.find(
    ({ instance_id }) => instance_id === instanceId,
  );
  if (particle === undefined) {
    throw new ReviewCommandError(
      "PARTICLE_NOT_FOUND",
      `Particle instance ${instanceId} does not exist in this clip.`,
      404,
    );
  }
  return particle;
}

function validateFieldValue(
  clip: ClipDetail,
  target: FieldTarget,
  value: unknown,
): void {
  if (target.scope === "clip") {
    if (target.field === "fp_count") {
      throw new ReviewCommandError(
        "DERIVED_FIELD",
        "FP count is derived from particle instances and cannot be edited.",
      );
    }
    if (target.field === "speaker_id" || target.field === "addressee_id") {
      if (
        typeof value !== "string" ||
        !clip.participant_options.some(({ id }) => id === value)
      ) {
        throw new ReviewCommandError(
          "INVALID_PARTICIPANT",
          "Participant must come from this clip's participant list.",
        );
      }
      return;
    }
    if (
      target.field === "sentence_type" &&
      !includesString(SENTENCE_TYPES, value)
    ) {
      throw new ReviewCommandError(
        "INVALID_SENTENCE_TYPE",
        "Sentence type must use the controlled vocabulary.",
      );
    }
    if (
      target.field === "tone_contour" &&
      !includesString(TONE_CONTOURS, value)
    ) {
      throw new ReviewCommandError(
        "INVALID_TONE_CONTOUR",
        "Tone contour must use the controlled vocabulary.",
      );
    }
    return;
  }

  if (target.field === "fp_token") {
    const tokens = TARGET_PARTICLES.map(({ token }) => token);
    if (!includesString(tokens, value)) {
      throw new ReviewCommandError(
        "INVALID_PARTICLE",
        "Final particle must use the controlled vocabulary.",
      );
    }
  } else if (
    target.field === "fp_timing" ||
    target.field === "gesture_timing"
  ) {
    validateTimeRange(value, clip.video.duration_ms);
  } else if (target.field === "gesture_present") {
    if (typeof value !== "boolean") {
      throw new ReviewCommandError(
        "INVALID_GESTURE_PRESENCE",
        "Gesture presence must be a boolean.",
      );
    }
  } else if (
    target.field === "gesture_type" &&
    !includesString(GESTURE_TYPES, value)
  ) {
    throw new ReviewCommandError(
      "INVALID_GESTURE_TYPE",
      "Gesture type must use the controlled vocabulary.",
    );
  } else if (
    target.field === "gesture_region" &&
    !includesString(GESTURE_REGIONS, value)
  ) {
    throw new ReviewCommandError(
      "INVALID_GESTURE_REGION",
      "Gesture region must use the controlled vocabulary.",
    );
  }
}

function validateTimeRange(value: unknown, durationMs: number): void {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new ReviewCommandError(
      "INVALID_TIME_RANGE",
      "Timing must contain start_ms and end_ms.",
    );
  }
  const range = value as Partial<TimeRange>;
  if (
    !Number.isSafeInteger(range.start_ms) ||
    !Number.isSafeInteger(range.end_ms) ||
    range.start_ms === undefined ||
    range.end_ms === undefined ||
    range.start_ms < 0 ||
    range.end_ms <= range.start_ms ||
    range.end_ms > durationMs
  ) {
    throw new ReviewCommandError(
      "INVALID_TIME_RANGE",
      "Timing must be an ordered integer-millisecond range inside the source video.",
    );
  }
}

function validateResolvedGestureSemantics(clip: ClipDetail): void {
  for (const particle of clip.particle_instances) {
    const present = particle.fields.gesture_present;
    const type = particle.fields.gesture_type;
    if (
      present.state === "confirmed" &&
      type.state === "confirmed" &&
      present.value === false &&
      type.value !== "none"
    ) {
      throw new ReviewCommandError(
        "GESTURE_STATE_CONFLICT",
        "A confirmed absent gesture must use gesture type none or skip the type field.",
      );
    }
    if (
      present.state === "confirmed" &&
      type.state === "confirmed" &&
      present.value === true &&
      type.value === "none"
    ) {
      throw new ReviewCommandError(
        "GESTURE_STATE_CONFLICT",
        "A confirmed present gesture cannot use gesture type none.",
      );
    }
  }
}

function includesString(
  values: readonly string[],
  value: unknown,
): value is string {
  return typeof value === "string" && values.includes(value);
}

function isSameValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

