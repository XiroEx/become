/**
 * ─── Plan state and gate copy, for native ────────────────────────────────────
 *
 * ONE import path for both halves of a gate:
 *
 *   • the STORE and the hook (this package) — the only reader of
 *     `GET /api/me/entitlements`;
 *   • the COPY and the 403 parser, re-exported straight from `@become/core`.
 *
 * THERE IS NO NATIVE COPY OF THE COPY (Decision NP-017). `featureHeadline`,
 * `allowanceLine`, `formatResetsAt`, `syntheticGate`, `planGate`, `gateFrom`,
 * `tierLabel`, `hasManageableBilling`, `FEATURE_LABELS`, `FEATURE_NOUN`,
 * `FREE_LIMITS`, `FEATURE_MIN_TIER` and `PLUS_BENEFITS` are the SAME module the
 * web renders (`webapp/lib/entitlementsClient.ts` re-exports
 * `@become/core/entitlements` and nothing else), reached here through the Metro
 * `file:` link. A second copy is what lets a device and a browser disagree about
 * what a member was refused, so `__tests__/entitlementsWebParity.test.ts` fails
 * the build if either side grows one.
 *
 * `gateFrom` is deliberately NOT what a screen calls on a 403:
 * `classifyApiError` (shared/api-client) already parses one exactly as
 * `gateFrom` does, and `lib/errors/useApiErrorHandler` is the one place a
 * refusal becomes a sheet. It is re-exported here because the copy functions
 * take its output shape.
 */

export {
  DEFAULT_TIER,
  FEATURE_LABELS,
  FEATURE_MIN_TIER,
  FEATURE_NOUN,
  FEATURES,
  FREE_LIMITS,
  MANAGEABLE_STATUSES,
  PLUS_BENEFITS,
  TIER_RANK,
  TIERS,
  allowanceLine,
  featureHeadline,
  formatResetsAt,
  gateFrom,
  hasManageableBilling,
  planGate,
  syntheticGate,
  tierLabel,
} from "@become/core";
export type {
  AllowanceFacts,
  AllowanceKind,
  AllowanceWindow,
  EntitlementsSnapshot,
  Feature,
  FeatureEntitlement,
  FreeLimit,
  GatePayload,
  SheetGate,
  SubscriptionSnapshot,
  Tier,
} from "@become/core";

export * from "./store";
export * from "./useEntitlements";
// `showUpgradeSheet(gate)` — the one handle every gated screen raises the sheet
// with (NP-052). Exported from here rather than from the component so a screen
// does not import a sheet to open one.
export * from "./upgradeSheet";
// The checkout state machine and the two calls behind it. The CTA leaves the app
// through `Linking.openURL` and never `expo-web-browser`: Plus is sold from the
// iOS app only through an external link (decision 9/20).
export * from "./billing";
