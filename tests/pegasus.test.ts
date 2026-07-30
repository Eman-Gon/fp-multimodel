import assert from "node:assert/strict";
import test from "node:test";

import {
  PEGASUS_GESTURE_RESPONSE_SCHEMA,
  buildPegasusGesturePrompt,
  parsePegasusGesture,
} from "../lib/track-b/pegasus.ts";

const window = { start_ms: 2_000, end_ms: 6_000 };
const trackAProvenance = {
  source: "mfa_rule" as const,
  confidence: null,
  confirmed: false as const,
};

test("the Pegasus prompt requires absolute milliseconds and a controlled taxonomy", () => {
  const prompt = buildPegasusGesturePrompt(window);

  assert.match(prompt, /absolute source-video timestamps 2000ms and 6000ms/);
  assert.match(prompt, /head_nod/);
  assert.match(prompt, /gesture_type "none"/);
});

test("the Pegasus response schema uses only provider-supported numeric fields", () => {
  const serialized = JSON.stringify(PEGASUS_GESTURE_RESPONSE_SCHEMA);

  assert.equal(serialized.includes('"minimum"'), false);
  assert.equal(serialized.includes('"maximum"'), false);
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

test("adds exact particle context when Track A metadata is available", () => {
  const prompt = buildPegasusGesturePrompt(window, {
    ...trackAProvenance,
    instance_id: "vid1:u1",
    fp_token: "吗",
    fp_pinyin: "ma",
    surface_form: "嗎",
    fp_start_ms: 3_200,
    fp_end_ms: 3_450,
    utterance_id: "u1",
  });

  assert.match(prompt, /target particle 嗎 \(ma; canonical token 吗\)/);
  assert.match(prompt, /spans 3200ms to 3450ms/);
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

test("enforces the strict none shape and rejects extra model fields", () => {
  assert.throws(
    () =>
      parsePegasusGesture(
        {
          gesture_type: "none",
          gesture_region: "face",
          start_ms: 3_000,
          end_ms: 3_200,
          confidence: 0.8,
        },
        window,
      ),
    /require null/,
  );

  assert.throws(
    () =>
      parsePegasusGesture(
        {
          gesture_type: "head_nod",
          gesture_region: "face",
          start_ms: 3_000,
          end_ms: 3_200,
          confidence: 0.8,
          explanation: "visible movement",
        },
        window,
      ),
    /unexpected properties/,
  );
});
