import assert from "node:assert/strict";
import test from "node:test";

import type { GestureAnnotationDraft } from "../lib/types.ts";
import { mergeTrackBGestureDrafts } from "../lib/track-c/track-b-adapter.ts";
import { applyClipCommand } from "../lib/track-c/review.ts";
import { createDemoClip } from "../lib/track-c/seed.ts";
import type {
  ClipDetail,
  ReviewField,
} from "../lib/track-c/types.ts";

function presentDraft(): GestureAnnotationDraft {
  return {
    video_id: "vid03",
    instance_id: "vid03:u17",
    analysis_window: { start_ms: 12_310, end_ms: 16_560 },
    gesture_present: {
      value: true,
      confidence: 0.81,
      source: "pegasus",
      confirmed: false,
    },
    gesture_type: {
      value: "head_nod",
      confidence: 0.8,
      source: "pegasus",
      confirmed: false,
    },
    gesture_region: {
      value: "face",
      confidence: 0.79,
      source: "pegasus",
      confirmed: false,
    },
    gesture_boundaries: {
      value: { start_ms: 13_900, end_ms: 14_700 },
      confidence: 0.72,
      source: "mediapipe",
      confirmed: false,
    },
    model_evidence: {
      pegasus: {
        gesture_type: "head_nod",
        gesture_region: "face",
        segment: { start_ms: 13_800, end_ms: 14_800 },
        confidence: 0.81,
      },
      mediapipe_intervals: [
        { start_ms: 13_900, end_ms: 14_700, confidence: 0.72 },
      ],
    },
  };
}

function absentDraft(): GestureAnnotationDraft {
  return {
    video_id: "vid03",
    instance_id: "vid03:u17",
    analysis_window: { start_ms: 12_310, end_ms: 16_560 },
    gesture_present: {
      value: false,
      confidence: 0.67,
      source: "pegasus",
      confirmed: false,
    },
    gesture_type: {
      value: "none",
      confidence: 0.67,
      source: "pegasus",
      confirmed: false,
    },
    gesture_region: {
      value: null,
      confidence: 0.67,
      source: "pegasus",
      confirmed: false,
    },
    gesture_boundaries: {
      value: null,
      confidence: 0.67,
      source: "pegasus",
      confirmed: false,
    },
    model_evidence: {
      pegasus: {
        gesture_type: "none",
        gesture_region: null,
        segment: null,
        confidence: 0.67,
      },
      mediapipe_intervals: [
        { start_ms: 14_100, end_ms: 14_400, confidence: 0.43 },
      ],
    },
  };
}

function importableClip(): ClipDetail {
  const clip = createDemoClip();
  clip.clip.status = "draft";
  const fields = clip.particle_instances[0]!.fields;
  fields.gesture_present = unreviewed(fields.gesture_present);
  fields.gesture_type = unreviewed(fields.gesture_type);
  fields.gesture_region = unreviewed(fields.gesture_region);
  fields.gesture_timing = unreviewed(fields.gesture_timing);
  return clip;
}

function unreviewed<T>(field: ReviewField<T>): ReviewField<T> {
  return {
    state: "suggested",
    value: structuredClone(field.suggestion.value),
    suggestion: structuredClone(field.suggestion),
    review: null,
  };
}

test("merges Track B gesture fields without changing clip-owned context", () => {
  const clip = importableClip();
  const draft = presentDraft();
  const originalClipFields = structuredClone(clip.fields);
  const originalVersion = clip.version;

  const merged = mergeTrackBGestureDrafts(clip, [draft]);
  const particle = merged.particle_instances[0]!;

  assert.equal(merged.version, originalVersion + 1);
  assert.deepEqual(merged.fields, originalClipFields);
  assert.deepEqual(particle.fields.gesture_present, {
    state: "suggested",
    value: true,
    suggestion: { value: true, source: "pegasus", confidence: 0.81 },
    review: null,
  });
  assert.deepEqual(particle.fields.gesture_timing, {
    state: "suggested",
    value: { start_ms: 13_900, end_ms: 14_700 },
    suggestion: {
      value: { start_ms: 13_900, end_ms: 14_700 },
      source: "mediapipe",
      confidence: 0.72,
    },
    review: null,
  });
  assert.deepEqual(particle.original_track_b_suggestion, draft);
  assert.notEqual(particle.original_track_b_suggestion, draft);
});

