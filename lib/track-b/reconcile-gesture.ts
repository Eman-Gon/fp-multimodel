import type {
  AiDraftField,
  GestureAnnotationDraft,
  MotionInterval,
  PegasusGesture,
  SemanticGestureProviderEvidence,
  TimeRange,
} from "../types.ts";
import {
  GESTURE_REGIONS,
  GESTURE_TYPES,
  type GestureRegion,
  type GestureType,
} from "../vocab.ts";
import {
  assertConfidence,
  assertNonEmptyId,
  assertTimeRange,
} from "./validation.ts";

export function reconcileGestureDraft(
  videoId: string,
  instanceId: string,
  analysisWindow: TimeRange,
  semanticGesture: PegasusGesture,
  motionIntervals: readonly MotionInterval[],
  providerEvidence?: SemanticGestureProviderEvidence,
): GestureAnnotationDraft {
  assertNonEmptyId(videoId, "videoId");
  assertNonEmptyId(instanceId, "instanceId");
  if (!instanceId.startsWith(`${videoId}:`)) {
    throw new RangeError(`instanceId must belong to videoId ${videoId}`);
  }
  assertTimeRange(analysisWindow, "analysisWindow");
  assertConfidence(semanticGesture.confidence, "semanticGesture.confidence");

  if (!GESTURE_TYPES.includes(semanticGesture.gesture_type)) {
    throw new TypeError("semanticGesture.gesture_type is not controlled");
  }
  if (
    semanticGesture.gesture_region !== null &&
    !GESTURE_REGIONS.includes(semanticGesture.gesture_region)
  ) {
    throw new TypeError("semanticGesture.gesture_region is not controlled");
  }
  if (providerEvidence !== undefined) {
    assertProviderEvidence(providerEvidence);
    assertContained(
      analysisWindow,
      providerEvidence.provider_window,
      "analysisWindow",
      "provider evidence provider_window",
    );
  }

  for (const [index, interval] of motionIntervals.entries()) {
    assertTimeRange(interval, `motionIntervals[${index}]`);
    assertContained(interval, analysisWindow, `motionIntervals[${index}]`);
    if (interval.confidence !== undefined && interval.confidence !== null) {
      assertConfidence(interval.confidence, `motionIntervals[${index}].confidence`);
    }
  }

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
  const modelEvidence = cloneModelEvidence(
    semanticGesture,
    motionIntervals,
    providerEvidence,
  );

  if (!gesturePresent) {
    if (
      semanticGesture.gesture_region !== null ||
      semanticGesture.segment !== null
    ) {
      throw new TypeError("none semantic gestures require a null region and segment");
    }
    return {
      video_id: videoId,
      instance_id: instanceId,
      analysis_window: analysisWindow,
      gesture_present: presence,
      gesture_type: gestureType,
      gesture_region: gestureRegion,
      gesture_boundaries: draftField(null, semanticGesture.confidence, "pegasus"),
      model_evidence: modelEvidence,
    };
  }

  if (semanticGesture.segment === null || semanticGesture.gesture_region === null) {
    throw new TypeError("detected semantic gestures require a region and segment");
  }

  assertTimeRange(semanticGesture.segment, "semanticGesture.segment");
  assertContained(semanticGesture.segment, analysisWindow, "semanticGesture.segment");

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
    video_id: videoId,
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
    model_evidence: modelEvidence,
  };
}

/**
 * Selects one coherent motion interval rather than mixing an onset from one
 * motion event with an offset from another. Both MediaPipe boundaries must be
 * within the Pegasus segment; nearest boundary pair wins with stable ties.
 */
export function selectNearestMotionInterval(
  semanticSegment: TimeRange,
  motionIntervals: readonly MotionInterval[],
): MotionInterval | null {
  const candidates = motionIntervals
    .filter(
      (interval) =>
        interval.start_ms >= semanticSegment.start_ms &&
        interval.end_ms <= semanticSegment.end_ms,
    )
    .map((interval) => ({
      interval,
      boundaryDistance:
        Math.abs(interval.start_ms - semanticSegment.start_ms) +
        Math.abs(interval.end_ms - semanticSegment.end_ms),
      duration: interval.end_ms - interval.start_ms,
    }))
    .sort(
      (left, right) =>
        left.boundaryDistance - right.boundaryDistance ||
        right.duration - left.duration ||
        left.interval.start_ms - right.interval.start_ms ||
        left.interval.end_ms - right.interval.end_ms,
    );

  return candidates[0]?.interval ?? null;
}

function assertContained(
  inner: TimeRange,
  outer: TimeRange,
  label: string,
  outerLabel = "analysis window",
): void {
  if (inner.start_ms < outer.start_ms || inner.end_ms > outer.end_ms) {
    throw new RangeError(`${label} must fall within the ${outerLabel}`);
  }
}

function cloneModelEvidence(
  semanticGesture: PegasusGesture,
  motionIntervals: readonly MotionInterval[],
  providerEvidence?: SemanticGestureProviderEvidence,
): GestureAnnotationDraft["model_evidence"] {
  return {
    pegasus: {
      ...semanticGesture,
      segment:
        semanticGesture.segment === null
          ? null
          : { ...semanticGesture.segment },
    },
    mediapipe_intervals: motionIntervals.map((interval) => ({ ...interval })),
    ...(providerEvidence === undefined
      ? {}
      : {
          provider: {
            ...providerEvidence,
            provider_window: { ...providerEvidence.provider_window },
            raw_response: structuredClone(providerEvidence.raw_response),
          },
        }),
  };
}

function assertProviderEvidence(
  value: unknown,
): asserts value is SemanticGestureProviderEvidence {
  if (!isRecord(value)) {
    throw new TypeError("provider evidence must be an object");
  }
  const keys = Object.keys(value).sort();
  const expectedKeys = [
    "asset_id",
    "finish_reason",
    "model",
    "provider",
    "provider_window",
    "raw_response",
    "response_id",
  ];
  if (
    keys.length !== expectedKeys.length ||
    keys.some((key, index) => key !== expectedKeys[index])
  ) {
    throw new TypeError("provider evidence has unexpected fields");
  }
  if (
    value.provider !== "twelvelabs" ||
    value.model !== "pegasus1.5"
  ) {
    throw new TypeError(
      "provider evidence must identify TwelveLabs Pegasus 1.5",
    );
  }
  assertNonEmptyId(value.asset_id, "provider evidence asset_id");
  if (!isRecord(value.provider_window)) {
    throw new TypeError("provider evidence provider_window must be an object");
  }
  assertTimeRange(
    value.provider_window as unknown as TimeRange,
    "provider evidence provider_window",
  );
  if (
    value.response_id !== null &&
    (typeof value.response_id !== "string" ||
      value.response_id.trim().length === 0)
  ) {
    throw new TypeError(
      "provider evidence response_id must be null or a non-empty string",
    );
  }
  if (
    value.finish_reason !== null &&
    (typeof value.finish_reason !== "string" ||
      value.finish_reason.trim().length === 0)
  ) {
    throw new TypeError(
      "provider evidence finish_reason must be null or a non-empty string",
    );
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function draftField<T>(
  value: T,
  confidence: number | null,
  source: "pegasus" | "mediapipe",
): AiDraftField<T> {
  return { value, confidence, source, confirmed: false };
}
