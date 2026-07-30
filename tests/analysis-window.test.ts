import assert from "node:assert/strict";
import test from "node:test";

import {
  createGestureAnalysisWindow,
  TRACK_B_WINDOW_PADDING_MS,
} from "../lib/track-b/analysis-window.ts";

test("builds the B1 window with two seconds on each side", () => {
  assert.equal(TRACK_B_WINDOW_PADDING_MS, 2_000);
  assert.deepEqual(
    createGestureAnalysisWindow(
      { instance_id: "fp-1", fp_start_ms: 4_000, fp_end_ms: 4_250 },
      10_000,
    ),
    { start_ms: 2_000, end_ms: 6_250 },
  );
});

test("clamps the analysis window to the source video", () => {
  assert.deepEqual(
    createGestureAnalysisWindow(
      { instance_id: "fp-start", fp_start_ms: 500, fp_end_ms: 700 },
      10_000,
    ),
    { start_ms: 0, end_ms: 2_700 },
  );

  assert.deepEqual(
    createGestureAnalysisWindow(
      { instance_id: "fp-end", fp_start_ms: 9_500, fp_end_ms: 9_900 },
      10_000,
    ),
    { start_ms: 7_500, end_ms: 10_000 },
  );
});

test("rejects invalid Track A timestamps instead of silently correcting them", () => {
  assert.throws(
    () =>
      createGestureAnalysisWindow(
        { instance_id: "fp-1", fp_start_ms: 500, fp_end_ms: 400 },
        10_000,
      ),
    /end_ms must be greater/,
  );

  assert.throws(
    () =>
      createGestureAnalysisWindow(
        { instance_id: "fp-1", fp_start_ms: 9_900, fp_end_ms: 10_100 },
        10_000,
      ),
    /must not exceed/,
  );
});

