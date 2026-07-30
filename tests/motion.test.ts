import assert from "node:assert/strict";
import test from "node:test";

import { detectMotionIntervals } from "../lib/track-b/motion.ts";

test("thresholds motion and bridges one noisy 30fps frame", () => {
  const intervals = detectMotionIntervals(
    [
      { timestamp_ms: 1_000, velocity: 0.1 },
      { timestamp_ms: 1_033, velocity: 0.9 },
      { timestamp_ms: 1_066, velocity: 0.2 },
      { timestamp_ms: 1_099, velocity: 1.1 },
      { timestamp_ms: 1_132, velocity: 0.1 },
      { timestamp_ms: 1_300, velocity: 1.2 },
      { timestamp_ms: 1_333, velocity: 1.3 },
    ],
    { velocity_threshold: 0.8 },
  );

  assert.deepEqual(intervals, [
    { start_ms: 1_033, end_ms: 1_099, confidence: null },
    { start_ms: 1_300, end_ms: 1_333, confidence: null },
  ]);
});

test("drops isolated threshold crossings", () => {
  assert.deepEqual(
    detectMotionIntervals(
      [
        { timestamp_ms: 1_000, velocity: 0.9 },
        { timestamp_ms: 1_200, velocity: 0.2 },
      ],
      { velocity_threshold: 0.8 },
    ),
    [],
  );
});

test("requires ordered frame timestamps and a meaningful threshold", () => {
  assert.throws(
    () =>
      detectMotionIntervals(
        [
          { timestamp_ms: 1_000, velocity: 0.9 },
          { timestamp_ms: 1_000, velocity: 1.0 },
        ],
        { velocity_threshold: 0.8 },
      ),
    /strictly increasing/,
  );

  assert.throws(
    () => detectMotionIntervals([], { velocity_threshold: 0 }),
    /greater than 0/,
  );
});

