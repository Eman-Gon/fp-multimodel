import {
  GESTURE_REGIONS,
  GESTURE_TYPES,
  type GestureRegion,
  type GestureType,
} from "../vocab.ts";
import type { PegasusGesture, TimeRange } from "../types.ts";
import {
  assertConfidence,
  assertMilliseconds,
  assertTimeRange,
} from "./validation.ts";

export const PEGASUS_GESTURE_RESPONSE_SCHEMA: Readonly<Record<string, unknown>> = {
  type: "object",
  additionalProperties: false,
  required: [
    "gesture_type",
    "gesture_region",
    "start_ms",
    "end_ms",
    "confidence",
  ],
  properties: {
    gesture_type: { type: "string", enum: [...GESTURE_TYPES] },
    gesture_region: {
      type: ["string", "null"],
      enum: [...GESTURE_REGIONS, null],
    },
    start_ms: { type: ["integer", "null"], minimum: 0 },
    end_ms: { type: ["integer", "null"], minimum: 0 },
    confidence: { type: "number", minimum: 0, maximum: 1 },
  },
};

export function buildPegasusGesturePrompt(window: TimeRange): string {
  assertTimeRange(window, "window");

  return [
    `Analyze the visible speaker between absolute source-video timestamps ${window.start_ms}ms and ${window.end_ms}ms.`,
    "Identify the clearest communicative gesture associated with the sentence-final particle.",
    `gesture_type must be one of: ${GESTURE_TYPES.join(", ")}.`,
    `gesture_region must be one of: ${GESTURE_REGIONS.join(", ")}.`,
    "Return timestamps as absolute source-video milliseconds, not offsets relative to this window.",
    "If no clear gesture occurs, return gesture_type \"none\" and set gesture_region, start_ms, and end_ms to null.",
    "Respond only with JSON matching the supplied response schema.",
  ].join(" ");
}

export function parsePegasusGesture(
  rawValue: unknown,
  analysisWindow: TimeRange,
): PegasusGesture {
  assertTimeRange(analysisWindow, "analysisWindow");
  const value = parseObject(rawValue);

  if (!isGestureType(value.gesture_type)) {
    throw new TypeError("gesture_type is not in the controlled vocabulary");
  }

  if (typeof value.confidence !== "number") {
    throw new TypeError("confidence must be a number");
  }
  assertConfidence(value.confidence, "confidence");

  if (value.gesture_type === "none") {
    return {
      gesture_type: "none",
      gesture_region: null,
      segment: null,
      confidence: value.confidence,
    };
  }

  if (!isGestureRegion(value.gesture_region)) {
    throw new TypeError("gesture_region is not in the controlled vocabulary");
  }
  if (typeof value.start_ms !== "number" || typeof value.end_ms !== "number") {
    throw new TypeError("start_ms and end_ms are required for a detected gesture");
  }

  assertMilliseconds(value.start_ms, "start_ms");
  assertMilliseconds(value.end_ms, "end_ms");
  const segment = { start_ms: value.start_ms, end_ms: value.end_ms };
  assertTimeRange(segment, "Pegasus segment");

  if (
    segment.start_ms < analysisWindow.start_ms ||
    segment.end_ms > analysisWindow.end_ms
  ) {
    throw new RangeError("Pegasus segment must fall within the analysis window");
  }

  return {
    gesture_type: value.gesture_type,
    gesture_region: value.gesture_region,
    segment,
    confidence: value.confidence,
  };
}

function parseObject(rawValue: unknown): Record<string, unknown> {
  let value = rawValue;

  if (typeof rawValue === "string") {
    try {
      value = JSON.parse(rawValue);
    } catch {
      throw new TypeError("Pegasus response is not valid JSON");
    }
  }

  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError("Pegasus response must be a JSON object");
  }

  return value as Record<string, unknown>;
}

function isGestureType(value: unknown): value is GestureType {
  return (
    typeof value === "string" &&
    (GESTURE_TYPES as readonly string[]).includes(value)
  );
}

function isGestureRegion(value: unknown): value is GestureRegion {
  return (
    typeof value === "string" &&
    (GESTURE_REGIONS as readonly string[]).includes(value)
  );
}

