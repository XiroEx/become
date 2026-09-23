// Run with: npm run test:file tests/unit/account/storeReadiness.test.tsx
//
// WHY A SOURCE-LEVEL TEST, AND WHY IT REACHES INTO ../expo
//
// The card this file exists for is checked by two humans: an App Store reviewer
// who signs in, opens Settings and looks for "Delete account" without leaving
// the app, and a Play reviewer who opens a public URL and expects to be able to
// request deletion there. Neither of those is a function call, so neither can
// be unit-tested in the usual way. What CAN be pinned is the structure that
// makes them true — and the failure mode is always the same quiet one: the
// control gets moved behind a tab, or the native screen loses the section in a
// refactor, and nobody notices until a build is rejected.
//
// `.github/workflows/ci.yml` runs the WEBAPP suite and nothing else, so this is
// the only place in the repository where an assertion about the Expo app
// actually runs on a pull request. That is the whole reason the native checks
// live here rather than in expo/__tests__ (where they ALSO live, for anyone
// running that suite locally).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import RestoreClient from '../../../app/account/restore/RestoreClient'
import {
  ACCOUNT_DELETION_GRACE_DAYS,
  ACCOUNT_RESTORE_PATH,
  DELETION_REQUEST_PATH,
} from '../../../lib/accountDeletion'

const ROOT = path.join(__dirname, '../../..')
const REPO = path.join(ROOT, '..')
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8')
const readRepo = (rel: string) => fs.readFileSync(path.join(REPO, rel), 'utf8')

// ─── The web build ───────────────────────────────────────────────────────────

test('the web Settings screen renders the danger zone OUTSIDE the tab switcher', () => {
  const src = read('app/dashboard/settings/page.tsx')
  assert.match(src, /import DangerZone from '@\/components\/settings\/DangerZone'/, 'settings does not import the danger zone')
  assert.match(src, /<DangerZone \/>/, 'settings imports the danger zone but never renders it')

  // The three tab blocks are `{activeTab === 'x' && (` … `)}`, and the danger
  // zone must not be inside any of them: a reviewer who lands on the Profile
  // tab has to see it without guessing which tab hides it.
  //
  // Checked two ways, because either alone is easy to satisfy by accident.
  // First, position: it comes after the LAST tab guard in the file.
  const zone = src.indexOf('<DangerZone />')
  assert.ok(zone > 0, 'the danger zone is not rendered')
  const lastTabGuard = Math.max(
    src.lastIndexOf("{activeTab === 'profile'"),
    src.lastIndexOf("{activeTab === 'training'"),
    src.lastIndexOf("{activeTab === 'settings'"),
  )
  assert.ok(lastTabGuard > 0, 'the settings screen no longer has tabs; re-check this test')
  assert.ok(zone > lastTabGuard, 'the danger zone is rendered inside a tab block')

  // Second, nesting depth: everything inside a tab block is indented past the
  // top level of the returned tree. The danger zone sits at the same depth as
  // the toast, which is unconditionally rendered.
  assert.match(src, /^ {6}<DangerZone \/>$/m, 'the danger zone is nested deeper than the top level')
  assert.match(src, /^ {6}<Toast toast=\{toast\} \/>$/m, 'the toast moved; the depth check above is no longer calibrated')
})

test('the web danger zone is exactly two taps, with the second one destructive', () => {
  const src = read('components/settings/DangerZone.tsx')

  // Tap one opens the dialog; tap two performs the request. Nothing in between.
  assert.match(src, /data-testid="delete-account"/, 'no "Delete account" control')
  assert.match(src, /setConfirming\(true\)/, 'the first tap does not open a confirmation')
  assert.match(src, /data-testid="delete-account-confirm"/, 'no confirm control')
  assert.match(src, /onClick=\{requestDeletion\}/, 'the second tap does not perform the deletion')

  // And a way out that is at least as easy as the way in.
  assert.match(src, /data-testid="delete-account-cancel"/, 'the dialog has no way out')

  // No typed confirmation, no "email support" dead end. Both read as obstacles,
  // and an obstacle is the thing guideline 5.1.1(v) actually forbids.
  assert.doesNotMatch(src, /type="text"/, 'the dialog asks the member to type something')

  // It calls the member-facing route, not an admin one.
  assert.match(src, /'\/api\/me\/account'/, 'the danger zone does not call the deletion route')
  assert.match(src, /method: 'DELETE'/, 'the danger zone does not issue a DELETE')

  // Signing the device out is part of the request. The JWT cannot be revoked
  // server-side, so the client dropping it is the whole mechanism.
  assert.match(src, /logout\(\)/, 'the web client never drops its own session')
})

