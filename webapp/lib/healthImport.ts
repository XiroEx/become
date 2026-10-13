/**
 * Weigh-ins that arrived from Apple Health or Health Connect rather than from a
 * member typing one into Become.
 *
 * A HEALTH SAMPLE IS NOT A MEMBER ACTION, AND IT IS NOT DATED BY THE IMPORT.
 * Those are the two rules everything here exists to hold:
 *
 *   - the day comes from the SAMPLE's own local date (`date`, NP-189), never
 *     from the clock at the moment the sync ran — a sample recorded last
 *     Tuesday belongs to last Tuesday, whenever the phone got round to handing
 *     it over;
 *   - the member did nothing in Become to earn it, so it does not credit a
 *     streak day and does not answer the weight prompt.
 *
 * Health hands back the same rows on every sync. The sample id (`externalId`)
 * is the only thing that can say "this is that one again", which is why it is
 * stored on the entry and why a repeat of one is accepted and ignored rather
 * than re-writing the day.
 */

/** The two platforms that can hand us a sample. */
export const HEALTH_SOURCES = ['healthkit', 'health-connect'] as const

export type HealthSource = (typeof HEALTH_SOURCES)[number]

/**
 * How far back an IMPORTED sample may be dated.
 *
 * `BACKDATE_WINDOW_DAYS` (7) is sized for the offline queue — "this is the same
 * trip". A first sync is a different thing: the member has been weighing
 * themselves on a smart scale for months and every one of those samples is
 * real history, not a delayed write. A quarter is enough to make the first
 * import worth having while still refusing a value whose day nobody can sanity
 * check any more.
 */
export const HEALTH_IMPORT_BACKDATE_WINDOW_DAYS = 90

/** Long enough for a HealthKit UUID or a Health Connect record id, and no more. */
const MAX_EXTERNAL_ID_LENGTH = 200

export interface HealthImportOrigin {
  source: HealthSource
  /** The sample's own id, when the client sent one. The de-duplication key. */
  externalId?: string
}

export type ReadHealthImport =
  | { ok: true; origin: HealthImportOrigin | null }
  | { ok: false; error: string }

function isHealthSource(v: unknown): v is HealthSource {
  return typeof v === 'string' && (HEALTH_SOURCES as readonly string[]).includes(v)
}

/**
 * Read `source` + `externalId` off a request body.
 *
 * `{ ok: true, origin: null }` is a perfectly ordinary member-typed write —
 * every client that exists today — and callers must behave exactly as they did
 * before for it.
 *
 * Refused with an error (the route answers 400) rather than quietly dropped,
 * because a sample silently filed as if the member had typed it is the bug
 * this exists to stop:
 *   - a `source` that is not one of the two platforms
 *   - an `externalId` with no `source`: an id from nowhere de-duplicates
 *     against nothing and means nothing
 *   - an `externalId` that is not a short, non-empty string
 */
export function readHealthImport(body: unknown): ReadHealthImport {
  const rec = body && typeof body === 'object' ? (body as Record<string, unknown>) : {}
  const rawSource = rec.source
  const rawExternalId = rec.externalId

  const hasSource = rawSource != null && rawSource !== ''
  const hasExternalId = rawExternalId != null && rawExternalId !== ''

  if (!hasSource) {
    if (hasExternalId) {
      return { ok: false, error: 'externalId requires a source' }
    }
    return { ok: true, origin: null }
  }

  if (!isHealthSource(rawSource)) {
    return {
      ok: false,
      error: `Invalid source: expected one of ${HEALTH_SOURCES.join(', ')}`,
    }
  }

  if (!hasExternalId) {
    return { ok: true, origin: { source: rawSource } }
  }

  if (
    typeof rawExternalId !== 'string'
    || rawExternalId.length > MAX_EXTERNAL_ID_LENGTH
  ) {
    return { ok: false, error: 'Invalid externalId' }
  }

  return { ok: true, origin: { source: rawSource, externalId: rawExternalId } }
}

/**
 * Where in a member's history this sample already sits, or -1.
 *
 * Matched on the sample id ALONE, not on the day: the same sample re-offered by
 * a later sync is the same sample whatever day it claims, and a second import
 * of it must not append a row or overwrite the value the member has since
 * corrected by hand.
 */
export function findEntryByExternalId(
  history: { externalId?: string }[] | undefined,
  externalId: string,
): number {
  if (!externalId) return -1
  return (history ?? []).findIndex(e => e.externalId === externalId)
}
