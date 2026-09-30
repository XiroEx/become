export type AuthMode = 'login' | 'register'

export interface AuthPageCopy {
  mode: AuthMode
  heading: string
  subtext: string
  toggleQuestion: string
  toggleLabel: string
  toggleHref: string
}

/**
 * Sign-in and sign-up get a PATHNAME EACH. This is the whole fix for "clicking
 * Sign in does nothing".
 *
 * Both views used to live at /login and were told apart by a bare `?register`
 * query param, so the toggle at the bottom of the sign-up form was a link from
 * /login?register to /login — same route, query only. The App Router treats
 * that as a navigation to the page it is already showing: the address bar never
 * changed, useSearchParams never re-fired, and the screen sat there. The link
 * was not broken in any way you could see by reading it; it pointed exactly
 * where it meant to.
 *
 * Two pathnames make the toggle an ordinary navigation, which cannot no-op.
 * Keep it that way: if a third auth view ever appears, give it a path here
 * rather than another query param. authPageMode.test.ts fails the build if a
 * toggle ever points back at the page it is drawn on.
 */
export const AUTH_PATH: Record<AuthMode, string> = {
  login: '/login',
  register: '/register',
}

/** Next.js hands a repeated query param as an array; we only ever want one. */
export function firstQueryValue(value: string | string[] | undefined): string | undefined {
  if (Array.isArray(value)) return value[0]
  return value
}

/** The URL of an auth view, carrying `next` through when there is one. */
export function authHref(mode: AuthMode, next?: string | null): string {
  const path = AUTH_PATH[mode]
  return next ? `${path}?next=${encodeURIComponent(next)}` : path
}

// The two views render from one component and one copy table so they cannot
// drift apart again — that drift (missing dark-mode classes, two sets of words)
// is why they were merged onto a single route in the first place.
export function getAuthPageCopy(mode: AuthMode, next?: string | null): AuthPageCopy {
  if (mode === 'register') {
    return {
      mode: 'register',
      heading: 'Create account',
      subtext: 'Start your transformation. Create a free account to get going.',
      toggleQuestion: 'Already have an account?',
      toggleLabel: 'Sign in',
      toggleHref: authHref('login', next),
    }
  }

  return {
    mode: 'login',
    heading: 'Sign in',
    subtext: 'Welcome back. Sign in to pick up where you left off.',
    toggleQuestion: "Don't have an account?",
    toggleLabel: 'Create one',
    toggleHref: authHref('register', next),
  }
}
