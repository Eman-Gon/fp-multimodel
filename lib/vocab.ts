/**
 * Controlled vocabularies are defined once here because downstream graph
 * queries rely on exact string matches.
 */
export const TARGET_PARTICLES = [
  { token: "呢", pinyin: "ne", surface_forms: ["呢"] },
  { token: "吧", pinyin: "ba", surface_forms: ["吧"] },
  { token: "哦", pinyin: "ou", surface_forms: ["哦"] },
  { token: "啊", pinyin: "a", surface_forms: ["啊"] },
  { token: "啦", pinyin: "la", surface_forms: ["啦"] },
  { token: "呀", pinyin: "ya", surface_forms: ["呀"] },
  { token: "吗", pinyin: "ma", surface_forms: ["吗", "嗎"] },
] as const;

export type ParticleToken = (typeof TARGET_PARTICLES)[number]["token"];
export type ParticlePinyin = (typeof TARGET_PARTICLES)[number]["pinyin"];

/**
 * Researcher-supplied candidates awaiting orthographic, tokenization, and
 * functional validation. These are deliberately not accepted as canonical
 * FP_token values by the production detector yet.
 */
export const EXTENDED_PARTICLE_CANDIDATES = [
  "了",
  "的",
  "嘛",
  "罢了",
  "而已",
  "哇",
  "哪",
  "呕",
  "哟",
  "罢",
  "呗",
  "啵",
  "咯",
  "啰",
  "喽",
  "噢",
  "喔",
  "了吗",
  "了吧",
  "了呢",
  "的吗",
  "的吧",
  "的呢",
  "了啊",
  "的啦",
  "的嘛",
  "的哦",
  "了哦",
  "吧啊",
  "呢啊",
  "吗啊",
  "啦啊",
  "呗啊",
  "吧吗",
  "呢吧",
  "了啦",
  "吧啦",
  "呢啦",
  "嘛啦",
  "哦啦",
  "了吗吧",
  "了呢吧",
  "了的吧",
  "了吗呢",
  "了吧呢",
  "了呢吗",
  "的了吗",
  "了吧吗",
  "的吗呢",
  "的呢吗",
  "了的吗",
  "的了吧",
  "的呢吧",
  "了啊吧",
  "了呢啊",
  "了吗啊",
  "了吧啊",
  "的啦啊",
  "的哦啊",
  "了哦啊",
  "吧了呢",
  "吗了呢",
  "呢了吧",
] as const;

export const GESTURE_TYPES = [
  "head_nod",
  "head_shake",
  "head_tilt",
  "head_forward",
  "head_back",
  "eyebrow_raise",
  "eyebrow_furrow",
  "eye_widen",
  "squint",
  "smile",
  "lip_purse",
  "chin_thrust",
  "shoulder_shrug",
  "hand_flip",
  "hand_beat",
  "point",
  "open_palm",
  "lean_forward",
  "lean_back",
  "none",
] as const;

export type GestureType = (typeof GESTURE_TYPES)[number];

export const GESTURE_REGIONS = ["face", "body", "both"] as const;

export type GestureRegion = (typeof GESTURE_REGIONS)[number];

export const TONE_CONTOURS = [
  "rising",
  "falling",
  "level",
  "falling_rising",
  "rising_falling",
] as const;

export type ToneContour = (typeof TONE_CONTOURS)[number];

export const SENTENCE_TYPES = [
  "declarative",
  "polar_question",
  "content_question",
  "alternative_question",
  "imperative",
  "exclamative",
] as const;

export type SentenceType = (typeof SENTENCE_TYPES)[number];

export const COMMUNICATIVE_FUNCTIONS = [
  "confirmation_seeking",
  "softening",
  "suggestion",
  "insistence",
  "surprise",
  "shared_context",
  "emotional_emphasis",
  "topic_continuation",
  "other",
  "uncertain",
] as const;

export type CommunicativeFunction =
  (typeof COMMUNICATIVE_FUNCTIONS)[number];

export const CLIP_STATUSES = [
  "draft",
  "in_review",
  "confirmed",
  "rejected",
] as const;

export type ClipStatus = (typeof CLIP_STATUSES)[number];
