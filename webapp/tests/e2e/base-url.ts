/**
 * The one place the e2e base URL is resolved, and the one place production is
 * fenced off.
 *
 * This module is deliberately free of secrets and of any heavy import, so both
 * playwright.config.ts (loaded once, in the runner) and test-auth.ts (loaded in
 * every worker) can pull it in. The guard therefore runs in whichever process
 * gets there first, and a spec that builds its own URL still trips it.
 *
 * Why the default moved: `npm run test:e2e` used to point at
 * https://become.redbtn.io with no webServer declared, so the ordinary,
 * no-arguments invocation drove a browser through PRODUCTION — enrolling
 * programs, writing schedules and skipping workouts on live member accounts.
 * The default is now localhost, and reaching production takes a deliberate act.
 *
 * Beta is fenced too. become-beta.redbtn.io is a separate workspace on the SAME
 * MongoDB (see CLAUDE.md, "Channels") — data written on beta is production
 * data, so it is exactly as destructive a target as prod.
 */

export const DEFAULT_BASE_URL = 'http://localhost:3000'

/** Hosts backed by the live production database. */
export const PRODUCTION_HOSTS = ['become.redbtn.io', 'become-beta.redbtn.io']

const OPT_IN = 'PLAYWRIGHT_ALLOW_PROD'

export function assertNotProduction(url: string): void {
  let host: string
  try {
    host = new URL(url).hostname
  } catch {
    throw new Error(
      `PLAYWRIGHT_BASE_URL is not a valid URL: ${JSON.stringify(url)}`,
    )
  }

  if (!PRODUCTION_HOSTS.includes(host)) return
  if (process.env[OPT_IN] === '1') return

  throw new Error(
    `Refusing to run the e2e suite against ${host}.\n` +
      'These specs authenticate as a real member and write real data ' +
      '(enrolling programs, rewriting schedules, resetting onboarding), and ' +
      'beta shares production\'s database.\n\n' +
      `Point at a local server instead:\n` +
      `  PLAYWRIGHT_BASE_URL=${DEFAULT_BASE_URL} npm run test:e2e\n\n` +
      `If you genuinely mean to drive production, opt in explicitly:\n` +
      `  ${OPT_IN}=1 PLAYWRIGHT_BASE_URL=https://${host} npm run test:e2e`,
  )
}

/** The resolved, guarded base URL. Importing this module is enough to fail. */
export function resolveBaseUrl(): string {
  const url = process.env.PLAYWRIGHT_BASE_URL || DEFAULT_BASE_URL
  assertNotProduction(url)
  return url
}

export const BASE_URL = resolveBaseUrl()
