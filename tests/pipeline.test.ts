import assert from "node:assert/strict";
import test from "node:test";

import type {
  MotionDetectionRequest,
  SemanticGestureRequest,
} from "../lib/types.ts";
import {
  draftTrackBAnnotations,
  draftTrackBBatchAnnotations,
} from "../lib/track-b/pipeline.ts";

const trackAProvenance = {
  source: "mfa_rule" as const,
  confidence: null,
  confirmed: false as const,
};

test("drafts each particle in a multi-particle video under its own instance_id", async () => {
  const semanticCalls: SemanticGestureRequest[] = [];
  const motionCalls: MotionDetectionRequest[] = [];

  const drafts = await draftTrackBAnnotations(
    {
      video_id: "vid-03",
      video_duration_ms: 20_000,
      particle_instances: [
        {
          ...trackAProvenance,
          instance_id: "fp-ne",
          fp_token: "呢",
          fp_pinyin: "ne",
          surface_form: "呢",
          fp_start_ms: 4_000,
          fp_end_ms: 4_200,
          utterance_id: "u1",
        },
        {
          ...trackAProvenance,
          instance_id: "fp-ma",
          fp_token: "吗",
          fp_pinyin: "ma",
          surface_form: "嗎",
          fp_start_ms: 10_000,
          fp_end_ms: 10_250,
          utterance_id: "u2",
        },
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
  assert.equal(semanticCalls[0]!.particle.fp_token, "呢");
  assert.equal(motionCalls[0]!.semantic_gesture.gesture_type, "head_tilt");
  assert.equal(drafts[0]!.gesture_boundaries.source, "mediapipe");
  assert.equal(drafts[1]!.gesture_boundaries.value, null);
});

test("rejects duplicate instance IDs before ambiguous graph links are emitted", async () => {
  let semanticCallCount = 0;

  await assert.rejects(
    draftTrackBAnnotations(
      {
        video_id: "vid-03",
        video_duration_ms: 20_000,
        particle_instances: [
          {
            ...trackAProvenance,
            instance_id: "fp-1",
            fp_token: "呢",
            fp_pinyin: "ne",
            surface_form: "呢",
            fp_start_ms: 4_000,
            fp_end_ms: 4_200,
            utterance_id: "u1",
          },
          {
            ...trackAProvenance,
            instance_id: "fp-1",
            fp_token: "吗",
            fp_pinyin: "ma",
            surface_form: "吗",
            fp_start_ms: 6_000,
            fp_end_ms: 6_200,
            utterance_id: "u2",
          },
        ],
      },
      {
        semanticAnalyzer: {
          async analyzeGesture() {
            semanticCallCount += 1;
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
  assert.equal(semanticCallCount, 0);
});

test("batch analysis preserves each video's identity and source timeline", async () => {
  const result = await draftTrackBBatchAnnotations(
    {
      project_id: "project-1",
      videos: [
        {
          video_id: "vid1",
          video_duration_ms: 10_000,
          particle_instances: [
            {
              ...trackAProvenance,
              instance_id: "vid1:fp-1",
              fp_token: "吗",
              fp_pinyin: "ma",
              surface_form: "吗",
              fp_start_ms: 1_000,
              fp_end_ms: 1_200,
              utterance_id: "u1",
            },
          ],
        },
        {
          video_id: "vid2",
          video_duration_ms: 20_000,
          particle_instances: [
            {
              ...trackAProvenance,
              instance_id: "vid2:fp-1",
              fp_token: "吧",
              fp_pinyin: "ba",
              surface_form: "吧",
              fp_start_ms: 15_000,
              fp_end_ms: 15_200,
              utterance_id: "u1",
            },
          ],
        },
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
            confidence: 0.75,
          };
        },
      },
      motionAnalyzer: {
        async detectMotion() {
          return [];
        },
      },
    },
  );

  assert.deepEqual(
    result.map(({ video_id }) => video_id),
    ["vid1", "vid2"],
  );
  assert.equal(result[0]?.annotations[0]?.analysis_window.start_ms, 0);
  assert.equal(result[1]?.annotations[0]?.analysis_window.start_ms, 13_000);
});

test("batch analysis rejects duplicate video ids", async () => {
  await assert.rejects(
    draftTrackBBatchAnnotations(
      {
        project_id: "project-1",
        videos: [
          {
            video_id: "vid1",
            video_duration_ms: 1_000,
            particle_instances: [],
          },
          {
            video_id: "vid1",
            video_duration_ms: 2_000,
            particle_instances: [],
          },
        ],
      },
      {
        semanticAnalyzer: {
          async analyzeGesture() {
            throw new Error("not reached");
          },
        },
        motionAnalyzer: {
          async detectMotion() {
            throw new Error("not reached");
          },
        },
      },
    ),
    /duplicate video_id/,
  );
});
