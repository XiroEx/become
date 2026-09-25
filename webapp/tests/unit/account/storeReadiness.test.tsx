// Run with: npm run test:file tests/unit/account/storeReadiness.test.tsx
//
// THE THINGS APPLE AND GOOGLE CHECK BY HAND, pinned where CI can check them
// instead.
//
// Apple opens the app signed in and looks for "Delete account" without leaving
// it (App Store Review Guideline 5.1.1(v)). Google's Data safety form asks for
// a public web URL where deletion can be requested, and someone loads it signed
// out. Neither is a code path a normal test would exercise, and both fail
// silently: a danger zone that moved inside a tab still renders, a native
// screen with no entry point still compiles, and a public page that stops
// being linked still resolves.
//
// So this file asserts REACHABILITY and WIRING, across both codebases:
//
//   1. the web settings screen renders the danger zone OUTSIDE its tab
//      switcher, so it is visible whichever tab is open;
//   2. the native settings screen renders one too, and the dashboard has the
//      entry point that makes that screen reachable at all;
//   3. requesting deletion drops every push registration and signs the device
//      out, on both platforms;
//   4. the restore link works from a browser AND from inside the app, which
//      means the app must claim the URL and post to the same public route;
//   5. the public /delete-account page exists, renders signed out, and is
//      linked from surfaces that do not require a session.
//
// The native assertions read expo/ from here on purpose: nothing runs the Expo
// test suite in CI (see .github/workflows/ci.yml), so this is the only gate
// the native half of the feature has.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'

import DeleteAccountPage from '../../../app/delete-account/page'
import RestoreAccountPage from '../../../app/account/restore/page'
import { DELETE_CONFIRMATION, RESTORE_WINDOW_DAYS } from '../../../lib/accountDeletion'
import { LEGAL_LINKS } from '../../../lib/legal'

const ROOT = path.join(__dirname, '../../..')
const REPO = path.join(ROOT, '..')
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8')
const readRepo = (rel: string) => fs.readFileSync(path.join(REPO, rel), 'utf8')

// ─── 1. The web settings screen ──────────────────────────────────────────────

