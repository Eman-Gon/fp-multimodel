import type {
  AiDraftField,
  GestureAnnotationDraft,
  MotionInterval,
  PegasusGesture,
  TimeRange,
} from "../types.ts";
import type { GestureRegion, GestureType } from "../vocab.ts";
import {
  assertConfidence,
  assertNonEmptyId,
  assertTimeRange,
} from "./validation.ts";

export function reconcileGestureDraft(
  instanceId: string,
  analysisWindow: TimeRange,
  semanticGesture: PegasusGesture,
  motionIntervals: readonly MotionInterval[],
): GestureAnnotationDraft {
  assertNonEmptyId(instanceId, "instanceId");
  assertTimeRange(analysisWindow, "analysisWindow");
  assertConfidence(semanticGesture.confidence, "semanticGesture.confidence");

  const gesturePresent = semanticGesture.gesture_type !== "none";
  const presence = draftField(
    gesturePresent,
    semanticGesture.confidence,
    "pegasus",
  );
  const gestureType = draftField<GestureType>(
    semanticGesture.gesture_type,
    semanticGesture.confidence,
    "pegasus",
  );
  const gestureRegion = draftField<GestureRegion | null>(
    semanticGesture.gesture_region,
    semanticGesture.confidence,
    "pegasus",
  );

  if (!gesturePresent) {
    return {
      instance_id: instanceId,
      analysis_window: analysisWindow,
      gesture_present: presence,
      gesture_type: gestureType,
      gesture_region: gestureRegion,
      gesture_boundaries: draftField(null, semanticGesture.confidence, "pegasus"),
    };
  }

  if (semanticGesture.segment === null || semanticGesture.gesture_region === null) {
    throw new TypeError("detected semantic gestures require a region and segment");
  }

  assertTimeRange(semanticGesture.segment, "semanticGesture.segment");
  assertContained(semanticGesture.segment, analysisWindow, "semanticGesture.segment");

  for (const [index, interval] of motionIntervals.entries()) {
    assertTimeRange(interval, `motionIntervals[${index}]`);
    assertContained(interval, analysisWindow, `motionIntervals[${index}]`);
    if (interval.confidence !== undefined && interval.confidence !== null) {
      assertConfidence(interval.confidence, `motionIntervals[${index}].confidence`);
    }
  }

  const nearestMotion = selectNearestMotionInterval(
    semanticGesture.segment,
    motionIntervals,
  );
  const boundaryValue = nearestMotion ?? semanticGesture.segment;
  const boundarySource = nearestMotion === null ? "pegasus" : "mediapipe";
  const boundaryConfidence =
    nearestMotion === null
      ? semanticGesture.confidence
      : (nearestMotion.confidence ?? null);

  return {
    instance_id: instanceId,
    analysis_window: analysisWindow,
    gesture_present: presence,
    gesture_type: gestureType,
    gesture_region: gestureRegion,
    gesture_boundaries: draftField(
      { start_ms: boundaryValue.start_ms, end_ms: boundaryValue.end_ms },
      boundaryConfidence,
      boundarySource,
    ),
  };
}

/**
 * Selects one coherent motion interval rather than mixing an onset from one
 * motion event with an offset from another. Only overlapping intervals are
 * eligible; nearest boundary pair wins, with stable tie-breaking.
 */
export function selectNearestMotionInterval(
  semanticSegment: TimeRange,
  motionIntervals: readonly MotionInterval[],
): MotionInterval | null {
  const candidates = motionIntervals
    .filter((interval) => overlapMs(semanticSegment, interval) > 0)
    .map((interval) => ({
      interval,
      boundaryDistance:
        Math.abs(interval.start_ms - semanticSegment.start_ms) +
        Math.abs(interval.end_ms - semanticSegment.end_ms),
      overlap: overlapMs(semanticSegment, interval),
    }))
    .sort(
      (left, right) =>
        left.boundaryDistance - right.boundaryDistance ||
        right.overlap - left.overlap ||
        left.interval.start_ms - right.interval.start_ms ||
        left.interval.end_ms - right.interval.end_ms,
    );

  return candidates[0]?.interval ?? null;
}

function overlapMs(left: TimeRange, right: TimeRange): number {
  return Math.max(
    0,
    Math.min(left.end_ms, right.end_ms) -
      Math.max(left.start_ms, right.start_ms),
  );
}

function assertContained(
  inner: TimeRange,
  outer: TimeRange,
  label: string,
): void {
  if (inner.start_ms < outer.start_ms || inner.end_ms > outer.end_ms) {
    throw new RangeError(`${label} must fall within the analysis window`);
  }
}

function draftField<T>(
  value: T,
  confidence: number | null,
  source: "pegasus" | "mediapipe",
): AiDraftField<T> {
  return { value, confidence, source, confirmed: false };
}

