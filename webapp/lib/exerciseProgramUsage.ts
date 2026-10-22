// How many programs prescribe an exercise — the ordering behind the admin
// portal's "No Video" queue.
//
// The queue is the list of exercises waiting for Jon to record a demo, and
// the most useful one to record next is the one the most programs are already
// prescribing: every program naming it renders that workout without footage
// until it exists. So the No Video tab sorts most-used first and shows the
// count beside each row.
//
// "Used" is a program that names the slug anywhere in its phases/workouts —
// distinct programs, not reference slots, so five slots in one program do not
// outrank one slot in each of two. `__protocol__` markers are routing
// markers with no catalog row by design, not prescriptions.
//
// Pure and dependency-free: the route projects `phases` and counts in memory
// (a few hundred programs), and the comparator is exported so the ordering is
// unit-testable without a database.

export interface ProgramUsageLike {
  phases?: Array<{
    workouts?: Array<{
      exercises?: Array<{ exerciseSlug?: string }>
    }>
  }> | null
}

/** `slug → number of programs prescribing it`. */
export function countExerciseProgramUsage(programs: ProgramUsageLike[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const program of programs ?? []) {
    const seen = new Set<string>()
    for (const phase of program?.phases ?? []) {
      for (const workout of phase?.workouts ?? []) {
        for (const entry of workout?.exercises ?? []) {
          const slug = entry?.exerciseSlug
          if (!slug || slug.startsWith('__protocol__')) continue
          seen.add(slug)
        }
      }
    }
    for (const slug of seen) {
      counts.set(slug, (counts.get(slug) ?? 0) + 1)
    }
  }
  return counts
}

/**
 * The No Video ordering: most-prescribed first, name as the tiebreak so the
 * queue is stable for exercises no program names yet.
 */
export function compareNoVideoByUsage(
  usage: Map<string, number>,
): (a: { slug: string; name: string }, b: { slug: string; name: string }) => number {
  return (a, b) => (usage.get(b.slug) ?? 0) - (usage.get(a.slug) ?? 0) || a.name.localeCompare(b.name)
}
