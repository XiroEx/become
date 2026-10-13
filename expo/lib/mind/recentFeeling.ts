import type { MindState } from "@become/api-client";

/** Canonical fallback names, used only for logs written before feelings were stored. */
export const STATE_LABELS: Record<MindState, string> = {
  stressed: "stressed",
  distracted: "distracted",
  low_energy: "low energy",
  locked_in: "locked in",
};

/**
 * Prefer the exact feeling; fall back to the state name only when there isn't
 * one. Blank/whitespace feelings are treated as absent so a junk value can't
 * render as an empty label.
 */
export function recentFeelingLabel(
  state: MindState,
  feeling?: string | null,
): string {
  const f = feeling?.trim();
  return f && f.length > 0 ? f : STATE_LABELS[state];
}

/** True when we're falling back to the bucket name rather than their word. */
export function isFallbackLabel(feeling?: string | null): boolean {
  return !feeling?.trim();
}
