// Per-tool accent colours for the Mind arsenal's full-screen dark surfaces —
// `GuidedFlow` (intros + guided protocols) and the breath player (NP-298).
//
// THE MODAL IS ALWAYS DARK. Both of those surfaces mirror the web's
// `fixed inset-0 z-[100] bg-black text-white` stage (`webapp/components/mind/
// system/GuidedFlow.tsx`, `webapp/components/mind/StateShiftDashboard.tsx`'s
// `BreathSession`) regardless of the device's light/dark setting — a modal
// that goes translucent-white on a light phone is not "parity", it is a
// second, unintended look. So every accent here resolves against the DARK
// palette on purpose, never the mode the device happens to be in.
//
// The mapping mirrors the web's `ACCENTS` map in
// `webapp/components/mind/ToolIntroGate.tsx` value-for-value:
//   state-shift   #06b6d4   self-image   #8b5cf6   mission   #3b82f6
//   vision        #10b981   social       #ec4899   discipline #ef4444
//   anti-sabotage #f97316
// expressed as token names rather than hex literals so a colour value is
// still written exactly once, in `lib/theme/tokens.ts`
// (`__tests__/noHexColorLiterals.test.ts`).
import { resolveToken, type TokenName } from "@/lib/theme/tokens";

export const MIND_ACCENT_TOKEN: Record<string, TokenName> = {
  "state-shift": "mind-cyan",
  "self-image": "mind-violet",
  mission: "mind-blue",
  vision: "mind-emerald",
  social: "mind-pink",
  discipline: "brand", // dark-mode brand is red-500 (#ef4444), the web's value
  "anti-sabotage": "orange", // orange-500 (#f97316) in both modes already
};

/** Fallback for an unrecognised system — self-image's violet, same as the web's `?? '#8b5cf6'`. */
const FALLBACK_TOKEN: TokenName = "mind-violet";

/**
 * Resolve a Mind system's accent for its always-dark GuidedFlow / breath
 * player stage. `system` is the Mind arsenal slug (`"state-shift"`,
 * `"self-image"`, …) — an unrecognised one falls back exactly like the web's
 * `ACCENTS[system] ?? '#8b5cf6'`.
 */
export function mindAccentColor(system: string): string {
  const token = MIND_ACCENT_TOKEN[system] ?? FALLBACK_TOKEN;
  return resolveToken(token, "dark");
}
