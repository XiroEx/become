/**
 * Where a member's name comes from when nobody typed one.
 *
 * Sign-up asks for an email and nothing else, so verify-link has to put
 * SOMETHING on User.name (the schema requires it) and uses the email's local
 * part. That is a placeholder, not an answer — "george8794" is not what anyone
 * wants to be called — so onboarding asks for a real name and starts from an
 * empty box rather than prefilling the invented one, which people would simply
 * tab past.
 *
 * Both the inventing and the recognising live here so they cannot drift: change
 * the shape of the fallback and the onboarding box stops recognising it, which
 * would silently prefill the placeholder again.
 */
export function fallbackNameFromEmail(email: string): string {
  return String(email ?? '').split('@')[0]
}

/** True when the stored name is the one we invented, or nothing at all. */
export function isFallbackName(
  name: string | null | undefined,
  email: string | null | undefined,
): boolean {
  const trimmed = (name ?? '').trim()
  if (!trimmed) return true
  if (!email) return false
  return trimmed.toLowerCase() === fallbackNameFromEmail(email).trim().toLowerCase()
}
