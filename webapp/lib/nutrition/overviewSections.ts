/**
 * Rules for the food picker's DEFAULT view (the one with an empty search box).
 *
 * Pure so they can be tested directly. Both rules exist because of a real bug:
 *
 *   • `shouldShowOverview` — a barcode scan fills the result list and opens the
 *     scanned food WITHOUT ever setting the query. Gating the default view on
 *     the query alone therefore rendered the default list on top of the scan,
 *     and since the add panel renders inline under its own row, the scanned item
 *     never appeared at all. It only seemed to work when the scanned food
 *     happened to already be in the default list.
 *
 *   • `pickUnseen` — the four sections overlap by nature. A saved food eaten
 *     this morning is legitimately a Food, a Recent and a Frequent, and showing
 *     it three times filled the screen with the same handful of items.
 */

/**
 * Should the default overview replace the result list?
 *
 * Only when there is genuinely nothing else to show. An explicit result set —
 * from a search OR a barcode scan — always wins.
 */
export function shouldShowOverview(opts: {
  activeTab: string
  query: string
  resultCount: number
}): boolean {
  if (opts.activeTab !== 'all') return false
  if (opts.resultCount > 0) return false
  return opts.query.trim().length < 2
}

/**
 * Take up to `n` candidates not already claimed by an earlier section, marking
 * what it takes.
 *
 * Mutates `seen` on purpose: the sections are built in display order and each
 * one narrows what is left for the next, so the caller threads a single set
 * through all four.
 *
 * Backfilling matters as much as deduping. Removing an item from the second and
 * third sections without pulling a replacement leaves those sections short,
 * which is a different kind of broken from showing the item three times — hence
 * callers pass a POOL of candidates rather than exactly `n`.
 */
export function pickUnseen<T>(
  candidates: T[],
  keyOf: (item: T) => string,
  seen: Set<string>,
  n: number,
): T[] {
  const out: T[] = []
  for (const c of candidates) {
    if (out.length >= n) break
    const k = keyOf(c)
    if (!k || seen.has(k)) continue
    seen.add(k)
    out.push(c)
  }
  return out
}
