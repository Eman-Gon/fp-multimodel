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

export const CLIP_STATUSES = [
  "draft",
  "in_review",
  "confirmed",
  "rejected",
] as const;

export type ClipStatus = (typeof CLIP_STATUSES)[number];