test('the restore page works with no session and does nothing until it is pressed', () => {
  // Rendered to STATIC markup: no session, no client state, no effects. That is
  // the situation the link is opened in — a mail app's in-app browser.
  const html = renderToStaticMarkup(<RestoreClient u="68f0000000000000000000aa" t={'a'.repeat(32)} />)
  assert.ok(html.includes('data-testid="restore-confirm"'), 'no button to press')
  assert.ok(html.includes('Keep my account'), 'the page does not say what the button does')

  // A link with the token missing must say so rather than offer a dead button.
  const broken = renderToStaticMarkup(<RestoreClient u="" t="" />)
  assert.ok(broken.includes('disabled'), 'a link with no token still offers a live button')

  // And the mutation is behind an onClick, never an effect: mail scanners fetch
  // every URL in a message before a human sees it.
  const src = read('app/account/restore/RestoreClient.tsx')
  assert.match(src, /onClick=\{restore\}/, 'the restore is not behind a press')
  assert.doesNotMatch(src, /useEffect/, 'the restore page runs something on mount')
})

test('the API GET on the restore route redirects instead of restoring', () => {
  // A mutating GET would let Outlook Safe Links and Gmail's image proxy cancel
  // deletions that members actually wanted.
  const src = read('app/api/me/account/restore/route.ts')
  const get = src.slice(src.indexOf('export async function GET'))
  assert.match(get, /NextResponse\.redirect/, 'GET does not redirect')
  assert.doesNotMatch(get, /await restore\(/, 'GET restores the account — a mutating GET')
})

test('the public deletion page and the restore page both sit outside /dashboard', () => {
  // middleware.ts bounces /dashboard/* to /login when there is no cookie. Both
  // of these are opened by people with no session, by definition.
  const middleware = read('middleware.ts')
  assert.match(middleware, /matcher: \['\/dashboard\/:path\*'\]/, 'the middleware matcher moved')

  assert.ok(fs.existsSync(path.join(ROOT, 'app/delete-account/page.tsx')), 'no public deletion page')
  assert.ok(fs.existsSync(path.join(ROOT, 'app/account/restore/page.tsx')), 'no restore page')
  assert.equal(DELETION_REQUEST_PATH, '/delete-account')
  assert.equal(ACCOUNT_RESTORE_PATH, '/account/restore')
})

test('the deletion email carries the undo link and the date, and no opt-out', () => {
  const src = read('lib/email.ts')
  assert.match(src, /export function accountDeletionEmailHtml/, 'no deletion email exists')

  const fn = src.slice(src.indexOf('export function accountDeletionEmailHtml'))
  const body = fn.slice(0, fn.indexOf('export async function sendAccountDeletionEmail'))
  assert.match(body, /\$\{restoreUrl\}/, 'the email does not carry the undo link')
  assert.match(body, /\$\{when\}/, 'the email does not say when the data goes')
  assert.match(body, /emailFooter\(/, 'the email has no CAN-SPAM postal address')
  // Transactional: a member cannot opt out of being told their account is about
  // to be erased, and CAN-SPAM does not ask them to.
  assert.doesNotMatch(body, /unsubscribeUrl/, 'a transactional email carries an opt-out')
})

// ─── The store builds ────────────────────────────────────────────────────────

test('the native Settings screen renders the danger zone, and Settings is reachable', () => {
  const settings = readRepo('expo/app/(tabs)/profile/health.tsx')
  assert.match(settings, /from "@\/components\/settings\/DangerZone"/, 'the native settings screen does not import the danger zone')
  assert.match(settings, /<DangerZone/, 'it imports the danger zone but never renders it')

  // `(tabs)/profile` is a hidden route with no tab of its own, so without an
  // entry point the whole Settings screen — and the deletion path with it — is
  // unreachable in a store build.
  const layout = readRepo('expo/app/(tabs)/_layout.tsx')
  assert.match(layout, /name="profile" options=\{\{ href: null \}\}/, 'the profile route is no longer a hidden tab; re-check how Settings is reached')

  const dashboardRoute = readRepo('expo/app/(tabs)/dashboard/index.tsx')
  assert.match(dashboardRoute, /onOpenSettings=/, 'the native dashboard offers no way into Settings')
  assert.match(dashboardRoute, /\/\(tabs\)\/profile\/health/, 'the settings entry does not point at the settings screen')

  const dashboardScreen = readRepo('expo/components/DashboardScreen.tsx')
  assert.match(dashboardScreen, /testID="dashboard-open-settings"/, 'the dashboard has no Settings control')
})

test('the native danger zone is two taps and reports the platform that asked', () => {
  const src = readRepo('expo/components/settings/DangerZone.tsx')
  assert.match(src, /testID="delete-account"/, 'no "Delete account" control')
  assert.match(src, /setConfirming\(true\)/, 'the first tap does not open a confirmation')
  assert.match(src, /testID="delete-account-confirm"/, 'no confirm control')
  assert.match(src, /testID="delete-account-cancel"/, 'the dialog has no way out')
  assert.match(src, /Platform\.OS === "android" \? "android" : "ios"/, 'the request does not say which platform asked')
})

test('the native client drops its own JWT, which is what "signed out" means', () => {
  const src = readRepo('expo/lib/account/deleteAccount.ts')
  assert.match(src, /method: "DELETE"/, 'the native client does not issue a DELETE')
  assert.match(src, /"\/api\/me\/account"/, 'the native client calls the wrong route')
  assert.match(src, /store\.clear\(\)/, 'the native client never clears the stored JWT')
  assert.match(src, /pushSubscriptionsDropped/, 'the native client ignores what happened to its push token')
})

test('the restore link is claimed by both store builds as well as the browser', () => {
  const appJson = JSON.parse(readRepo('expo/app.json')) as {
    expo: {
      scheme?: string
      ios?: { associatedDomains?: string[] }
      android?: {
        intentFilters?: {
          autoVerify?: boolean
          data?: { scheme?: string; host?: string; pathPrefix?: string }[]
        }[]
      }
    }
  }

  // iOS: the whole domain is associated, so /account/restore is covered by the
  // same applinks entry that covers /verify.
  assert.ok(
    appJson.expo.ios?.associatedDomains?.includes('applinks:become.redbtn.io'),
    'iOS no longer claims become.redbtn.io as an associated domain',
  )

  // Android: paths are claimed one at a time, so the restore path needs its own
  // data entry or the link opens in a browser and never in the app.
  const filters = appJson.expo.android?.intentFilters ?? []
  const restore = filters.find((f) =>
    f.data?.some((d) => d.host === 'become.redbtn.io' && d.pathPrefix === ACCOUNT_RESTORE_PATH),
  )
  assert.ok(restore, 'Android does not claim the /account/restore link')
  assert.equal(restore.autoVerify, true, 'the restore app-link is not auto-verified')

  // The custom scheme is the fallback on a device where verification has not
  // happened yet — a fresh install, or a sideloaded review build.
  assert.equal(appJson.expo.scheme, 'become')

  // And the native screen that handles it exists and needs no session.
  const route = readRepo('expo/app/account/restore.tsx')
  assert.match(route, /restoreAccount\(/, 'the native restore screen does not call the restore endpoint')
  assert.doesNotMatch(route, /useAuth\(/, 'the native restore screen demands a session it may not have')
})

test('the undo window is one number, and the copy everywhere reads it', () => {
  assert.equal(ACCOUNT_DELETION_GRACE_DAYS, 7)
  // The native copy states seven days in prose, because the constant lives in
  // the webapp package. If the constant ever moves, this is what says so.
  const nativeZone = readRepo('expo/components/settings/DangerZone.tsx')
  assert.match(nativeZone, /seven days/, 'the native copy no longer states the undo window')
})

test('a scheduled sweep exists, or the window never closes', () => {
  // Nothing in the app watches a clock. Without the schedule, a deletion is
  // recorded, notifications stop — and the data sits there for ever, which is
  // the promise-shaped failure that looks fine from the outside.
  assert.ok(
    fs.existsSync(path.join(ROOT, 'app/api/cron/purge-deletions/route.ts')),
    'the purge endpoint is gone',
  )
  const workflow = readRepo('.github/workflows/purge-deleted-accounts.yml')
  assert.match(workflow, /schedule:/, 'the purge has no schedule')
  assert.match(workflow, /\/api\/cron\/purge-deletions/, 'the schedule calls something else')
  assert.match(workflow, /x-cron-secret/, 'the schedule does not authenticate')
})
