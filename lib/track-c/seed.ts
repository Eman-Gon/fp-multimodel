import type { TimeRange } from "../types.ts";
import type {
  ClipDetail,
  ReviewDecision,
  ReviewField,
  SuggestionSource,
} from "./types.ts";

export const DEMO_CLIP_ID = "vid03_spkA_ma_014230";

const DEMO_REVIEW: ReviewDecision = {
  action: "accepted",
  reviewer_id: "demo-reviewer",
  reviewed_at: "2026-07-30T18:00:00.000Z",
};

function suggested<T>(
  value: T,
  source: SuggestionSource,
  confidence: number | null,
): ReviewField<T> {
  return {
    state: "suggested",
    value,
    suggestion: { value, source, confidence },
    review: null,
  };
}

function confirmed<T>(
  value: T,
  source: SuggestionSource,
  confidence: number | null,
): ReviewField<T> {
  return {
    state: "confirmed",
    value,
    suggestion: { value, source, confidence },
    review: DEMO_REVIEW,
  };
}

export function createDemoClip(): ClipDetail {
  const fpTiming: TimeRange = { start_ms: 14_310, end_ms: 14_560 };
  const gestureTiming: TimeRange = {
    start_ms: 13_840,
    end_ms: 14_900,
  };

  return {
    schema_version: 1,
    version: 1,
    demo_fixture: true,
    fixture_note:
      "Seeded review fixture — suggestions are simulated and are not research findings.",
    clip: {
      id: DEMO_CLIP_ID,
      name: "vid03_spkA_ma_014230",
      start_ms: 12_000,
      end_ms: 19_200,
      status: "in_review",
    },
    video: {
      id: "vid03",
      source_url: "/demo/mandarin-conversation.mp4",
      poster_url: "/demo/mandarin-conversation.png",
      duration_ms: 183_000,
      fps: 30,
    },
    utterance: {
      id: "u17",
      text: "你不是已经吃过了吗",
    },
    participant_options: [
      { id: "spkA", label: "Speaker A" },
      { id: "spkB", label: "Speaker B" },
      { id: "unknown", label: "Unknown / off-camera" },
    ],
    fields: {
      speaker_id: confirmed("spkA", "diarization", 0.94),
      addressee_id: suggested("spkB", "heuristic", 0.61),
      fp_count: confirmed(1, "derived", 1),
      sentence_type: suggested("polar_question", "openai", 0.88),
      tone_contour: suggested("rising", "parselmouth", 0.73),
    },
    particle_instances: [
      {
        instance_id: "u17:fp:14310",
        surface_form: "嗎",
        fp_pinyin: "ma",
        fields: {
          fp_token: confirmed("吗", "mfa", 0.99),
          fp_timing: suggested(fpTiming, "mfa", 0.82),
          gesture_present: confirmed(true, "pegasus", 0.91),
          gesture_type: suggested("head_nod", "pegasus", 0.87),
          gesture_region: confirmed("face", "pegasus", 0.9),
          gesture_timing: suggested(
            gestureTiming,
            "mediapipe",
            0.76,
          ),
        },
      },
    ],
  };
}

