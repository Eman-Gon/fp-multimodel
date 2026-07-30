import type { FinalParticleInstance, TimeRange } from "../types.ts";
import {
  assertMilliseconds,
  assertNonEmptyId,
  assertTimeRange,
} from "./validation.ts";

export const TRACK_B_WINDOW_PADDING_MS = 2_000;

/**
 * Builds the B1 model-analysis window. This is intentionally distinct from
 * the later clip-generation window, which uses gesture/FP extrema plus 1500ms.
 */
export function createGestureAnalysisWindow(
  particle: FinalParticleInstance,
  videoDurationMs: number,
  paddingMs = TRACK_B_WINDOW_PADDING_MS,
): TimeRange {
  assertNonEmptyId(particle.instance_id, "particle.instance_id");
  assertTimeRange(
    { start_ms: particle.fp_start_ms, end_ms: particle.fp_end_ms },
    "particle",
  );
  assertMilliseconds(videoDurationMs, "videoDurationMs");
  assertMilliseconds(paddingMs, "paddingMs");

  if (particle.fp_end_ms > videoDurationMs) {
    throw new RangeError("particle.fp_end_ms must not exceed videoDurationMs");
  }

  return {
    start_ms: Math.max(0, particle.fp_start_ms - paddingMs),
    end_ms: Math.min(videoDurationMs, particle.fp_end_ms + paddingMs),
  };
}

