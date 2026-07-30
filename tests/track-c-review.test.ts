import assert from "node:assert/strict";
import test from "node:test";
import {
  applyClipCommand,
  listReviewUnits,
  ReviewCommandError,
  summarizeReview,
  targetKey,
} from "../lib/track-c/review.ts";
import { createDemoClip, createDemoClips } from "../lib/track-c/seed.ts";
import { VIDEO_SOURCE_REFERENCES } from "../lib/track-c/sources.ts";
import {
  EXTENDED_PARTICLE_CANDIDATES,
  TARGET_PARTICLES,
} from "../lib/vocab.ts";
import type {
  ClipDetail,
  FieldTarget,
  ReviewField,
} from "../lib/track-c/types.ts";
import {
  frameToSourceMilliseconds,
  sourceMillisecondsToFrame,
} from "../components/coding/time.ts";

const ADDRESSEE: FieldTarget = {
  scope: "clip",
  field: "addressee_id",
};

test("seeded clip exposes multimodal meaning fields and honest gating", () => {
  const clip = createDemoClip();
  const summary = summarizeReview(clip);

  assert.equal(summary.total, 15);
  assert.equal(summary.confirmed, 11);
  assert.equal(summary.remaining, 4);
  assert.equal(summary.ready, false);
  assert.equal(clip.demo_fixture, true);
});

test("editing addressee updates the working value but still requires accept", () => {
  const clip = createDemoClip();
  const edited = applyClipCommand(clip, {
    expected_version: clip.version,
    command: "review_field",
    target: ADDRESSEE,
    review: { action: "edit", value: "unknown" },
  });

  assert.equal(edited.fields.addressee_id.value, "unknown");
  assert.equal(edited.fields.addressee_id.state, "suggested");
  assert.equal(edited.fields.addressee_id.review, null);

  const accepted = applyClipCommand(edited, {
    expected_version: edited.version,
    command: "review_field",
    target: ADDRESSEE,
    review: { action: "accept" },
  });
  assert.equal(accepted.fields.addressee_id.state, "confirmed");
  assert.equal(accepted.fields.addressee_id.review?.action, "edited");
});

test("editing one gesture field confirms only that field", () => {
  const clip = createDemoClip();
  const particle = clip.particle_instances[0]!;
  const originalGestureTimingState = particle.fields.gesture_timing.state;
  const target: FieldTarget = {
    scope: "particle",
    instance_id: particle.instance_id,
    field: "gesture_type",
  };
  const edited = applyClipCommand(clip, {
    expected_version: clip.version,
    command: "review_field",
    target,
    review: { action: "edit", value: "head_shake" },
  });

  assert.equal(
    edited.particle_instances[0]!.fields.gesture_type.state,
    "confirmed",
  );
  assert.equal(
    edited.particle_instances[0]!.fields.gesture_timing.state,
    originalGestureTimingState,
  );
  assert.equal(edited.fields.addressee_id.state, "suggested");
});

test("skip is explicit and preserves the original suggestion", () => {
  const clip = createDemoClip();
  const target: FieldTarget = { scope: "clip", field: "tone_contour" };
  const skipped = applyClipCommand(clip, {
    expected_version: clip.version,
    command: "review_field",
    target,
    review: { action: "skip", reason: "Pitch is not measurable." },
  });

  assert.equal(skipped.fields.tone_contour.state, "skipped");
  assert.equal(skipped.fields.tone_contour.value, null);
  assert.equal(skipped.fields.tone_contour.suggestion.value, "rising");
  assert.equal(skipped.fields.tone_contour.review?.reason, "Pitch is not measurable.");
});

test("confirmation refuses unresolved AI suggestions", () => {
  const clip = createDemoClip();
  assert.throws(
    () =>
      applyClipCommand(clip, {
        expected_version: clip.version,
        command: "confirm_clip",
      }),
    (error: unknown) =>
      error instanceof ReviewCommandError &&
      error.code === "CLIP_NOT_READY",
  );
});

test("confirmed coding is read-only until the demo is reset", () => {
  let clip = createDemoClip();
  for (const unit of listReviewUnits(clip)) {
    if (unit.field.state !== "suggested") {
      continue;
    }
    clip = applyClipCommand(clip, {
      expected_version: clip.version,
      command: "review_field",
      target: unit.target,
      review: { action: "accept" },
    });
  }
  clip = applyClipCommand(clip, {
    expected_version: clip.version,
    command: "confirm_clip",
  });

  assert.equal(clip.clip.status, "confirmed");
  assert.throws(
    () =>
      applyClipCommand(clip, {
        expected_version: clip.version,
        command: "review_field",
        target: ADDRESSEE,
        review: { action: "accept" },
      }),
    (error: unknown) =>
      error instanceof ReviewCommandError &&
      error.code === "CLIP_CONFIRMED_READ_ONLY",
  );
});

