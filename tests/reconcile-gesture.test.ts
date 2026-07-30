import assert from "node:assert/strict";
import test from "node:test";

import {
  reconcileGestureDraft,
  selectNearestMotionInterval,
} from "../lib/track-b/reconcile-gesture.ts";

const analysisWindow = { start_ms: 2_000, end_ms: 6_000 };

test("keeps Pegasus semantics and uses the nearest coherent MediaPipe interval", () => {
  const draft = reconcileGestureDraft(
    "vid1",
    "fp-1",
    analysisWindow,
    {
      gesture_type: "head_nod",
      gesture_region: "face",
      segment: { start_ms: 3_000, end_ms: 4_000 },
      confidence: 0.82,
    },
    [
      { start_ms: 2_900, end_ms: 3_300, confidence: 0.61 },
      { start_ms: 3_100, end_ms: 3_950, confidence: 0.74 },
    ],
  );

  assert.deepEqual(draft.gesture_type, {
    value: "head_nod",
    confidence: 0.82,
    source: "pegasus",
    confirmed: false,
  });
  assert.deepEqual(draft.gesture_boundaries, {
    value: { start_ms: 3_100, end_ms: 3_950 },
    confidence: 0.74,
    source: "mediapipe",
    confirmed: false,
  });
  assert.notEqual(draft.gesture_present, draft.gesture_boundaries);
  assert.equal(draft.video_id, "vid1");
  assert.deepEqual(draft.model_evidence, {
    pegasus: {
      gesture_type: "head_nod",
      gesture_region: "face",
      segment: { start_ms: 3_000, end_ms: 4_000 },
      confidence: 0.82,
    },
    mediapipe_intervals: [
      { start_ms: 2_900, end_ms: 3_300, confidence: 0.61 },
      { start_ms: 3_100, end_ms: 3_950, confidence: 0.74 },
    ],
  });
});

test("falls back honestly to coarse Pegasus timing when no motion overlaps", () => {
  const draft = reconcileGestureDraft(
    "vid1",
    "fp-1",
    analysisWindow,
    {
      gesture_type: "open_palm",
      gesture_region: "body",
      segment: { start_ms: 3_000, end_ms: 4_000 },
      confidence: 0.7,
    },
    [{ start_ms: 4_500, end_ms: 4_900, confidence: 0.9 }],
  );

  assert.deepEqual(draft.gesture_boundaries, {
    value: { start_ms: 3_000, end_ms: 4_000 },
    confidence: 0.7,
    source: "pegasus",
    confirmed: false,
  });
});

test("a none result never invents region or timestamps", () => {
  const draft = reconcileGestureDraft(
    "vid1",
    "fp-1",
    analysisWindow,
    {
      gesture_type: "none",
      gesture_region: null,
      segment: null,
      confidence: 0.88,
    },
    [],
  );

  assert.equal(draft.gesture_present.value, false);
  assert.equal(draft.gesture_present.confirmed, false);
  assert.equal(draft.gesture_region.value, null);
  assert.equal(draft.gesture_boundaries.value, null);
});

test("rejects contradictory none inputs at the public reconciliation boundary", () => {
  assert.throws(
    () =>
      reconcileGestureDraft(
        "vid1",
        "fp-1",
        analysisWindow,
        {
          gesture_type: "none",
          gesture_region: "face",
          segment: { start_ms: 3_000, end_ms: 3_200 },
          confidence: 0.8,
        },
        [],
      ),
    /require a null region and segment/,
  );

  assert.throws(
    () =>
      reconcileGestureDraft(
        "vid1",
        "fp-1",
        analysisWindow,
        {
          gesture_type: "none",
          gesture_region: null,
          segment: null,
          confidence: 0.8,
        },
        [{ start_ms: 3_000, end_ms: 3_200 }],
      ),
    /cannot have motion intervals/,
  );
});

test("nearest interval selection has deterministic tie-breaking", () => {
  assert.deepEqual(
    selectNearestMotionInterval(
      { start_ms: 3_000, end_ms: 4_000 },
      [
        { start_ms: 3_100, end_ms: 3_900 },
        { start_ms: 2_900, end_ms: 4_100 },
      ],
    ),
    { start_ms: 3_100, end_ms: 3_900 },
  );
});

test("does not use MediaPipe boundaries outside the Pegasus segment", () => {
  assert.equal(
    selectNearestMotionInterval(
      { start_ms: 3_000, end_ms: 4_000 },
      [{ start_ms: 2_900, end_ms: 4_100 }],
    ),
    null,
  );
});