/** The extent of every `{activeTab === '…' && ( … )}` block, by paren depth. */
function tabBlockRanges(src: string): [number, number][] {
  const ranges: [number, number][] = []
  const opener = /\{activeTab === '[a-z]+' && \(/g
  let match: RegExpExecArray | null
  while ((match = opener.exec(src)) !== null) {
    let depth = 0
    let i = match.index + match[0].length - 1 // the '(' itself
    for (; i < src.length; i++) {
      if (src[i] === '(') depth++
      else if (src[i] === ')') {
        depth--
        if (depth === 0) break
      }
    }
    ranges.push([match.index, i])
  }
  return ranges
}

test('the web danger zone renders outside the settings tab switcher', () => {
  const src = read('app/dashboard/settings/page.tsx')

  assert.match(src, /import DangerZone from '@\/components\/settings\/DangerZone'/, 'not imported')
  const at = src.indexOf('<DangerZone />')
  assert.ok(at > -1, 'the settings page does not render <DangerZone />')

  const ranges = tabBlockRanges(src)
  assert.ok(ranges.length >= 3, 'the tab blocks could not be located — has the page been restructured?')
  for (const [start, end] of ranges) {
    assert.ok(
      at < start || at > end,
      'the danger zone is inside a tab: a reviewer who opens Settings must SEE "Delete account" without guessing which tab hides it',
    )
  }
})

test('the web danger zone is two taps and signs the device out on success', () => {
  const src = read('components/settings/DangerZone.tsx')

  // Tap 1 raises the confirmation, tap 2 does it. No typed phrase, no third
  // screen — the confirmation the SERVER requires is a constant the client
  // sends, so the friction is a second button rather than a spelling test.
  assert.match(src, /data-testid="delete-account"/, 'no delete button')
  assert.match(src, /data-testid="confirm-delete-account"/, 'no confirmation step')
  assert.match(src, /method: 'DELETE'/, 'nothing calls DELETE /api/me/account')
  assert.match(src, /confirm: DELETE_CONFIRMATION/, 'the confirmation is typed out instead of imported')

  // Signed out afterwards: the session is worthless the moment the request
  // lands, and a dashboard belonging to an account being deleted is the
  // confusing half of every deletion flow that gets this wrong.
  assert.match(src, /\/api\/auth\/logout/, 'the cookie session is left alive')
  assert.match(src, /logout\(\)/, 'the local token is left in place')
  assert.match(src, /\/delete-account\?requested=1/, 'nothing tells the member what happens next')
})

// ─── 2. + 3. The store builds ────────────────────────────────────────────────

test('the native settings screen renders the danger zone', () => {
  const screen = readRepo('expo/app/(tabs)/profile/health.tsx')
  assert.match(screen, /import \{ DangerZone \} from "@\/components\/settings\/DangerZone"/, 'not imported')
  assert.match(screen, /<DangerZone/, 'imported but never rendered')
  assert.match(screen, /onDeleted=\{/, 'nothing happens after the account is deleted')
})

test('the native settings screen is REACHABLE — the dashboard has the entry point', () => {
  // Settings is a hidden route in the (tabs) tree (`href: null`), so without a
  // button it exists in the router and nowhere else: "Delete account is two
  // taps from Settings" is false if Settings cannot be opened at all.
  const layout = readRepo('expo/app/(tabs)/_layout.tsx')
  assert.match(layout, /name="profile" options=\{\{ href: null \}\}/, 'the profile route is no longer hidden — re-check this assertion')

  const dashboardScreen = readRepo('expo/components/DashboardScreen.tsx')
  assert.match(dashboardScreen, /testID="dashboard-open-settings"/, 'no settings control on the dashboard')
  assert.match(dashboardScreen, /accessibilityLabel="Settings"/, 'the settings control has no label')

  const dashboardRoute = readRepo('expo/app/(tabs)/dashboard/index.tsx')
  assert.match(dashboardRoute, /onOpenSettings=\{/, 'the dashboard never wires the settings control')
  assert.match(dashboardRoute, /\/\(tabs\)\/profile\/health/, 'the settings control does not open settings')
})

test('the native delete flow confirms, posts the same body, and clears the session', () => {
  const zone = readRepo('expo/components/settings/DangerZone.tsx')
  assert.match(zone, /testID="delete-account"/, 'no delete button')
  assert.match(zone, /testID="delete-account-confirm"/, 'no confirmation step')
  assert.match(zone, /requestImpl\(\{ jwt: token/, 'the request does not carry the session')
  assert.match(zone, /await clearToken\(\)/, 'the JWT is left in SecureStore')
  assert.match(zone, /onDeleted\?\.\(\)/, 'nothing navigates away from a deleted account')

  const client = readRepo('expo/lib/account/deleteAccount.ts')
  assert.match(client, /method: "DELETE"/, 'the native client does not call DELETE /api/me/account')
  assert.match(client, /\/api\/me\/account"/, 'the native client calls a different route')
  assert.match(client, /source: options\.source/, 'the request does not record which build it came from')
})

test('the two codebases agree on the confirmation phrase and the window', () => {
  // Deliberate duplication: the webapp is zod-free and does not import
  // @become/api-client (see lib/dashboardLayout/types.ts), so the constants
  // exist twice and this is what stops them drifting. A mismatch would make
  // every native deletion a 400 — and nothing in either build would say so.
  const client = readRepo('expo/lib/account/deleteAccount.ts')
  const confirmation = /export const DELETE_CONFIRMATION = "([^"]+)"/.exec(client)
  assert.ok(confirmation, 'the native client no longer declares the confirmation')
  assert.equal(confirmation[1], DELETE_CONFIRMATION, 'native and web disagree about the confirmation phrase')

  const window = /export const RESTORE_WINDOW_DAYS = (\d+)/.exec(client)
  assert.ok(window, 'the native client no longer declares the restore window')
  assert.equal(Number(window[1]), RESTORE_WINDOW_DAYS, 'native and web promise different restore windows')
})

test('requesting deletion drops every push registration this account holds', () => {
  // The web app and the store builds share one collection for push: a web
  // endpoint and a native Expo token are both rows in PushSubscription. One
  // deleteMany at REQUEST time is what makes "the native push token is dropped
  // like the web subscriptions are" true.
  const route = read('app/api/me/account/route.ts')
  const del = route.slice(route.indexOf('export async function DELETE'))
  assert.match(del, /PushSubscription\.deleteMany\(\{ userId: auth\.userId \}\)/, 'push registrations survive the request')
  assert.match(del, /notificationsEnabled: false/, 'a background resync could re-register the device')

  const model = read('models/PushSubscription.ts')
  assert.match(model, /'web', 'ios', 'android'/, 'native tokens no longer live in this collection — re-check the deletion route')
})

// ─── 4. The restore link, in a browser and in the app ────────────────────────

test('the restore link is claimed by both store builds', () => {
  const appJson = JSON.parse(readRepo('expo/app.json')) as {
    expo: {
      ios?: { associatedDomains?: string[] }
      android?: {
        intentFilters?: {
          autoVerify?: boolean
          data?: { scheme?: string; host?: string; pathPrefix?: string }[]
          category?: string[]
        }[]
      }
    }
  }

  // iOS: applinks on the domain covers every path, /account/restore included.
  assert.ok(
    (appJson.expo.ios?.associatedDomains ?? []).includes('applinks:become.redbtn.io'),
    'iOS no longer claims become.redbtn.io, so the restore link cannot open in the app',
  )

  // Android claims paths one at a time, so the restore path needs its own.
  const filter = (appJson.expo.android?.intentFilters ?? []).find((f) =>
    f.data?.some((d) => d.host === 'become.redbtn.io' && d.pathPrefix === '/account/restore'),
  )
  assert.ok(filter, 'Android does not claim /account/restore')
  assert.equal(filter?.autoVerify, true, 'without autoVerify the link opens a chooser, not the app')
  assert.deepEqual(filter?.category?.sort(), ['BROWSABLE', 'DEFAULT'])
})

test('both restore surfaces post to the same public route, and neither acts on load', () => {
  const web = read('app/account/restore/RestoreClient.tsx')
  const native = readRepo('expo/app/account/restore.tsx')

  assert.match(web, /'\/api\/me\/account\/restore'/, 'the web page posts somewhere else')
  assert.match(readRepo('expo/lib/account/deleteAccount.ts'), /\/api\/me\/account\/restore/, 'the app posts somewhere else')

  // A button, not an effect: mail scanners and link previewers open every URL
  // in an email before a person does.
  assert.match(web, /data-testid="restore-confirm"/, 'the web page has no button')
  assert.match(native, /testID="restore-confirm"/, 'the native screen has no button')
  assert.doesNotMatch(web, /useEffect/, 'the web page restores on load — a mail scanner would undo the deletion')
  assert.doesNotMatch(native, /useEffect/, 'the native screen restores on load')
})

test('the restore page renders signed out, with or without a usable link', async () => {
  const complete = renderToStaticMarkup(
    await RestoreAccountPage({ searchParams: Promise.resolve({ u: 'abc', t: 'def' }) }),
  )
  assert.match(complete, /Restore your account/)

  const empty = renderToStaticMarkup(
    await RestoreAccountPage({ searchParams: Promise.resolve({}) }),
  )
  assert.match(empty, /restore-missing/, 'an incomplete link must explain itself, not blank the page')
})

// ─── 5. The public deletion URL ──────────────────────────────────────────────

test('/delete-account renders signed out and says where the button is', async () => {
  const html = renderToStaticMarkup(
    await DeleteAccountPage({ searchParams: Promise.resolve({}) }),
  )

  assert.match(html, /Delete your Become account/, 'no title')
  assert.match(html, /Settings/, 'the page does not say where the in-app button is')
  assert.match(html, /Delete account/, 'the page never names the control it is describing')
  assert.match(html, new RegExp(`${RESTORE_WINDOW_DAYS} days`), 'the undo window is not stated')

  // Play's reviewer is signed out, so nothing on it may require a session: no
  // token read, no client-only data fetch.
  const src = read('app/delete-account/page.tsx')
  assert.doesNotMatch(src, /'use client'/, 'the public deletion page must render without JavaScript')
  assert.doesNotMatch(src, /getToken|AuthGuard/, 'the public deletion page must not need a session')
})

test('/delete-account confirms a request that has just been made', async () => {
  const html = renderToStaticMarkup(
    await DeleteAccountPage({ searchParams: Promise.resolve({ requested: '1' }) }),
  )
  assert.match(html, /deletion-requested/, 'a member who just deleted their account is told nothing')
})

test('the public deletion URL is linked from surfaces with no session', () => {
  // Being in LEGAL_LINKS is what puts it in the landing footer and on every
  // legal page — i.e. what makes it findable by someone filling in the Data
  // safety form, who has never signed in.
  assert.ok(
    LEGAL_LINKS.some((l) => l.href === '/delete-account'),
    '/delete-account is not in LEGAL_LINKS, so it is on no public surface',
  )

  const landing = read('components/landing/BecomeLanding.tsx')
  const footer = /<footer className={styles\.footer}>[\s\S]*?<\/footer>/.exec(landing)
  assert.ok(footer, 'the landing page has no footer any more')
  assert.match(footer[0], /href="\/delete-account"/, 'the landing footer does not link the deletion page')
})
