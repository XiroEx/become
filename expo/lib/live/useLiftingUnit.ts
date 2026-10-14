/**
 * THE MEMBER'S LIFTING-LOAD UNIT, AS A HOOK (NP-080 / NP-084, porting NP-209).
 *
 * `profile.weightUnit ?? 'lbs'` — the same read the web's
 * `lib/useMemberWeightUnit.ts` does, and the same fallback the server uses.
 * The member profile is already in hand on native (the auth session carries
 * it), so this is a context read, not a fetch.
 *
 * NATIVE NEVER ASKS. The one lb/kg ask is the web's `WeightUnitGate`
 * (NP-209); both apps read the same `profile.weightUnit`, and the native
 * Settings screen can still change it. A second native ask is explicitly out
 * of scope — see the card's "do not".
 *
 * Screens call this and pass the answer DOWN as a `weightUnit` prop: the
 * live/track/summary/progress components stay pure functions of their props
 * (defaulting to lbs), which is what makes them testable without an auth
 * provider and what keeps one screen from rendering two different units.
 */

import { useUnits } from "@/lib/hooks/useUnits";
import { memberLoadUnit, type WeightUnit } from "@/lib/live/bellStyle";

/** The member's chosen lifting-load unit; `'lbs'` when they have never chosen. */
export function useLiftingUnit(): WeightUnit {
  // `useUnits()` is the existing `profile.weightUnit` read (NP-048) and
  // already fails soft to lbs outside an auth provider; `memberLoadUnit`
  // re-states the narrowing so this hook's answer cannot widen.
  const { weightUnit } = useUnits();
  return memberLoadUnit(weightUnit);
}
