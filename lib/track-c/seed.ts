import type { TimeRange } from "../types.ts";
import type {
  ClipStatus,
  CommunicativeFunction,
  GestureRegion,
  GestureType,
  ParticlePinyin,
  ParticleToken,
  SentenceType,
  ToneContour,
} from "../vocab.ts";
import type {
  ClipDetail,
  ReviewDecision,
  ReviewField,
  SuggestionSource,
} from "./types.ts";

export const DEMO_CLIP_ID = "vid03_spkA_spkB_ma_014310";
export const SECOND_DEMO_CLIP_ID = "vid04_spkB_spkA_ba_008640";

const DEMO_FIXTURE_NOTE =
  "Seeded demo fixture — media, suggestions, and confidence values are simulated and are not research evidence.";

const ABSENT_GESTURE_FIXTURE_REASON =
  "Not applicable because this demo fixture records no gesture.";

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

function skipped<T>(
  suggestionValue: T,
  source: SuggestionSource,
  confidence: number | null,
  reason: string,
): ReviewField<T> {
  return {
    state: "skipped",
    value: null,
    suggestion: { value: suggestionValue, source, confidence },
    review: {
      ...DEMO_REVIEW,
      action: "skipped",
      reason,
    },
  };
}

export function createDemoClip(): ClipDetail {
  const fpTiming: TimeRange = { start_ms: 14_310, end_ms: 14_560 };
  const gestureTiming: TimeRange = {
    start_ms: 13_840,
    end_ms: 14_900,
  };

  return {
    schema_version: 3,
    version: 1,
    demo_fixture: true,
    fixture_note: DEMO_FIXTURE_NOTE,
    clip: {
      id: DEMO_CLIP_ID,
      name: "vid03_spkA_spkB_ma_014310",
      start_ms: 12_340,
      end_ms: 16_400,
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
        region_source: null,
        region_confirmed: false,
      },
      {
        id: "spkB",
        label: "Speaker B",
        region: null,
        region_source: null,
        region_confirmed: false,
      },
      {
        id: "unknown",
        label: "Unknown / off-camera",
        region: null,
        region_source: null,
        region_confirmed: false,
      },
    ],
    fields: {
      speaker_id: confirmed("spkA", "diarization", 0.94),
      addressee_id: suggested("spkB", "heuristic", 0.61),
      fp_count: confirmed(1, "derived", 1),
      sentence_type: confirmed("polar_question", "openai", 0.88),
      tone_contour: confirmed("rising", "parselmouth", 0.73),
      discourse_context: confirmed(
        "Speaker A checks whether Speaker B has already eaten during a conversation.",
        "openai",
        0.66,
      ),
      sentence_text: confirmed("你不是已经吃过了吗", "fixture", 1),
      clauses: confirmed(["你不是已经吃过了吗"], "openai", 0.72),
      communicative_function: suggested(
        "confirmation_seeking",
        "openai",
        0.68,
      ),
      meaning_explanation: confirmed(
        "The polar question, rising contour, final 吗, and head movement jointly suggest a request for confirmation.",
        "openai",
        0.64,
      ),
    },
    particle_instances: [
      {
        instance_id: "vid03:u17",
        surface_form: "嗎",
        fp_pinyin: "ma",
        original_track_b_suggestion: null,
        fields: {
          fp_token: confirmed("吗", "mfa", 0.99),
          fp_timing: suggested(fpTiming, "mfa", 0.82),
          gesture_present: confirmed(true, "pegasus", 0.91),
          gesture_type: suggested("head_nod", "pegasus", 0.87),
          gesture_region: confirmed("face", "pegasus", 0.9),
          gesture_timing: confirmed(
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
  second.clip.start_ms = 6_620;
  second.clip.end_ms = 10_520;
  second.video.id = "vid04";
  second.video.duration_ms = 146_000;
  second.utterance.id = "u09";
  second.utterance.text = "我们先休息一下吧";
  second.fields.speaker_id = confirmed("spkB", "diarization", 0.91);
  second.fields.addressee_id = suggested("spkA", "heuristic", 0.58);
  second.fields.sentence_type = confirmed("imperative", "openai", 0.81);
  second.fields.tone_contour = confirmed("falling", "parselmouth", 0.69);
  second.fields.discourse_context = confirmed(
    "Speaker B proposes a short break to Speaker A during a shared activity.",
    "openai",
    0.62,
  );
  second.fields.sentence_text = confirmed("我们先休息一下吧", "fixture", 1);
  second.fields.clauses = confirmed(["我们先休息一下吧"], "openai", 0.7);
  second.fields.communicative_function = suggested(
    "softening",
    "openai",
    0.71,
  );
  second.fields.meaning_explanation = confirmed(
    "The imperative context, falling contour, final 吧, and open-palm gesture soften the proposal.",
    "openai",
    0.67,
  );

  const particle = second.particle_instances[0]!;
  particle.instance_id = "vid04:u09";
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
  particle.fields.gesture_timing = confirmed(
    { start_ms: 8_120, end_ms: 9_020 },
    "mediapipe",
    0.71,
  );
  return second;
}

type DemoFixtureReviewState = "draft" | "partial" | "confirmed";

interface DemoClipSpec {
  readonly id: string;
  readonly video_id: string;
  readonly video_duration_ms: number;
  readonly utterance_id: string;
  readonly transcript: string;
  readonly clip_timing: TimeRange;
  readonly speaker_id: string;
  readonly addressee_id: string;
  readonly particle: {
    readonly token: ParticleToken;
    readonly pinyin: ParticlePinyin;
    readonly surface_form: string;
    readonly timing: TimeRange;
    readonly timing_confidence: number;
  };
  readonly gesture: {
    readonly present: boolean;
    readonly type: GestureType;
    readonly region: GestureRegion | null;
    readonly timing: TimeRange | null;
    readonly type_confidence: number;
  };
  readonly sentence_type: SentenceType;
  readonly tone_contour: ToneContour;
  readonly discourse_context: string;
  readonly clauses: readonly string[];
  readonly communicative_function: CommunicativeFunction;
  readonly meaning_explanation: string;
  readonly addressee_confidence: number;
  readonly function_confidence: number;
  readonly review_state: DemoFixtureReviewState;
}

const ADDITIONAL_DEMO_CLIP_SPECS: readonly DemoClipSpec[] = [
  {
    id: "vid03_spkA_spkB_ne_027400",
    video_id: "vid03",
    video_duration_ms: 183_000,
    utterance_id: "u21",
    transcript: "你还想聊什么呢",
    clip_timing: { start_ms: 25_320, end_ms: 29_300 },
    speaker_id: "spkA",
    addressee_id: "spkB",
    particle: {
      token: "呢",
      pinyin: "ne",
      surface_form: "呢",
      timing: { start_ms: 27_400, end_ms: 27_640 },
      timing_confidence: 0.78,
    },
    gesture: {
      present: true,
      type: "head_tilt",
      region: "face",
      timing: { start_ms: 26_820, end_ms: 27_800 },
      type_confidence: 0.73,
    },
    sentence_type: "content_question",
    tone_contour: "falling_rising",
    discourse_context:
      "Speaker A invites Speaker B to continue a shared conversation.",
    clauses: ["你还想聊什么呢"],
    communicative_function: "topic_continuation",
    meaning_explanation:
      "The content question, falling-rising contour, final 呢, and head tilt keep the conversational topic open.",
    addressee_confidence: 0.65,
    function_confidence: 0.69,
    review_state: "partial",
  },
  {
    id: "vid03_spkB_spkA_ou_035120",
    video_id: "vid03",
    video_duration_ms: 183_000,
    utterance_id: "u24",
    transcript: "原来是这样哦",
    clip_timing: { start_ms: 33_180, end_ms: 37_020 },
    speaker_id: "spkB",
    addressee_id: "spkA",
    particle: {
      token: "哦",
      pinyin: "ou",
      surface_form: "哦",
      timing: { start_ms: 35_120, end_ms: 35_360 },
      timing_confidence: 0.86,
    },
    gesture: {
      present: true,
      type: "eyebrow_raise",
      region: "face",
      timing: { start_ms: 34_680, end_ms: 35_520 },
      type_confidence: 0.81,
    },
    sentence_type: "declarative",
    tone_contour: "falling",
    discourse_context:
      "Speaker B acknowledges new information supplied by Speaker A.",
    clauses: ["原来是这样哦"],
    communicative_function: "surprise",
    meaning_explanation:
      "The declarative context, falling contour, final 哦, and eyebrow raise frame the response as newly realized information.",
    addressee_confidence: 0.68,
    function_confidence: 0.76,
    review_state: "confirmed",
  },
  {
    id: "vid04_spkA_spkB_a_042760",
    video_id: "vid04",
    video_duration_ms: 146_000,
    utterance_id: "u15",
    transcript: "这里真的很漂亮啊",
    clip_timing: { start_ms: 40_500, end_ms: 44_600 },
    speaker_id: "spkA",
    addressee_id: "spkB",
    particle: {
      token: "啊",
      pinyin: "a",
      surface_form: "啊",
      timing: { start_ms: 42_760, end_ms: 43_010 },
      timing_confidence: 0.9,
    },
    gesture: {
      present: true,
      type: "eye_widen",
      region: "face",
      timing: { start_ms: 42_000, end_ms: 43_100 },
      type_confidence: 0.84,
    },
    sentence_type: "exclamative",
    tone_contour: "rising_falling",
    discourse_context:
      "Speaker A reacts to a place that both participants can currently see.",
    clauses: ["这里真的很漂亮啊"],
    communicative_function: "emotional_emphasis",
    meaning_explanation:
      "The exclamative context, rising-falling contour, final 啊, and widened eyes reinforce the speaker's positive evaluation.",
    addressee_confidence: 0.7,
    function_confidence: 0.82,
    review_state: "confirmed",
  },
  {
    id: "vid05_spkA_spkB_la_061230",
    video_id: "vid05",
    video_duration_ms: 120_000,
    utterance_id: "u03",
    transcript: "我们可以出发啦",
    clip_timing: { start_ms: 59_300, end_ms: 63_200 },
    speaker_id: "spkA",
    addressee_id: "spkB",
    particle: {
      token: "啦",
      pinyin: "la",
      surface_form: "啦",
      timing: { start_ms: 61_230, end_ms: 61_470 },
      timing_confidence: 0.74,
    },
    gesture: {
      present: true,
      type: "smile",
      region: "face",
      timing: { start_ms: 60_800, end_ms: 61_700 },
      type_confidence: 0.66,
    },
    sentence_type: "declarative",
    tone_contour: "level",
    discourse_context:
      "Speaker A announces readiness to leave after both participants finish preparing.",
    clauses: ["我们可以出发啦"],
    communicative_function: "shared_context",
    meaning_explanation:
      "The shared preparation context, level contour, final 啦, and smile present departure as mutually expected.",
    addressee_confidence: 0.43,
    function_confidence: 0.57,
    review_state: "draft",
  },
  {
    id: "vid05_spkB_spkA_ya_072540",
    video_id: "vid05",
    video_duration_ms: 120_000,
    utterance_id: "u08",
    transcript: "你也来了呀",
    clip_timing: { start_ms: 71_040, end_ms: 74_260 },
    speaker_id: "spkB",
    addressee_id: "spkA",
    particle: {
      token: "呀",
      pinyin: "ya",
      surface_form: "呀",
      timing: { start_ms: 72_540, end_ms: 72_760 },
      timing_confidence: 0.88,
    },
    gesture: {
      present: false,
      type: "none",
      region: null,
      timing: null,
      type_confidence: 0.79,
    },
    sentence_type: "exclamative",
    tone_contour: "rising",
    discourse_context:
      "Speaker B notices that Speaker A has arrived at a shared gathering.",
    clauses: ["你也来了呀"],
    communicative_function: "surprise",
    meaning_explanation:
      "The exclamative context, rising contour, and final 呀 express mild surprise; this fixture records no concurrent gesture.",
    addressee_confidence: 0.67,
    function_confidence: 0.8,
    review_state: "confirmed",
  },
];

function createSpecDemoClip(spec: DemoClipSpec): ClipDetail {
  const status: ClipStatus =
    spec.review_state === "confirmed"
      ? "confirmed"
      : spec.review_state === "partial"
        ? "in_review"
        : "draft";
  const participantOptions = [
    {
      id: "spkA",
      label: "Speaker A",
      region: null,
      region_source: null,
      region_confirmed: false,
    },
    {
      id: "spkB",
      label: "Speaker B",
      region: null,
      region_source: null,
      region_confirmed: false,
    },
    {
      id: "unknown",
      label: "Unknown / off-camera",
      region: null,
      region_source: null,
      region_confirmed: false,
    },
  ] as const;
  const field = <T>(
    value: T,
    source: SuggestionSource,
    confidence: number | null,
    reviewedInPartial: boolean,
  ): ReviewField<T> =>
    spec.review_state === "confirmed" ||
    (spec.review_state === "partial" && reviewedInPartial)
      ? confirmed(value, source, confidence)
      : suggested(value, source, confidence);

  const gestureType =
    spec.review_state === "confirmed" && !spec.gesture.present
      ? confirmed("none" as const, "pegasus", spec.gesture.type_confidence)
      : field(
          spec.gesture.type,
          "pegasus",
          spec.gesture.type_confidence,
          false,
        );
  const gestureRegion =
    spec.review_state === "confirmed" && !spec.gesture.present
      ? skipped(
          spec.gesture.region,
          "pegasus",
          null,
          ABSENT_GESTURE_FIXTURE_REASON,
        )
      : field(spec.gesture.region, "pegasus", 0.82, true);
  const gestureTiming =
    spec.review_state === "confirmed" && !spec.gesture.present
      ? skipped(
          spec.gesture.timing,
          "mediapipe",
          null,
          ABSENT_GESTURE_FIXTURE_REASON,
        )
      : field(spec.gesture.timing, "mediapipe", 0.75, true);

  return {
    schema_version: 3,
    version: 1,
    demo_fixture: true,
    fixture_note: DEMO_FIXTURE_NOTE,
    clip: {
      id: spec.id,
      name: spec.id,
      start_ms: spec.clip_timing.start_ms,
      end_ms: spec.clip_timing.end_ms,
      status,
    },
    video: {
      id: spec.video_id,
      source_url: "/demo/mandarin-conversation.mp4",
      poster_url: "/demo/mandarin-conversation.png",
      duration_ms: spec.video_duration_ms,
      fps: 30,
    },
    utterance: {
      id: spec.utterance_id,
      text: spec.transcript,
    },
    participant_options: participantOptions,
    fields: {
      speaker_id: field(spec.speaker_id, "diarization", 0.92, true),
      addressee_id: field(
        spec.addressee_id,
        "heuristic",
        spec.addressee_confidence,
        false,
      ),
      fp_count: confirmed(1, "derived", 1),
      sentence_type: field(
        spec.sentence_type,
        "openai",
        0.84,
        true,
      ),
      tone_contour: field(spec.tone_contour, "parselmouth", 0.72, true),
      discourse_context: field(
        spec.discourse_context,
        "openai",
        0.67,
        true,
      ),
      sentence_text: field(spec.transcript, "fixture", 1, true),
      clauses: field(spec.clauses, "openai", 0.74, true),
      communicative_function: field(
        spec.communicative_function,
        "openai",
        spec.function_confidence,
        false,
      ),
      meaning_explanation: field(
        spec.meaning_explanation,
        "openai",
        0.69,
        true,
      ),
    },
    particle_instances: [
      {
        instance_id: `${spec.video_id}:${spec.utterance_id}`,
        surface_form: spec.particle.surface_form,
        fp_pinyin: spec.particle.pinyin,
        original_track_b_suggestion: null,
        fields: {
          fp_token: field(spec.particle.token, "mfa", 0.98, true),
          fp_timing: field(
            spec.particle.timing,
            "mfa",
            spec.particle.timing_confidence,
            false,
          ),
          gesture_present: field(
            spec.gesture.present,
            "pegasus",
            0.86,
            true,
          ),
          gesture_type: gestureType,
          gesture_region: gestureRegion,
          gesture_timing: gestureTiming,
        },
      },
    ],
  };
}

export function createDemoClips(): readonly ClipDetail[] {
  return [
    createDemoClip(),
    createSecondDemoClip(),
    ...ADDITIONAL_DEMO_CLIP_SPECS.map(createSpecDemoClip),
  ];
}