test("invalid or out-of-bounds ranges are rejected", () => {
  const clip = createDemoClip();
  const instanceId = clip.particle_instances[0]!.instance_id;
  assert.throws(
    () =>
      applyClipCommand(clip, {
        expected_version: clip.version,
        command: "review_field",
        target: {
          scope: "particle",
          instance_id: instanceId,
          field: "fp_timing",
        },
        review: {
          action: "edit",
          value: { start_ms: 14_800, end_ms: 14_200 },
        },
      }),
    (error: unknown) =>
      error instanceof ReviewCommandError &&
      error.code === "INVALID_TIME_RANGE",
  );
});

test("multi-particle review keys preserve instance pairing", () => {
  const base = createDemoClip();
  const first = base.particle_instances[0]!;
  const second = structuredClone(first);
  Object.assign(second, {
    instance_id: "vid03:u18",
    surface_form: "呢",
    fp_pinyin: "ne",
  });
  second.fields.fp_token = confirmedField("呢");
  second.fields.fp_timing = suggestedField({
    start_ms: 17_200,
    end_ms: 17_430,
  });
  const multi: ClipDetail = {
    ...base,
    fields: {
      ...base.fields,
      fp_count: confirmedField(2),
    },
    particle_instances: [first, second],
  };

  const units = listReviewUnits(multi);
  const fpTimingKeys = units
    .filter(({ target }) =>
      target.scope === "particle" ? target.field === "fp_timing" : false,
    )
    .map(({ target }) => targetKey(target));

  assert.equal(units.length, 21);
  assert.deepEqual(fpTimingKeys, [
    `particle:${first.instance_id}:fp_timing`,
    `particle:${second.instance_id}:fp_timing`,
  ]);
});

test("demo corpus contains clips from multiple independent videos", () => {
  const clips = createDemoClips();

  assert.equal(clips.length, 2);
  assert.deepEqual(
    clips.map(({ video }) => video.id),
    ["vid03", "vid04"],
  );
  assert.equal(new Set(clips.map(({ clip }) => clip.name)).size, 2);
  assert.deepEqual(
    clips.map(({ particle_instances }) =>
      particle_instances[0]?.fields.fp_token.value,
    ),
    ["吗", "吧"],
  );
  assert.deepEqual(
    clips.map(({ particle_instances }) =>
      particle_instances[0]?.instance_id,
    ),
    ["vid03:u17", "vid04:u09"],
  );
});

test("extended candidates and external source remain explicitly unverified", () => {
  assert.equal(
    new Set(EXTENDED_PARTICLE_CANDIDATES).size,
    EXTENDED_PARTICLE_CANDIDATES.length,
  );
  const canonical = new Set(TARGET_PARTICLES.map(({ token }) => token));
  assert.equal(
    EXTENDED_PARTICLE_CANDIDATES.some((candidate) =>
      canonical.has(candidate as never),
    ),
    false,
  );
  assert.equal(VIDEO_SOURCE_REFERENCES[0]?.id, "yt_OvX0ccTNYDs");
  assert.equal(
    VIDEO_SOURCE_REFERENCES[0]?.region_verification,
    "unverified",
  );
});

test("frame conversion steps from canonical source time without drift", () => {
  const fps = 30;
  let frame = sourceMillisecondsToFrame(14_310, fps);
  for (let index = 0; index < 300; index += 1) {
    frame += 1;
  }
  const steppedMilliseconds = frameToSourceMilliseconds(frame, fps);
  const roundTrippedFrame = sourceMillisecondsToFrame(
    steppedMilliseconds,
    fps,
  );

  assert.equal(roundTrippedFrame, frame);
});

function suggestedField<T>(value: T): ReviewField<T> {
  return {
    state: "suggested",
    value,
    suggestion: { value, source: "fixture", confidence: 0.7 },
    review: null,
  };
}

function confirmedField<T>(value: T): ReviewField<T> {
  return {
    state: "confirmed",
    value,
    suggestion: { value, source: "fixture", confidence: 1 },
    review: {
      action: "accepted",
      reviewer_id: "test-reviewer",
      reviewed_at: "2026-07-30T18:00:00.000Z",
    },
  };
}
