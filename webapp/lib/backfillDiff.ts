// Pure helpers used by scripts/migrate-backfill-exercise-prs.ts to decide
// whether a per-user write is needed. Lives here (not in the script) so the
// logic can be unit-tested without spinning up MongoDB.
import type { IExercisePR } from './exercisePRs'

// Serialize a PR record's three dimensions into a single string for diffing.
// `date` is normalized to ms-since-epoch so JSON.stringify equality is
// meaningful across Date instances vs ISO strings that come back from .lean()
// queries.
export function fingerprintPR(pr: IExercisePR | undefined | null): string {
  if (!pr) return ''
  const dim = (d: IExercisePR['maxWeight']) =>
    d ? `${d.weight}|${d.reps}|${new Date(d.date).getTime()}|${d.e1rm ?? ''}|${d.programId ?? ''}` : ''
  return `${dim(pr.maxWeight)};${dim(pr.maxReps)};${dim(pr.maxE1RM)}`
}

export interface BackfillUserDiff {
  added: string[]      // exerciseSlugs that did not exist on the user before
  changed: string[]    // exerciseSlugs whose maxWeight/maxReps/maxE1RM differ
  unchanged: number
}

// Compare a user's pre-existing PRs against the recomputed set. Used to decide
// whether the backfill needs to write to this user at all and to report what
// changed in the per-user log line.
export function diffUser(
  before: IExercisePR[] | undefined,
  after: IExercisePR[],
): BackfillUserDiff {
  const bySlug = new Map<string, IExercisePR>()
  for (const pr of before ?? []) {
    if (pr?.exerciseSlug) bySlug.set(pr.exerciseSlug, pr)
  }
  const added: string[] = []
  const changed: string[] = []
  let unchanged = 0
  for (const pr of after) {
    const prev = bySlug.get(pr.exerciseSlug)
    if (!prev) {
      added.push(pr.exerciseSlug)
    } else if (fingerprintPR(prev) !== fingerprintPR(pr)) {
      changed.push(pr.exerciseSlug)
    } else {
      unchanged++
    }
  }
  return { added, changed, unchanged }
}

// Final no-op check the script uses to skip the updateOne for users whose
// recomputed PRs are already identical to what's persisted.
export function isBackfillNoop(
  before: IExercisePR[] | undefined,
  after: IExercisePR[],
): boolean {
  const diff = diffUser(before, after)
  return diff.added.length === 0 &&
    diff.changed.length === 0 &&
    (before?.length ?? 0) === after.length
}
