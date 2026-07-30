import assert from "node:assert/strict";
import test from "node:test";

import type {
  MotionDetectionRequest,
  SemanticGestureRequest,
} from "../lib/types.ts";
import { draftTrackBAnnotations } from "../lib/track-b/pipeline.ts";

test("drafts each particle in a multi-particle video under its own instance_id", async () => {
  const semanticCalls: SemanticGestureRequest[] = [];
  const motionCalls: MotionDetectionRequest[] = [];

  const drafts = await draftTrackBAnnotations(
    {
      video_id: "vid-03",
      video_duration_ms: 20_000,
      particle_instances: [
        { instance_id: "fp-ne", fp_start_ms: 4_000, fp_end_ms: 4_200 },
        { instance_id: "fp-ma", fp_start_ms: 10_000, fp_end_ms: 10_250 },
      ],
    },
    {
      semanticAnalyzer: {
        async analyzeGesture(request) {
          semanticCalls.push(request);
          return request.instance_id === "fp-ne"
            ? {
                gesture_type: "head_tilt",
                gesture_region: "face",
                start_ms: 3_800,
                end_ms: 4_300,
                confidence: 0.79,
              }
            : {
                gesture_type: "none",
                gesture_region: null,
                start_ms: null,
                end_ms: null,
                confidence: 0.65,
              };
        },
      },
      motionAnalyzer: {
        async detectMotion(request) {
          motionCalls.push(request);
          return [{ start_ms: 3_900, end_ms: 4_250, confidence: 0.72 }];
        },
      },
    },
  );

  assert.deepEqual(
    drafts.map((draft) => draft.instance_id),
    ["fp-ne", "fp-ma"],
  );
  assert.equal(semanticCalls.length, 2);
  assert.equal(motionCalls.length, 1);
  assert.equal(drafts[0]!.gesture_boundaries.source, "mediapipe");
  assert.equal(drafts[1]!.gesture_boundaries.value, null);
});

test("rejects duplicate instance IDs before ambiguous graph links are emitted", async () => {
  await assert.rejects(
    draftTrackBAnnotations(
      {
        video_id: "vid-03",
        video_duration_ms: 20_000,
        particle_instances: [
          { instance_id: "fp-1", fp_start_ms: 4_000, fp_end_ms: 4_200 },
          { instance_id: "fp-1", fp_start_ms: 6_000, fp_end_ms: 6_200 },
        ],
      },
      {
        semanticAnalyzer: {
          async analyzeGesture() {
            return {
              gesture_type: "none",
              gesture_region: null,
              start_ms: null,
              end_ms: null,
              confidence: 0.5,
            };
          },
        },
        motionAnalyzer: {
          async detectMotion() {
            return [];
          },
        },
      },
    ),
    /duplicate particle instance_id/,
  );
});

