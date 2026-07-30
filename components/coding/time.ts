export function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

export function formatRelativeTime(milliseconds: number): string {
  const safeMilliseconds = Math.max(0, Math.round(milliseconds));
  const minutes = Math.floor(safeMilliseconds / 60_000);
  const seconds = Math.floor((safeMilliseconds % 60_000) / 1_000);
  const millis = safeMilliseconds % 1_000;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(millis).padStart(3, "0")}`;
}

export function formatSourceRange(
  startMilliseconds: number,
  endMilliseconds: number,
): string {
  return `${startMilliseconds.toLocaleString("en-US")}–${endMilliseconds.toLocaleString("en-US")} ms`;
}

export function sourceMillisecondsToFrame(
  sourceMilliseconds: number,
  fps: number,
): number {
  return Math.round((sourceMilliseconds / 1_000) * fps);
}

export function frameToSourceMilliseconds(frame: number, fps: number): number {
  return Math.round((frame / fps) * 1_000);
}

