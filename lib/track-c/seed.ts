import type { TimeRange } from "../types.ts";
import type {
  ClipDetail,
  ReviewDecision,
  ReviewField,
  SuggestionSource,
} from "./types.ts";

export const DEMO_CLIP_ID = "vid03_spkA_spkB_ma_014310";
export const SECOND_DEMO_CLIP_ID = "vid04_spkB_spkA_ba_008640";

type Mutable<T> = {
  -readonly [Key in keyof T]: Mutable<T[Key]>;
};

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
    schema_version: 2,
    version: 1,
    demo_fixture: true,
    fixture_note:
      "Seeded review fixture — suggestions are simulated and are not research findings.",
    clip: {
      id: DEMO_CLIP_ID,
      name: "vid03_spkA_spkB_ma_014310",
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
      {
        id: "spkA",
        label: "Speaker A",
        region: null,
        region_confirmed: false,
      },
      {
        id: "spkB",
        label: "Speaker B",
        region: null,
        region_confirmed: false,
      },
      {
        id: "unknown",
        label: "Unknown / off-camera",
        region: null,
        region_confirmed: false,
      },
    ],
    fields: {
      speaker_id: confirmed("spkA", "diarization", 0.94),
      addressee_id: suggested("spkB", "heuristic", 0.61),
      fp_count: confirmed(1, "derived", 1),
      sentence_type: suggested("polar_question", "openai", 0.88),
      tone_contour: suggested("rising", "parselmouth", 0.73),
      discourse_context: suggested(
        "Speaker A checks whether Speaker B has already eaten during a conversation.",
        "openai",
        0.66,
      ),
      sentence_text: confirmed("你不是已经吃过了吗", "fixture", 1),
      clauses: suggested(["你不是已经吃过了吗"], "openai", 0.72),
      communicative_function: suggested(
        "confirmation_seeking",
        "openai",
        0.68,
      ),
      meaning_explanation: suggested(
        "The polar question, rising contour, final 吗, and head movement jointly suggest a request for confirmation.",
        "openai",
        0.64,
      ),
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

export function createSecondDemoClip(): ClipDetail {
  const clip = createDemoClip();
  const second = structuredClone(clip) as Mutable<ClipDetail>;
  second.version = 1;
  second.clip.id = SECOND_DEMO_CLIP_ID;
  second.clip.name = SECOND_DEMO_CLIP_ID;
  second.clip.start_ms = 7_200;
  second.clip.end_ms = 12_900;
  second.video.id = "vid04";
  second.video.duration_ms = 146_000;
  second.utterance.id = "u09";
  second.utterance.text = "我们先休息一下吧";
  second.fields.speaker_id = confirmed("spkB", "diarization", 0.91);
  second.fields.addressee_id = suggested("spkA", "heuristic", 0.58);
  second.fields.sentence_type = suggested("imperative", "openai", 0.81);
  second.fields.tone_contour = suggested("falling", "parselmouth", 0.69);
  second.fields.discourse_context = suggested(
    "Speaker B proposes a short break to Speaker A during a shared activity.",
    "openai",
    0.62,
  );
  second.fields.sentence_text = confirmed("我们先休息一下吧", "fixture", 1);
  second.fields.clauses = suggested(["我们先休息一下吧"], "openai", 0.7);
  second.fields.communicative_function = suggested(
    "softening",
    "openai",
    0.71,
  );
  second.fields.meaning_explanation = suggested(
    "The imperative context, falling contour, final 吧, and open-palm gesture soften the proposal.",
    "openai",
    0.67,
  );

  const particle = second.particle_instances[0]!;
  particle.instance_id = "u09:fp:8640";
  particle.surface_form = "吧";
  particle.fp_pinyin = "ba";
  particle.fields.fp_token = confirmed("吧", "mfa", 0.98);
  particle.fields.fp_timing = suggested(
    { start_ms: 8_640, end_ms: 8_870 },
    "mfa",
    0.8,
  );
  particle.fields.gesture_type = suggested("open_palm", "pegasus", 0.79);
  particle.fields.gesture_region = confirmed("body", "pegasus", 0.86);
  particle.fields.gesture_timing = suggested(
    { start_ms: 8_120, end_ms: 9_020 },
    "mediapipe",
    0.71,
  );
  return second;
}

export function createDemoClips(): readonly ClipDetail[] {
  return [createDemoClip(), createSecondDemoClip()];
}
