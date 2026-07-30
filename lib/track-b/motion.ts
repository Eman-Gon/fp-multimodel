import type { MotionInterval } from "../types.ts";
import { assertMilliseconds } from "./validation.ts";

export interface MotionSample {
  readonly timestamp_ms: number;
  /**
   * Aggregate velocity for the relevant MediaPipe landmarks. The adapter owns
   * the units; the configured threshold must use the same units.
   */
  readonly velocity: number;
}

export interface MotionThresholdOptions {
  readonly velocity_threshold: number;
  readonly minimum_active_samples?: number;
  readonly maximum_active_gap_ms?: number;
}

/**
 * Converts per-frame landmark velocity into contiguous motion intervals.
 * A short gap can be bridged to tolerate one dropped/noisy 30fps frame.
 */
export function detectMotionIntervals(
  samples: readonly MotionSample[],
  options: MotionThresholdOptions,
): readonly MotionInterval[] {
  const minimumActiveSamples = options.minimum_active_samples ?? 2;
  const maximumActiveGapMs = options.maximum_active_gap_ms ?? 67;

  if (
    !Number.isFinite(options.velocity_threshold) ||
    options.velocity_threshold <= 0
  ) {
    throw new RangeError("velocity_threshold must be greater than 0");
  }
  if (!Number.isSafeInteger(minimumActiveSamples) || minimumActiveSamples < 2) {
    throw new RangeError("minimum_active_samples must be an integer of at least 2");
  }
  assertMilliseconds(maximumActiveGapMs, "maximum_active_gap_ms");

  let previousTimestamp = -1;
  for (const [index, sample] of samples.entries()) {
    assertMilliseconds(sample.timestamp_ms, `samples[${index}].timestamp_ms`);
    if (sample.timestamp_ms <= previousTimestamp) {
      throw new RangeError("motion samples must have strictly increasing timestamps");
    }
    if (!Number.isFinite(sample.velocity) || sample.velocity < 0) {
      throw new RangeError(`samples[${index}].velocity must be non-negative`);
    }
    previousTimestamp = sample.timestamp_ms;
  }

  const activeSamples = samples.filter(
    (sample) => sample.velocity >= options.velocity_threshold,
  );
  if (activeSamples.length === 0) {
    return [];
  }

  const groups: MotionSample[][] = [];
  let currentGroup: MotionSample[] = [];

  for (const sample of activeSamples) {
    const previousActiveSample = currentGroup.at(-1);
    if (
      previousActiveSample !== undefined &&
      sample.timestamp_ms - previousActiveSample.timestamp_ms > maximumActiveGapMs
    ) {
      groups.push(currentGroup);
      currentGroup = [];
    }
    currentGroup.push(sample);
  }
  groups.push(currentGroup);

  return groups
    .filter((group) => group.length >= minimumActiveSamples)
    .map((group) => ({
      start_ms: group[0]!.timestamp_ms,
      end_ms: group.at(-1)!.timestamp_ms,
      confidence: null,
    }));
}

