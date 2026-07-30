/**
 * Controlled vocabularies are defined once here because downstream graph
 * queries rely on exact string matches.
 */
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

