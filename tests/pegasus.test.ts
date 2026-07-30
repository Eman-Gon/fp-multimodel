import assert from "node:assert/strict";
import test from "node:test";

import {
  buildPegasusGesturePrompt,
  parsePegasusGesture,
} from "../lib/track-b/pegasus.ts";

const window = { start_ms: 2_000, end_ms: 6_000 };

test("the Pegasus prompt requires absolute milliseconds and a controlled taxonomy", () => {
  const prompt = buildPegasusGesturePrompt(window);

  assert.match(prompt, /absolute source-video timestamps 2000ms and 6000ms/);
  assert.match(prompt, /head_nod/);
  assert.match(prompt, /gesture_type "none"/);
});

test("parses a schema-compliant detected gesture", () => {
  assert.deepEqual(
    parsePegasusGesture(
      {
        gesture_type: "head_nod",
        gesture_region: "face",
        start_ms: 3_100,
        end_ms: 3_700,
        confidence: 0.81,
      },
      window,
    ),
    {
      gesture_type: "head_nod",
      gesture_region: "face",
      segment: { start_ms: 3_100, end_ms: 3_700 },
      confidence: 0.81,
    },
  );
});

test("normalizes none to absent region and boundaries", () => {
  assert.deepEqual(
    parsePegasusGesture(
      JSON.stringify({
        gesture_type: "none",
        gesture_region: null,
        start_ms: null,
        end_ms: null,
        confidence: 0.64,
      }),
      window,
    ),
    {
      gesture_type: "none",
      gesture_region: null,
      segment: null,
      confidence: 0.64,
    },
  );
});

test("rejects unknown vocabulary and ambiguous timestamp coordinates", () => {
  assert.throws(
    () =>
      parsePegasusGesture(
        {
          gesture_type: "wave",
          gesture_region: "body",
          start_ms: 3_000,
          end_ms: 3_500,
          confidence: 0.9,
        },
        window,
      ),
    /controlled vocabulary/,
  );

  assert.throws(
    () =>
      parsePegasusGesture(
        {
          gesture_type: "hand_beat",
          gesture_region: "body",
          start_ms: 0,
          end_ms: 500,
          confidence: 0.9,
        },
        window,
      ),
    /analysis window/,
  );
});

