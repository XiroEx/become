export interface NativeIntentInput {
  /** The path the OS handed us, already stripped of the scheme/host. */
  path: string;
  /** True when this link is what STARTED the process (a cold start). */
  initial: boolean;
}

/**
 * EVERY LINK THE OS OPENS THE APP WITH COMES THROUGH HERE FIRST.
 *
 * expo-router calls `redirectSystemPath` for each incoming URL — a universal
 * link, an App Link, a `become://` URL, a notification tap — before it
 * resolves the route, including the one the app was cold-started on. That
 * makes this the one place a link can be rewritten, and therefore the one
 * place worth saying out loud that today it rewrites NOTHING: the path the
 * app was opened on is the path it lands on.
 *
 * That matters because the launch decision used to happen somewhere else and
 * win: the cold-open gate in `app/_layout.tsx` replaced the route with
 * `/login` while `/verify?token=…` was still mounting, so tapping a magic
 * link on a cold app spent the token and showed the sign-in screen. The gate
 * no longer navigates at all (see `app/_layout.tsx`), and `app/index.tsx` —
 * which is only ever mounted when the app was opened on `/` — decides where
 * a launch with no link goes.
 *
 * NP-034 adds the resolver that maps WEB paths (`become.redbtn.io/dashboard`,
 * `/dashboard/workout/123`) onto their native routes. It belongs here, and it
 * must keep returning the path unchanged for anything it does not recognise:
 * an unknown link is `+not-found`'s problem, not a silent bounce to Home.
 */
export function redirectSystemPath({ path }: NativeIntentInput): string {
  return path;
}