test("preserves a no-gesture suggestion and contradictory motion evidence", () => {
  const draft = absentDraft();
  const merged = mergeTrackBGestureDrafts(importableClip(), [draft]);
  const particle = merged.particle_instances[0]!;

  assert.equal(particle.fields.gesture_present.suggestion.value, false);
  assert.equal(particle.fields.gesture_type.suggestion.value, "none");
  assert.equal(particle.fields.gesture_region.suggestion.value, null);
  assert.equal(particle.fields.gesture_timing.suggestion.value, null);
  assert.deepEqual(
    particle.original_track_b_suggestion?.model_evidence.mediapipe_intervals,
    [{ start_ms: 14_100, end_ms: 14_400, confidence: 0.43 }],
  );

  const reviewed = applyClipCommand(merged, {
    expected_version: merged.version,
    command: "review_field",
    target: {
      scope: "particle",
      instance_id: particle.instance_id,
      field: "gesture_present",
    },
    review: { action: "accept" },
  });
  const reviewedParticle = reviewed.particle_instances[0]!;
  assert.equal(reviewedParticle.fields.gesture_type.value, "none");
  assert.equal(reviewedParticle.fields.gesture_type.state, "confirmed");
  assert.equal(reviewedParticle.fields.gesture_region.state, "skipped");
  assert.equal(reviewedParticle.fields.gesture_timing.state, "skipped");
  assert.deepEqual(reviewedParticle.original_track_b_suggestion, draft);
});

test("rejects incomplete, duplicate, unknown, and cross-video draft sets", () => {
  const clip = importableClip();
  const valid = presentDraft();

  assert.throws(
    () => mergeTrackBGestureDrafts(clip, []),
    /missing Track B drafts/,
  );
  assert.throws(
    () => mergeTrackBGestureDrafts(clip, [valid, valid]),
    /duplicate Track B draft instance_id/,
  );
  assert.throws(
    () =>
      mergeTrackBGestureDrafts(clip, [
        { ...valid, instance_id: "vid03:unknown" },
      ]),
    /no matching clip particle/,
  );
  assert.throws(
    () =>
      mergeTrackBGestureDrafts(clip, [
        {
          ...valid,
          video_id: "vid04",
          instance_id: "vid04:u17",
        },
      ]),
    /belongs to video vid04, not vid03/,
  );
});

test("never overwrites reviewed gesture fields or aliases caller evidence", () => {
  const reviewed = importableClip();
  reviewed.particle_instances[0]!.fields.gesture_type = {
    ...reviewed.particle_instances[0]!.fields.gesture_type,
    state: "confirmed",
    review: {
      action: "accepted",
      reviewer_id: "researcher-1",
      reviewed_at: "2026-07-30T20:00:00.000Z",
    },
  };
  assert.throws(
    () => mergeTrackBGestureDrafts(reviewed, [presentDraft()]),
    /cannot overwrite reviewed gesture field/,
  );

  const draft = presentDraft();
  const merged = mergeTrackBGestureDrafts(importableClip(), [draft]);
  const callerIntervals = draft.model_evidence
    .mediapipe_intervals as Array<{ start_ms: number; end_ms: number }>;
  callerIntervals[0]!.start_ms = 1;

  assert.equal(
    merged.particle_instances[0]!.original_track_b_suggestion?.model_evidence
      .mediapipe_intervals[0]?.start_ms,
    13_900,
  );
});
