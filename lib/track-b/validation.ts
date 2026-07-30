import type { TimeRange } from "../types.ts";

export function assertNonEmptyId(value: string, label: string): void {
  if (value.trim().length === 0) {
    throw new RangeError(`${label} must not be empty`);
  }
}

export function assertMilliseconds(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${label} must be a non-negative integer in milliseconds`);
  }
}

export function assertTimeRange(range: TimeRange, label: string): void {
  assertMilliseconds(range.start_ms, `${label}.start_ms`);
  assertMilliseconds(range.end_ms, `${label}.end_ms`);

  if (range.end_ms <= range.start_ms) {
    throw new RangeError(`${label}.end_ms must be greater than ${label}.start_ms`);
  }
}

export function assertConfidence(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new RangeError(`${label} must be between 0 and 1`);
  }
}

