// Daily rotation for the Mind system dashboards. Deterministic by local day +
// an optional salt, so each system surfaces a FRESH item every day (kills the
// "same prompt every visit" feeling) while staying stable within a day. This is
// also the seam the AI engine later replaces with personalized selection.

export function dayOfYear(now: Date = new Date()): number {
  const start = new Date(now.getFullYear(), 0, 0)
  return Math.floor((now.getTime() - start.getTime()) / 86_400_000)
}

/** Index into a pool of `len`, rotating by day (+ salt to vary across systems). */
export function dailyIndex(len: number, salt = 0): number {
  if (len <= 0) return 0
  return (dayOfYear() + salt) % len
}

/** Today's deterministic pick from a pool. */
export function dailyPick<T>(arr: T[], salt = 0): T | undefined {
  if (!arr.length) return undefined
  return arr[dailyIndex(arr.length, salt)]
}
