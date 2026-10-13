import { after } from 'next/server'

/**
 * Run something once the response has been sent, if we are inside a request.
 *
 * This exists for work that MUST NOT happen while the handler is still running
 * — releasing an inventory claim (lib/inventoryClaims.ts) is the case it was
 * written for, because releasing it before the row is committed reopens the
 * race the claim exists to close.
 *
 * Doing it automatically rather than handing every create route a `release()`
 * to call is deliberate. The defect class this whole change is about is "a list
 * that was not updated when new code arrived": a route that forgets to release
 * would leave the member one slot stricter, and a route that releases in the
 * wrong place would silently uncap them.
 *
 * Returns false when there is no request scope — a script, a unit test — where
 * `after()` throws rather than running. Callers must be correct anyway when it
 * returns false: an inventory claim simply stops counting once it goes stale.
 */
export function afterResponse(fn: () => void | Promise<void>): boolean {
  try {
    after(fn)
    return true
  } catch {
    return false
  }
}
