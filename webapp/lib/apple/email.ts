// THE ADDRESS RULES FOR SIGN IN WITH APPLE. Pure, and the reason this card is
// not "just another OAuth provider".
//
// Apple gives us one of three things:
//
//   1. the member's real address, verified — safe to match to an existing
//      member, because they proved control of it to Apple;
//   2. a "Hide My Email" RELAY address (@privaterelay.appleid.com) — a
//      per-app alias. Matching it to a member is impossible: nobody's account
//      is under that address, so a match by email would MISS and a new
//      account would be created for a member who already has one;
//   3. nothing at all. Apple only returns the address on the first
//      authorization, and a member who revoked the share (or a token from a
//      later sign-in) carries no `email` claim.
//
// Case 3 collides with a hard constraint: `User.email` is required and unique.
// So the row gets a PLACEHOLDER derived from Apple's subject — on a reserved,
// unroutable domain (RFC 2606 `.invalid`), so it can never collide with a real
// address, can never receive mail, and is recognisable on sight both by us and
// by a person reading the database. `canOfferAppleEmailLink` (lib/appleLink.ts)
// is what offers to replace it with the member's real one.

/** RFC 2606 reserves `.invalid`: guaranteed never to resolve, never to be
 *  somebody's address. */
export const APPLE_PLACEHOLDER_DOMAIN = 'appleid.invalid'

/** A stable, unroutable stand-in address for an Apple identity that shared no
 *  email. Derived from the subject, so re-signing in finds the same row. */
export function applePlaceholderEmail(sub: string): string {
  const safe = sub.trim().toLowerCase().replace(/[^a-z0-9._-]/g, '')
  return `apple-${safe || 'unknown'}@${APPLE_PLACEHOLDER_DOMAIN}`
}

export function isApplePlaceholderEmail(email?: string | null): boolean {
  if (!email) return false
  return email.trim().toLowerCase().endsWith(`@${APPLE_PLACEHOLDER_DOMAIN}`)
}

/** Is this an address a member could actually be reached at — i.e. not a
 *  relay alias and not our placeholder? */
export function isRealMemberAddress(email?: string | null): boolean {
  if (!email || !email.includes('@')) return false
  const value = email.trim().toLowerCase()
  if (isApplePlaceholderEmail(value)) return false
  return !value.endsWith('@privaterelay.appleid.com')
}

/**
 * MAY this Apple identity be matched to an existing member by email?
 *
 * Only for a verified, real address. A relay alias must not match (it cannot
 * be anybody's account address, and treating it as one would be a guess), and
 * an unverified address must not match — Apple marks its own relay addresses
 * verified, so `email_verified` is the weaker of the two checks, not a
 * substitute for the first.
 */
export function canMatchAppleEmailToMember(identity: {
  email?: string
  emailVerified: boolean
  isPrivateEmail: boolean
}): boolean {
  if (!identity.email) return false
  if (identity.isPrivateEmail) return false
  if (!isRealMemberAddress(identity.email)) return false
  return identity.emailVerified === true
}
