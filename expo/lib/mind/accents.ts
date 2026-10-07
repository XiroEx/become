// Per-tool accent for the Mind system's full-screen dark surfaces (NP-298):
// the tool intro (`ToolIntroGate` → `GuidedFlow`), the guided protocols
// (`GuidedFlow` again, launched from each dashboard's toolkit cards and its
// adaptive "Today's session" Begin) and the breath player.
//
// Mirrors the web's `ACCENTS` map in `webapp/components/mind/ToolIntroGate.tsx`
// hex for hex:
//
//   state-shift    #06b6d4  cyan-500
//   self-image     #8b5cf6  violet-500
//   mission        #3b82f6  blue-500
//   vision         #10b981  emerald-500
//   social         #ec4899  pink-500
//   discipline     #ef4444  red-500
//   anti-sabotage  #f97316  orange-500
//
// Native cannot write a hex literal (`noHexColorLiterals.test.ts`), so every
// one of those is a resolved theme token instead. Three of the seven already
// had a flat (mode-invariant) token that is the exact same hue — `mind-violet`
// (self-image), `brand`'s DARK value (discipline — red-500 is `darkTokens.brand`,
// see `lib/theme/tokens.ts`) and `orange` (anti-sabotage) — so only four new
// tokens were added: `mind-cyan`, `mind-blue`, `mind-emerald`, `mind-pink`.
//
// These surfaces are a FIXED DARK STAGE on both clients (the web's
// `fixed inset-0 bg-black`, native's bare `Modal` in `GuidedFlow.tsx` /
// `StateShiftDashboard.tsx`'s `BreathSession`) — never a themed one — so the
// accent is always resolved against the dark palette, regardless of the
// phone's own light/dark setting. That is also why `discipline` reads
// `darkTokens.brand` specifically rather than `resolveToken("brand", mode)`:
// `brand` is mode-aware (red-600 in light) and this stage has no light mode.
import { resolveToken, type TokenName } from "@/lib/theme/tokens";

/** The Mind systems that carry a GuidedFlow / breath-player intro or protocol. */
export type MindAccentSystem =
  | "state-shift"
  | "self-image"
  | "mission"
  | "vision"
  | "social"
  | "discipline"
  | "anti-sabotage";

const ACCENT_TOKEN: Record<MindAccentSystem, TokenName> = {
  "state-shift": "mind-cyan",
  "self-image": "mind-violet",
  mission: "mind-blue",
  vision: "mind-emerald",
  social: "mind-pink",
  discipline: "brand",
  "anti-sabotage": "orange",
};

/** Falls back to the web's own default accent (violet) for an unknown system. */
const DEFAULT_TOKEN: TokenName = "mind-violet";

/**
 * Resolve a Mind system id (`ToolIntroGate`'s `system` / a dashboard's own
 * identity) to the fixed-dark colour value its GuidedFlow / breath-player
 * surface draws with — the native equivalent of the web's `ACCENTS[system]`.
 */
export function mindAccentColor(system: string): string {
  const token = ACCENT_TOKEN[system as MindAccentSystem] ?? DEFAULT_TOKEN;
  return resolveToken(token, "dark");
}
