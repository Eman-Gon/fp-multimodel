import assert from "node:assert/strict";
import test from "node:test";
import {
  applyClipCommand,
  isFieldTarget,
  listReviewUnits,
  ReviewCommandError,
} from "../lib/track-c/review.ts";
import { createDemoClip } from "../lib/track-c/seed.ts";
import type {
  ClipCommand,
  FieldTarget,
} from "../lib/track-c/types.ts";

const REVIEWED_AT = "2026-07-30T20:00:00.000Z";

test("field targets use a closed whitelist before object lookup", () => {
  assert.equal(
    isFieldTarget({ scope: "clip", field: "sentence_type" }),
    true,
  );
  assert.equal(
    isFieldTarget({ scope: "clip", field: "__proto__" }),
    false,
  );
  assert.equal(
    isFieldTarget({
      scope: "particle",
      instance_id: "",
      field: "gesture_type",
    }),
    false,
  );

  const clip = createDemoClip();
  const maliciousCommand = {
    expected_version: clip.version,
    command: "review_field",
    target: { scope: "clip", field: "__proto__" },
    review: { action: "edit", value: { unsafe: true } },
  } as unknown as ClipCommand;

  assert.throws(
    () => applyClipCommand(clip, maliciousCommand),
    hasReviewError("INVALID_FIELD_TARGET"),
  );
  assert.equal(
    Object.prototype.hasOwnProperty.call(Object.prototype, "value"),
    false,
  );
  assert.equal(
    Object.prototype.hasOwnProperty.call(Object.prototype, "state"),
    false,
  );
  assert.equal(
    Object.prototype.hasOwnProperty.call(Object.prototype, "review"),
    false,
  );
});

test("FP count is a non-reviewable invariant derived from particle instances", () => {
  const clip = createDemoClip();
  assert.throws(
    () =>
      applyClipCommand(clip, {
        expected_version: clip.version,
        command: "review_field",
        target: { scope: "clip", field: "fp_count" },
        review: {
          action: "skip",
          reason: "Attempt to bypass the derived count.",
        },
      }),
    hasReviewError("DERIVED_FIELD"),
  );

  const inconsistent = createDemoClip();
  inconsistent.fields.fp_count.value = 2;
  assert.throws(
    () =>
      applyClipCommand(inconsistent, {
        expected_version: inconsistent.version,
        command: "review_field",
        target: { scope: "clip", field: "sentence_type" },
        review: { action: "accept" },
      }),
    hasReviewError("INVALID_DERIVED_FP_COUNT"),
  );
});

test("particle and gesture edits stay inside clip bounds on the source timeline", () => {
  const clip = createDemoClip();
  const instanceId = clip.particle_instances[0]!.instance_id;
  const target: FieldTarget = {
    scope: "particle",
    instance_id: instanceId,
    field: "fp_timing",
  };

  assert.throws(
    () =>
      applyClipCommand(clip, {
        expected_version: clip.version,
        command: "review_field",
        target,
        review: {
          action: "edit",
          value: {
            start_ms: clip.clip.start_ms - 200,
            end_ms: clip.clip.start_ms - 100,
          },
        },
      }),
    hasReviewError("INVALID_TIME_RANGE"),
  );

  assert.throws(
    () =>
      applyClipCommand(clip, {
        expected_version: clip.version,
        command: "review_field",
        target,
        review: {
          action: "edit",
          value: {
            start_ms: clip.clip.end_ms - 100,
            end_ms: clip.clip.end_ms + 100,
          },
        },
      }),
    hasReviewError("INVALID_TIME_RANGE"),
  );

  const edited = applyClipCommand(clip, {
    expected_version: clip.version,
    command: "review_field",
    target,
    review: {
      action: "edit",
      value: {
        start_ms: clip.clip.start_ms,
        end_ms: clip.clip.start_ms + 100,
      },
    },
  });
  assert.deepEqual(edited.particle_instances[0]!.fields.fp_timing.value, {
    start_ms: clip.clip.start_ms,
    end_ms: clip.clip.start_ms + 100,
  });
});

test("marking a gesture absent resolves dependent fields without losing suggestions", () => {
  const clip = createDemoClip();
  const particle = clip.particle_instances[0]!;
  const originalTypeSuggestion = structuredClone(
    particle.fields.gesture_type.suggestion,
  );
  const originalRegionSuggestion = structuredClone(
    particle.fields.gesture_region.suggestion,
  );
  const originalTimingSuggestion = structuredClone(
    particle.fields.gesture_timing.suggestion,
  );

  const absent = applyClipCommand(
    clip,
    {
      expected_version: clip.version,
      command: "review_field",
      target: {
        scope: "particle",
        instance_id: particle.instance_id,
        field: "gesture_present",
      },
      review: { action: "edit", value: false },
    },
    "integrity-reviewer",
    REVIEWED_AT,
  );
  const fields = absent.particle_instances[0]!.fields;

  assert.equal(fields.gesture_present.value, false);
  assert.equal(fields.gesture_present.state, "confirmed");
  assert.equal(fields.gesture_type.value, "none");
  assert.equal(fields.gesture_type.state, "confirmed");
  assert.equal(fields.gesture_type.review?.action, "edited");
  assert.equal(fields.gesture_region.value, null);
  assert.equal(fields.gesture_region.state, "skipped");
  assert.equal(fields.gesture_timing.value, null);
  assert.equal(fields.gesture_timing.state, "skipped");
  assert.deepEqual(fields.gesture_type.suggestion, originalTypeSuggestion);
  assert.deepEqual(fields.gesture_region.suggestion, originalRegionSuggestion);
  assert.deepEqual(fields.gesture_timing.suggestion, originalTimingSuggestion);

  assert.throws(
    () =>
      applyClipCommand(absent, {
        expected_version: absent.version,
        command: "review_field",
        target: {
          scope: "particle",
          instance_id: particle.instance_id,
          field: "gesture_region",
        },
        review: { action: "accept" },
      }),
    hasReviewError("GESTURE_STATE_CONFLICT"),
  );

  let reviewed = absent;
  while (true) {
    const unresolved = listReviewUnits(reviewed).find(
      ({ field }) => field.state === "suggested",
    );
    if (unresolved === undefined) {
      break;
    }
    reviewed = applyClipCommand(reviewed, {
      expected_version: reviewed.version,
      command: "review_field",
      target: unresolved.target,
      review: { action: "accept" },
    });
  }
  const confirmed = applyClipCommand(reviewed, {
    expected_version: reviewed.version,
    command: "confirm_clip",
  });
  assert.equal(confirmed.clip.status, "confirmed");
});

test("a present gesture cannot resolve to gesture type none", () => {
  const clip = createDemoClip();
  const particle = clip.particle_instances[0]!;
  assert.equal(particle.fields.gesture_present.value, true);

  assert.throws(
    () =>
      applyClipCommand(clip, {
        expected_version: clip.version,
        command: "review_field",
        target: {
          scope: "particle",
          instance_id: particle.instance_id,
          field: "gesture_type",
        },
        review: { action: "edit", value: "none" },
      }),
    hasReviewError("GESTURE_STATE_CONFLICT"),
  );
});

function hasReviewError(code: string): (error: unknown) => boolean {
  return (error) =>
    error instanceof ReviewCommandError && error.code === code;
}
