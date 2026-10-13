/**
 * Physically-plausible per-100 calorie value for an OpenFoodFacts nutriments
 * blob, plus a detector for records whose own fields contradict each other.
 *
 * OFF's kcal field is wrong in two different ways:
 *
 *  1. Absurd — a bad serving_size (e.g. "1.0g") makes it come out 100x+ too
 *     large (18000 kcal/100 g for a hotdog bun). No real food exceeds ~900
 *     kcal/100 g (pure fat = 900), so a magnitude check catches these, and
 *     the kJ field or the macros can stand in.
 *
 *  2. Plausible but wrong — Swanson Sipping Bone Broth is published at 89.3
 *     kcal/100 g when the truth is ~17: 271 cal for a container of broth that
 *     is 10 g of protein and nothing else. 89 is an ordinary number, so no
 *     magnitude check can see it.
 *
 * Case 2 is DETECTED here but deliberately NOT auto-corrected, because the
 * record cannot say which of its fields is the broken one. Two worked examples,
 * both real:
 *
 *   Bone broth  kcal/100g 89.3 · kJ/100g 73 (=17.4) · macros 3.3P 0.7C 0.2F
 *               The macros are correctly scaled per-100 g values and agree
 *               with the kJ. The kcal is the outlier and is wrong.
 *
 *   Pistachios  kcal/100g 571 · kJ/100g 743 (=178) · macros 6P 8C 13F
 *               Here 571 is RIGHT (pistachios really are ~570) and the macros
 *               are the label's per-28 g-serving figures sitting in the
 *               per-100 g fields. The kJ was entered on that same mistaken
 *               basis, so it corroborates the wrong number.
 *
 * In both, two fields agree and one dissents — and in one case the majority is
 * right while in the other it is wrong. Reading 6P/8C/13F as per-serving makes
 * the pistachio record fully self-consistent at 571, and reading them as
 * per-100 g makes it fully self-consistent at 178. Both worlds hold together;
 * only knowing that pistachios are calorie-dense breaks the tie, and that is
 * knowledge the record does not contain. USDA has no entry for either UPC, so
 * there is no independent third source to appeal to either.
 *
 * So: a contradiction sets `needsReview` and goes to a human, and the number
 * ships exactly as the source published it. Silently replacing 571 with 178
 * would be a worse failure than showing the source's own value, because it
 * would be our error rather than theirs and nobody would be looking for it.
 */

/** kJ per kcal (thermochemical). */
const KJ_PER_KCAL = 4.184

/** Nothing edible exceeds pure fat, 900 kcal/100 g. */
const MAX_KCAL_PER_100 = 950

/** How far apart two energy figures may sit and still be called consistent. */
const ENERGY_TOLERANCE = 0.35

/** Absolute slack so near-zero foods aren't judged on a percentage of nothing. */
const ABSOLUTE_SLACK = 5

export interface OffEnergyInput {
  energy_kcal_100g?: number | null
  /** OFF's `energy-kj_100g` / `energy_100g` when the unit is kJ. */
  energy_kj_100g?: number | null
  proteins_100g?: number | null
  carbohydrates_100g?: number | null
  fat_100g?: number | null
  fiber_100g?: number | null
  alcohol_100g?: number | null
}

const num = (v: unknown): number => {
  const n = Number(v)
  return isFinite(n) && n > 0 ? n : 0
}

/**
 * Calories implied by the macros.
 *
 * A RANGE, not a point, because the two label conventions disagree about
 * fibre: US labels fold it into carbohydrate, EU labels don't. Counting it
 * twice overstates a bran cereal; ignoring it understates psyllium to nearly
 * zero. The band spans both readings. Alcohol (7 kcal/g, in neither macro) is
 * added to both — without it every spirit looks like a broken record.
 */
function atwaterRange(n: OffEnergyInput): { low: number; high: number } | null {
  const p = num(n.proteins_100g)
  const c = num(n.carbohydrates_100g)
  const f = num(n.fat_100g)
  const fiber = num(n.fiber_100g)
  const alcohol = num(n.alcohol_100g)

  if (p > 100 || c > 100 || f > 100 || fiber > 100 || alcohol > 100) return null
  if (p + c + f + alcohol <= 0) return null

  const base = 4 * p + 4 * c + 9 * f + 7 * alcohol
  return { low: base, high: base + 2 * fiber }
}

