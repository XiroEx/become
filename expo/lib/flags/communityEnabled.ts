/**
 * NP-032: the ONE build-time flag that hides chat, community, groups and
 * events in the native v1 store build.
 *
 * The web already shows all four as "Coming soon" to everyone but an admin
 * (`webapp/components/FeatureGuard.tsx`). Native shipped a live Chat tab with
 * a 30-second unread poll to every member; George decided 9/28 to hold the
 * whole surface out of the first store build. `EXPO_PUBLIC_*` env vars are
 * inlined by Metro at build time and still readable through `process.env` at
 * runtime (which is how a test flips it without touching a build config), so
 * this is a single read, not a remote flag and not a per-user entitlement.
 *
 * OFF is everything but the literal string `"true"` — unset (every
 * production build), empty, `"1"`, `"TRUE"` — all off. A flag that fails open
 * on a typo would ship chat by accident.
 *
 * Every consumer that already understood a `communityEnabled` boolean
 * (`lib/navigation/webPathToRoute.ts`'s resolver, `lib/settings/
 * notificationPreferences.ts`'s toggle list) takes THIS value, and the tab
 * layout (`app/(app)/(tabs)/_layout.tsx`) reads it too — one flag, read in
 * exactly the places NP-032 owns, and nowhere cached at import time so a test
 * can flip `process.env.EXPO_PUBLIC_COMMUNITY_ENABLED` and call it again.
 */
export const COMMUNITY_ENABLED_ENV_VAR = "EXPO_PUBLIC_COMMUNITY_ENABLED";

export function isCommunityEnabled(): boolean {
  return process.env[COMMUNITY_ENABLED_ENV_VAR] === "true";
}
