// Run with: npm run test:file tests/unit/push/getAppBannerWiring.test.ts
//
// NP-205 acceptance (id: e015cb30): "the mobile web shows a dismissible prompt
// linking to the right store, and the native app never shows it." Pure logic
// is pinned in getAppBanner.test.ts; this file pins the WIRING — that the
// banner is actually mounted on the web, that the native-app suppression is
// actually connected end to end, and that nothing resembling it exists in the
// native codebase at all.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.join(__dirname, '../../..')
const REPO = path.join(ROOT, '..')
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8')

function listFiles(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === '.expo') continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) listFiles(full, out)
    else out.push(full)
  }
  return out
}

test('the Android banner is mounted on every protected web route', () => {
  const layout = read('app/dashboard/layout.tsx')
  assert.match(layout, /import GetAppBanner from '\.\.\/\.\.\/components\/GetAppBanner'/, 'not imported')
  assert.match(layout, /<GetAppBanner \/>/, 'imported but never rendered')
})

test('the banner never renders inside the native app — openedByNativeApp refuses it', () => {
  const component = read('components/GetAppBanner.tsx')
  assert.match(component, /shouldShowGetAppBanner/, 'does not use the pure decision function')
  assert.match(component, /NATIVE_BROWSER_COOKIE/, 'does not check the native-app marker')
})

test('the native app marks every URL it opens, and the web turns that into a cookie', () => {
  const opener = fs.readFileSync(path.join(REPO, 'expo/lib/web/openWebSignedIn.ts'), 'utf8')
  assert.match(opener, /NATIVE_BROWSER_QUERY_PARAM = "app"/, 'the app no longer marks its URLs')
  assert.match(opener, /\$\{NATIVE_BROWSER_QUERY_PARAM\}=1/, 'the marker is declared but never appended')

  const middleware = read('middleware.ts')
  assert.match(middleware, /NATIVE_BROWSER_QUERY_PARAM/, 'middleware no longer reads the marker')
  assert.match(middleware, /response\.cookies\.set\(NATIVE_BROWSER_COOKIE/, 'middleware no longer sets the cookie')
})

test('iOS gets Safari\'s own smart banner, suppressed the same way, never a static tag', () => {
  const layout = read('app/layout.tsx')
  assert.doesNotMatch(
    layout,
    /export const metadata/,
    'a static `metadata` export cannot see the native-app cookie — must be generateMetadata',
  )
  assert.match(layout, /export async function generateMetadata/, 'no dynamic metadata function')
  assert.match(layout, /apple-itunes-app/, 'the smart-banner meta tag is gone')
  assert.match(layout, /openedByNativeApp/, 'the meta tag is no longer suppressed for the native app')
  assert.match(layout, /extractAppleAppId/, 'no longer derives the id from config.app.ios.storeUrl')
})

test('nothing resembling the web-only prompt exists anywhere in the native codebase', () => {
  const expoRoot = path.join(REPO, 'expo')
  const offenders: string[] = []
  for (const file of listFiles(expoRoot)) {
    if (!/\.(ts|tsx|js|jsx)$/.test(file)) continue
    const src = fs.readFileSync(file, 'utf8')
    if (/GetAppBanner|apple-itunes-app/.test(src)) offenders.push(path.relative(REPO, file))
  }
  assert.deepEqual(offenders, [], `the native app must never reference the web-only prompt: ${offenders.join(', ')}`)
})
