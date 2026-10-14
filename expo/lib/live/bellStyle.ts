/**
 * THE MEMBER'S LIFTING-LOAD UNIT, NATIVELY (NP-080 / NP-084, porting NP-209).
 *
 * Jon's rule (NP-028, 10/13): *"the KG members should be able to use KG
 * throughout the whole app."* NP-209 landed the server and web half of it
 * (`7d329997` on `main`): a logged set stores the raw number **plus the unit
 * it was entered in** (`ISetLog.weightUnit`, `IPRDimension.unit`), nothing is
 * ever converted, and `profile.weightUnit` carries no default — absent means
 * "never asked", and every DISPLAY read grandfathers it as lbs.
 *
 * This module is the native half's one place for that rule. There used to be
 * an `expo/lib/live/bellStyle.ts` with its own name-regex implement rule; it
 * was DELETED by NP-058 in favour of the shared copy in `@become/core`
 * (`shared/core/src/training/workout/dumbbellWeight.ts` ← the web's
 * `webapp/lib/workout/dumbbellWeight.ts`). The file is back, but only as the
 * unit-aware LABEL layer around that shared logic — the implement rule itself
 * still lives in `@become/core` and is still held identical to the web's by
 * `webapp/tests/unit/nativeParity/trainingModules.test.ts`.
 *
 * Two different units travel through the app and they must not be confused:
 *
 *  - **the member's unit** — `profile.weightUnit ?? 'lbs'`, read through
 *    {@link useLiftingUnit} (`lib/live/useLiftingUnit.ts`). It names every
 *    INPUT and every aggregate the member is about to produce (the weight
 *    box, the quick picks, the volume tile);
 *  - **a record's own stored unit** — `set.weightUnit` / `pr.unit`, read
 *    through {@link storedLoadUnit}. It names a number that was already
 *    written, whatever the member prefers today. Absent is lbs, because every
 *    set logged before NP-209 was entered in lbs.
 *
 * NOTHING HERE CONVERTS. There is no lb↔kg math in this file on purpose: the
 * stored number is displayed as stored, beside the unit it belongs to.
 */

import {
  bellWeightLabel as coreBellWeightLabel,
  type BellStyle,
  type WeightUnit,
} from "@become/core";

export {
  getBellWeightInfo,
  weightQuickPicks,
  type BellStyle,
  type BellWeightInfo,
} from "@become/core";
export type { WeightUnit } from "@become/core";

/**
 * What an un-stamped record is read as. A set or PR with no unit of its own
 * predates NP-209 (or belongs to a member who was never asked), and every one
 * of those was entered in pounds — the house grandfather rule, display-side
 * only, never written back.
 */
export const DEFAULT_LOAD_UNIT: WeightUnit = "lbs";

/** Narrow anything the API might hand us to a unit we can render. */
function asUnit(raw: unknown): WeightUnit | null {
  return raw === "kg" || raw === "lbs" ? raw : null;
}

/**
 * The member's lifting-load unit from a raw `profile.weightUnit`, which is
 * `undefined` for a member who has never been asked. The web gate
 * (`webapp/components/WeightUnitGate.tsx`) owns the ONE ask; native only ever
 * reads the answer, and falls back the same way the server does.
 */
export function memberLoadUnit(raw: unknown): WeightUnit {
  return asUnit(raw) ?? DEFAULT_LOAD_UNIT;
}

/**
 * The unit a STORED record was entered in — `ISetLog.weightUnit` on a set,
 * `IPRDimension.unit` on a PR. Absent is lbs, never the member's current
 * preference: re-labelling an old lb number as kg because the member has
 * since switched would silently restate the load.
 */
export function storedLoadUnit(raw: unknown): WeightUnit {
  return asUnit(raw) ?? DEFAULT_LOAD_UNIT;
}

/**
 * The web's input label for an implement style, `bellWeightLabel(style, unit)`
 * (`@become/core` ← `webapp/lib/workout/dumbbellWeight.ts`) — re-exported so
 * native call sites read the rule from one place. Defaults to lbs, as the
 * shared function does.
 */
export function bellWeightLabel(
  style: BellStyle,
  unit: WeightUnit = DEFAULT_LOAD_UNIT,
): string {
  return coreBellWeightLabel(style, unit);
}

/**
 * The SHORT label for the same thing — `lbs/DB`, `kg/KB`, `kg` — used by the
 * compact Track row, where "Weight per DB (kg)" does not fit a set line.
 */
export function compactBellWeightLabel(
  style: BellStyle,
  unit: WeightUnit = DEFAULT_LOAD_UNIT,
): string {
  if (style === "dumbbell") return `${unit}/DB`;
  if (style === "kettlebell") return `${unit}/KB`;
  return unit;
}

/**
 * `= N kg total` — the doubled-load hint under the weight box, for a loaded
 * PAIR only (`BellWeightInfo.showTotal`). The DOUBLING is per-implement
 * arithmetic on one entered number, not a unit conversion: two 40 kg bells
 * are 80 kg, two 40 lb bells are 80 lb.
 */
export function bellTotalLabel(
  perBell: number,
  unit: WeightUnit = DEFAULT_LOAD_UNIT,
): string {
  return `= ${perBell * 2} ${unit} total`;
}

/** A load and its unit, e.g. `135 lbs` / `60 kg`. */
export function loadLabel(
  weight: number,
  unit: WeightUnit = DEFAULT_LOAD_UNIT,
): string {
  return `${weight} ${unit}`;
}

/** `135 lbs × 5 reps` — the Last/PR reference line's loaded form. */
export function loadRepsLabel(
  weight: number,
  reps: number,
  unit: WeightUnit = DEFAULT_LOAD_UNIT,
): string {
  return `${loadLabel(weight, unit)} × ${reps} reps`;
}

/**
 * The unit SPOKEN, for an accessibility label — a screen reader saying "lbs"
 * or "kg" letter by letter is worse than the word.
 */
export function spokenUnit(unit: WeightUnit = DEFAULT_LOAD_UNIT): string {
  return unit === "kg" ? "kilograms" : "pounds";
}

/**
 * The quick-pick button's accessibility label, e.g. "Log 20 kilograms".
 *
 * The PICKS THEMSELVES now follow the member's unit too: the shared
 * `weightQuickPicks(style, unit)` (re-exported above ← the web's
 * `webapp/lib/workout/dumbbellWeight.ts`) answers kg with kg EQUIPMENT
 * numbers — 20/40/60/80/100 on a bar, 5s per dumbbell, the 8–24 kg bells —
 * and lbs with the pound ladders, with no conversion between them. Native
 * call sites pass the same unit they label the box with; omitting it is still
 * lbs.
 */
export function quickPickLabel(
  pick: number,
  unit: WeightUnit = DEFAULT_LOAD_UNIT,
): string {
  return `Log ${pick} ${spokenUnit(unit)}`;
}
