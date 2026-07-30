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
): void {
  if (inner.start_ms < outer.start_ms || inner.end_ms > outer.end_ms) {
    throw new RangeError(`${label} must fall within the analysis window`);
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
            raw_response: structuredClone(providerEvidence.raw_response),
          },
        }),
  };
}

function assertProviderEvidence(
  evidence: SemanticGestureProviderEvidence,
): void {
  if (
    evidence.provider !== "twelvelabs" ||
    evidence.model !== "pegasus1.5"
  ) {
    throw new TypeError(
      "provider evidence must identify TwelveLabs Pegasus 1.5",
    );
  }
  assertNonEmptyId(evidence.asset_id, "provider evidence asset_id");
  assertTimeRange(evidence.provider_window, "provider evidence provider_window");
  if (
    evidence.response_id !== null &&
    typeof evidence.response_id !== "string"
  ) {
    throw new TypeError("provider evidence response_id must be a string or null");
  }
  if (
    evidence.finish_reason !== null &&
    typeof evidence.finish_reason !== "string"
  ) {
    throw new TypeError(
      "provider evidence finish_reason must be a string or null",
    );
  }
}

function draftField<T>(
  value: T,
  confidence: number | null,
  source: "pegasus" | "mediapipe",
): AiDraftField<T> {
  return { value, confidence, source, confirmed: false };
}
