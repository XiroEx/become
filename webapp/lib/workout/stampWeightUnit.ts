// Stamps the member's current lb/kg preference onto every set of a save
// (NP-209: raw + unit — see models/UserProgress.ts#ISetLog.weightUnit and
// lib/exercisePRs.ts#IPRDimension.unit, which pick this value up when a set
// breaks a record).
//
// ONLY ever writes a unit the member actually chose. A member with no stored
// `profile.weightUnit` yet (never asked, or asked-and-dismissed) gets sets
// with NO weightUnit at all — never a silently-defaulted 'lbs' — so an
// un-stamped set reads exactly like a pre-NP-209 legacy one: grandfathered as
// lbs at DISPLAY time only (`weightUnit ?? 'lbs'`), never written here.
//
// Pure: no IO, no clock — testable on its own. Generic over the caller's own
// exercise/set shapes (the program-day and quick-session save paths each have
// their own ExerciseData/SetData interfaces in app/api/workouts/route.ts) so
// stamping never widens a set to `unknown` and loses every other field a
// downstream reader (PR detection, the DB write) needs.
export function stampWeightUnit<
  S extends { weight?: number | null; weightUnit?: 'lbs' | 'kg' },
  E extends { sets: S[] },
>(exercises: E[], unit: 'lbs' | 'kg' | null | undefined): E[] {
  if (!unit) return exercises
  return exercises.map((ex) => ({
    ...ex,
    sets: ex.sets.map((set) => ({ ...set, weightUnit: unit })),
  })) as E[]
}