/** True when `value` falls inside the Atwater band, within tolerance. */
function withinBand(value: number, band: { low: number; high: number }): boolean {
  return (
    value >= band.low * (1 - ENERGY_TOLERANCE) - ABSOLUTE_SLACK &&
    value <= band.high * (1 + ENERGY_TOLERANCE) + ABSOLUTE_SLACK
  )
}

const usable = (v: number) => v > 0 && v <= MAX_KCAL_PER_100

/**
 * The per-100 g calorie figure to store.
 *
 * Returns the source's own value whenever it is physically possible. Only an
 * impossible magnitude triggers a substitution, and then the kJ field is
 * preferred over an Atwater estimate because it is a measured figure rather
 * than a reconstruction.
 */
export function plausibleOffKcal(n: OffEnergyInput | null | undefined): number {
  if (!n) return 0

  const stated = num(n.energy_kcal_100g)
  if (usable(stated)) return Math.round(stated)

  const fromKj = num(n.energy_kj_100g) / KJ_PER_KCAL
  const band = atwaterRange(n)

  if (usable(fromKj) && (!band || withinBand(fromKj, band))) return Math.round(fromKj)
  if (band && usable(band.low)) return Math.round(band.low)
  if (usable(fromKj)) return Math.round(fromKj)
  return 0
}

export type OffEnergyConflict = {
  /** What the source publishes, per 100 g. */
  stated: number
  /** kJ field converted to kcal, or null when absent. */
  fromKj: number | null
  /** Calories the macros can account for, per 100 g. */
  fromMacros: number | null
  /** Human-readable reason, for the admin review queue. */
  reason: string
}

/**
 * Detect a record whose energy field contradicts its own macros and/or its own
 * kJ figure — the Swanson bone broth signature.
 *
 * This does NOT say which field is wrong (see the header). It says the record
 * disagrees with itself and a person should look at it. Callers use it to set
 * `needsReview`; nothing here changes a stored value.
 */
export function detectOffEnergyConflict(
  n: OffEnergyInput | null | undefined,
): OffEnergyConflict | null {
  if (!n) return null

  const stated = num(n.energy_kcal_100g)
  if (stated <= 0) return null

  const kj = num(n.energy_kj_100g)
  const fromKj = kj > 0 ? kj / KJ_PER_KCAL : null
  const band = atwaterRange(n)

  // The kJ and kcal fields are the same measurement twice. Disagreeing is
  // unambiguous evidence of a data-entry fault, whichever one is wrong.
  if (fromKj != null && !withinBand(stated, { low: fromKj, high: fromKj })) {
    return {
      stated: Math.round(stated),
      fromKj: Math.round(fromKj),
      fromMacros: band ? Math.round(band.low) : null,
      reason: `Energy stated as ${Math.round(stated)} kcal/100g but the kJ field says ${Math.round(kj)} kJ (${Math.round(fromKj)} kcal)`,
    }
  }

  // Energy the stated matter cannot possibly carry: even pure fat tops out at
  // 9 kcal/g, so calories far above 9x the macro mass mean either the energy
  // or the macros were entered on the wrong basis.
  if (band && !withinBand(stated, band)) {
    return {
      stated: Math.round(stated),
      fromKj: fromKj != null ? Math.round(fromKj) : null,
      fromMacros: Math.round(band.low),
      reason: `Energy stated as ${Math.round(stated)} kcal/100g but the macros only account for ${Math.round(band.low)} kcal`,
    }
  }

  return null
}

/**
 * Pull kJ-per-100 g out of a raw OFF `nutriments` blob.
 *
 * OFF's live API uses hyphenated keys (`energy-kj_100g`) and also carries a
 * generic `energy_100g` whose unit is declared separately in `energy_unit` —
 * usually kJ, but not always, so the unit is checked rather than assumed.
 */
export function offKjPer100(raw: Record<string, unknown> | null | undefined): number | undefined {
  if (!raw) return undefined
  const explicit = num(raw['energy-kj_100g'] ?? raw['energy_kj_100g'])
  if (explicit > 0) return explicit
  const unit = String(raw['energy_unit'] ?? '').toLowerCase()
  if (unit === 'kj') {
    const generic = num(raw['energy_100g'])
    if (generic > 0) return generic
  }
  return undefined
}
