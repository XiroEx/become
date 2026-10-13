/**
 * ─── ONE SHEET, RAISED FROM ANYWHERE (NP-052) ─────────────────────────────────
 *
 * The web has one upsell surface and every gate opens it. Native now does too,
 * and this is the handle: `showUpgradeSheet(gate)`.
 *
 * It is a module store rather than a hook or a context value because the callers
 * are not all components. Training, nutrition and Mind raise it from a lock's
 * `onPress` (NP-094, NP-089, NP-097, NP-133, NP-154); `routeApiError` raises it
 * from code that is not rendering anything at all — the AI run client, the
 * offline replay — and a 403 can land while the screen that made the request has
 * already gone. A single `<UpgradeSheetHost />` at the root subscribes to this
 * and is the only thing that renders the sheet.
 *
 * THE TWO RULES THAT TRAVEL:
 *
 *   • a 429 never opens it. A spend ceiling is identical for free and Plus
 *     (`webapp/lib/spendCaps.ts`) and money cannot lift it, so
 *     `classifyApiError` files one as `rate-limited` and it never reaches here.
 *   • a 403 without BOTH `feature` and `requiresTier` never opens it. An
 *     ownership or a role refusal is an ordinary error.
 *
 * Both are enforced upstream (`shared/api-client#classifyApiError`,
 * `lib/errors/useApiErrorHandler`), and `isSheetGate` below is the backstop:
 * this function will not open a sheet for something that is not a gate, so a
 * future caller that hands it a raw error body gets nothing rather than a
 * featureless upsell with an error message in it.
 */

import type { AllowanceWindow, Feature, SheetGate, Tier } from "@become/core";

/**
 * What a caller may hand in. `@become/api-client`'s `PlanGate` types `feature`
 * and `requiresTier` as plain strings — that package classifies refusals and
 * deliberately does not own the tier vocabulary — so the two shapes are accepted
 * and narrowed here, once, instead of being cast at every call site.
 */
export interface GateLike {
  error: string;
  requiresTier: string;
  feature?: string | undefined;
  limit?: number | undefined;
  remaining?: number | undefined;
  resetsAt?: string | null | undefined;
  window?: string | undefined;
}

/** Is this a gate — i.e. something the sheet can honestly render? */
export function isSheetGate(value: unknown): value is GateLike {
  if (value === null || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  if (typeof v.error !== "string" || v.error.length === 0) return false;
  return typeof v.requiresTier === "string" && v.requiresTier.length > 0;
}

/** `GateLike` as the sheet's own type. No field is invented and none is dropped. */
export function toSheetGate(gate: GateLike): SheetGate {
  return {
    error: gate.error,
    requiresTier: gate.requiresTier as Tier,
    ...(gate.feature ? { feature: gate.feature as Feature } : {}),
    ...(typeof gate.limit === "number" ? { limit: gate.limit } : {}),
    ...(typeof gate.remaining === "number" ? { remaining: gate.remaining } : {}),
    ...(gate.resetsAt !== undefined ? { resetsAt: gate.resetsAt } : {}),
    ...(gate.window ? { window: gate.window as AllowanceWindow } : {}),
  };
}

// ─── The store ───────────────────────────────────────────────────────────────

let openGate: SheetGate | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

/**
 * Raise the upgrade sheet for this gate, which may be a server 403 body, a
 * `syntheticGate()` for a client-side teaser, or a `planGate()` that names no
 * feature at all.
 *
 * Returns whether it opened, so a caller can fall back to its own error line if
 * it was handed something that is not a gate.
 */
export function showUpgradeSheet(gate: GateLike | SheetGate | null | undefined): boolean {
  if (!isSheetGate(gate)) return false;
  openGate = toSheetGate(gate);
  emit();
  return true;
}

/** Close it. Idempotent — a second call while closed notifies nobody. */
export function hideUpgradeSheet(): void {
  if (openGate === null) return;
  openGate = null;
  emit();
}

/** The gate on show, or null when the sheet is closed. */
export function getUpgradeSheetGate(): SheetGate | null {
  return openGate;
}

/** Subscribe to every open and close. Returns the unsubscribe. */
export function subscribeToUpgradeSheet(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
