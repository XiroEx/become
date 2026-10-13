// NP-209: a logged set stores the number as entered PLUS the unit it was
// entered in (raw + unit — George's DECIDED comment on the card, the same
// shape IWeightEntry already uses for body weigh-ins). The member never
// picks a unit per set — it is their current weightUnit preference at save
// time — so the SERVER stamps it on the way in rather than trusting a client
// field. One pure function, used by both the program-day and quick-session
// save paths in app/api/workouts/route.ts so neither grows its own rule.
//
// Two keys, not one: `weightUnit` is what gets persisted onto ISetLog
// (matches `profile.weightUnit`'s naming); `unit` is what
// lib/exercisePRs.ts#IPRSetCandidate reads to stamp a broken PR dimension.
// Mongoose's SetLogSchema has no `unit` path, so it is silently dropped when
// the SAME stamped array is saved as a workout log — only `weightUnit`
// persists there. Both reads work off one stamped array; neither grows a
// second pass over the sets.
export function stampSetWeightUnit<S extends { weight?: number | null }, E extends { sets?: S[] | null }>(
  exercises: E[] | null | undefined,
  unit: 'lbs' | 'kg',
): Array<Omit<E, 'sets'> & { sets: Array<S & { weightUnit: 'lbs' | 'kg'; unit: 'lbs' | 'kg' }> }> {
  return (exercises ?? []).map((ex) => ({
    ...ex,
    sets: (ex.sets ?? []).map((s) => ({ ...s, weightUnit: unit, unit })),
  }))
}
