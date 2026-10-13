// Apple's `fullName`, normalised.
//
// The native SDK returns a structured personal-name object — and only on the
// FIRST authorization for an app; every sign-in after that carries nothing, by
// design, because Apple does not re-share what the member has already shared.
// So this is the one chance to learn a name, and the shape it arrives in
// depends on the client: the object from `AppleAuthentication.signInAsync`, or
// a string from a client that flattened it.
//
// It lives in lib/ rather than in the route because a Next.js `route.ts` may
// only export HTTP handlers — an extra export there is a build-time type
// error, so a helper worth testing has to have a home outside it.

function nonEmpty(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

/** A display name from whatever Apple (or the client) sent, or undefined. */
export function appleDisplayName(value: unknown): string | undefined {
  if (typeof value === 'string') return nonEmpty(value)
  if (!value || typeof value !== 'object') return undefined
  const parts = value as { givenName?: unknown; familyName?: unknown; nickname?: unknown }
  const joined = [nonEmpty(parts.givenName), nonEmpty(parts.familyName)]
    .filter(Boolean)
    .join(' ')
  return nonEmpty(joined) ?? nonEmpty(parts.nickname)
}
