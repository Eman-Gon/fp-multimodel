/**
 * Convert controlled-vocabulary values into concise UI labels without
 * changing the canonical value stored in review records.
 */
export function humanizeCode(value: string): string {
  const words = value.replaceAll("_", " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}
