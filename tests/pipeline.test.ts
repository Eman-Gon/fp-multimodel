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
          instance_id: "vid-03:u1",
          fp_token: "呢",
          fp_pinyin: "ne",
          surface_form: "呢",
          fp_start_ms: 4_000,
          fp_end_ms: 4_200,
          utterance_id: "u1",
        },
        {
          ...trackAProvenance,
          instance_id: "vid-03:u2",
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
          return request.instance_id === "vid-03:u1"
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
    ["vid-03:u1", "vid-03:u2"],
  );
  assert.deepEqual(
    drafts.map((draft) => draft.video_id),
    ["vid-03", "vid-03"],
  );
  assert.equal(semanticCalls.length, 2);
  assert.equal(motionCalls.length, 1);
  assert.equal(semanticCalls[0]!.particle.fp_token, "呢");
  assert.equal(motionCalls[0]!.semantic_gesture.gesture_type, "head_tilt");
  assert.equal(drafts[0]!.gesture_boundaries.source, "mediapipe");
  assert.equal(drafts[1]!.gesture_boundaries.value, null);
  assert.deepEqual(drafts[0]!.model_evidence, {
    pegasus: {
      gesture_type: "head_tilt",
      gesture_region: "face",
      segment: { start_ms: 3_800, end_ms: 4_300 },
      confidence: 0.79,
    },
    mediapipe_intervals: [
      { start_ms: 3_900, end_ms: 4_250, confidence: 0.72 },
    ],
  });
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
            instance_id: "vid-03:u1",
            fp_token: "呢",
            fp_pinyin: "ne",
            surface_form: "呢",
            fp_start_ms: 4_000,
            fp_end_ms: 4_200,
            utterance_id: "u1",
          },
          {
            ...trackAProvenance,
            instance_id: "vid-03:u1",
            fp_token: "呢",
            fp_pinyin: "ne",
            surface_form: "呢",
            fp_start_ms: 4_000,
            fp_end_ms: 4_200,
            utterance_id: "u1",
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
              instance_id: "vid1:u1",
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
              instance_id: "vid2:u1",
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
  assert.deepEqual(
    result.map(({ status }) => status),
    ["completed", "completed"],
  );
  assert.equal(result[0]?.annotations[0]?.analysis_window.start_ms, 0);
  assert.equal(result[1]?.annotations[0]?.analysis_window.start_ms, 13_000);
  assert.equal(result[0]?.annotations[0]?.video_id, "vid1");
  assert.equal(result[1]?.annotations[0]?.video_id, "vid2");
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

test("batch analysis isolates provider failures for per-video retry", async () => {
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
              instance_id: "vid1:u1",
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
          video_duration_ms: 10_000,
          particle_instances: [
            {
              ...trackAProvenance,
              instance_id: "vid2:u1",
              fp_token: "吧",
              fp_pinyin: "ba",
              surface_form: "吧",
              fp_start_ms: 2_000,
              fp_end_ms: 2_200,
              utterance_id: "u1",
            },
          ],
        },
      ],
    },
    {
      semanticAnalyzer: {
        async analyzeGesture(request) {
          if (request.video_id === "vid1") {
            throw new Error("Pegasus temporarily unavailable");
          }
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

  assert.deepEqual(result, [
    {
      video_id: "vid1",
      status: "failed",
      annotations: [],
      error_message: "Pegasus temporarily unavailable",
    },
    {
      video_id: "vid2",
      status: "completed",
      annotations: [
        {
          video_id: "vid2",
          instance_id: "vid2:u1",
          analysis_window: { start_ms: 0, end_ms: 4_200 },
          gesture_present: {
            value: false,
            confidence: 0.75,
            source: "pegasus",
            confirmed: false,
          },
          gesture_type: {
            value: "none",
            confidence: 0.75,
            source: "pegasus",
            confirmed: false,
          },
          gesture_region: {
            value: null,
            confidence: 0.75,
            source: "pegasus",
            confirmed: false,
          },
          gesture_boundaries: {
            value: null,
            confidence: 0.75,
            source: "pegasus",
            confirmed: false,
          },
          model_evidence: {
            pegasus: {
              gesture_type: "none",
              gesture_region: null,
              segment: null,
              confidence: 0.75,
            },
            mediapipe_intervals: [],
          },
        },
      ],
    },
  ]);
});

test("direct analysis rejects a cross-video particle before provider calls", async () => {
  let providerCallCount = 0;

  await assert.rejects(
    draftTrackBAnnotations(
      {
        video_id: "vid1",
        video_duration_ms: 10_000,
        particle_instances: [
          {
            ...trackAProvenance,
            instance_id: "vid2:u1",
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
        semanticAnalyzer: {
          async analyzeGesture() {
            providerCallCount += 1;
            return {};
          },
        },
        motionAnalyzer: {
          async detectMotion() {
            providerCallCount += 1;
            return [];
          },
        },
      },
    ),
    /instance_id must equal vid1:u1/,
  );
  assert.equal(providerCallCount, 0);
});
