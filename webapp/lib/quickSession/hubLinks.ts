// Deep links into the Sessions tab of the Workout hub.
//
// "Build a custom session" used to land you on the plain Sessions list, which
// still required a tap on "Build" to reveal the actual form — an extra step
// past the one the button already implied. BUILD_SESSION_HREF carries a
// ?build=1 flag that the hub reads via shouldAutoOpenBuilder to expand the
// builder immediately instead.

// Where "My Sessions" (see-all / empty CTA) leads — the plain Sessions list.
export const SESSIONS_HUB_HREF = "/dashboard/workout/hub?tab=sessions";

// Where "Build a custom session" leads — same tab, builder already open.
export const BUILD_SESSION_HREF = "/dashboard/workout/hub?tab=sessions&build=1";

/** True when the URL was reached via BUILD_SESSION_HREF's auto-open flag. */
export function shouldAutoOpenBuilder(searchParams: URLSearchParams): boolean {
  return searchParams.get("build") === "1";
}
