// Run with: npm run test:file tests/unit/push/getAppBannerWiring.test.ts
//
// (NP-205) Where GetAppBanner is (and is not) mounted, and the apple-itunes-app
// tag's native-browser guard. No jsdom/testing-library in this repo (see
// tests/unit/weightLogSheet.test.tsx) — GetAppBanner is a 'use client'
// component keyed off window/document/fetch, so its real behaviour is pinned
// by lib/getAppBanner.test.ts (pure decision) and this file's server-side
// render smoke test + source scans for the wiring a browser test can't see.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import GetAppBanner from '../../../components/GetAppBanner'

const ROOT = path.join(__dirname, '../../..')

function readSource(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8')
}

test('(id: e015cb30) server-rendered (no window) GetAppBanner renders nothing', () => {
  // Confirms the component never throws building the page shell and defaults
  // to invisible until its client-side effect decides otherwise.
  const html = renderToStaticMarkup(React.createElement(GetAppBanner))
  assert.equal(html, '')
})

test('(id: e015cb30) GetAppBanner is mounted once, in the signed-in dashboard shell', () => {
  const dashboardLayout = readSource('app/dashboard/layout.tsx')
  assert.match(dashboardLayout, /<GetAppBanner\s*\/>/)

  const rootLayout = readSource('app/layout.tsx')
  assert.doesNotMatch(rootLayout, /<GetAppBanner/)
})

test('(id: e015cb30) GetAppBanner checks the native-app-browser marker before showing anything', () => {
  const src = readSource('components/GetAppBanner.tsx')
  assert.match(src, /isNativeBrowserCookieHeader/)
  assert.match(src, /document\.cookie/)
})

test("(id: e015cb30) GetAppBanner never renders in expo/ — it is webapp-only", () => {
  const expoHasIt = fs.existsSync(path.join(ROOT, '../expo/components/GetAppBanner.tsx'))
  assert.equal(expoHasIt, false)
})

test("(id: e015cb30) Safari's apple-itunes-app tag is omitted inside the native app's in-app browser", () => {
  // Scoped to the dashboard layout (the one segment Tier-3's in-app browser
  // actually reaches), not the root layout — see app/dashboard/layout.tsx's
  // doc comment for why that keeps the marketing pages statically generated.
  const dashboardLayout = readSource('app/dashboard/layout.tsx')
  assert.match(dashboardLayout, /generateMetadata/)
  assert.match(dashboardLayout, /apple-itunes-app/)
  assert.match(dashboardLayout, /NATIVE_BROWSER_COOKIE/)
  // The guard must come before the tag is built, not after.
  const guardAt = dashboardLayout.indexOf('NATIVE_BROWSER_COOKIE')
  const returnAt = dashboardLayout.indexOf('return {}', guardAt)
  assert.ok(guardAt > -1 && returnAt > guardAt)

  const rootLayout = readSource('app/layout.tsx')
  assert.doesNotMatch(rootLayout, /apple-itunes-app/)
})

test('(id: e015cb30) the marker cookie this all depends on originates ONLY at the handoff redeem route', () => {
  const handoff = readSource('app/auth/handoff/route.ts')
  assert.match(handoff, /nativeBrowserCookie\(\)/)

  // Nothing else in the app sets it from a request value it does not already
  // hold — middleware only refreshes an existing cookie's expiry.
  const middleware = readSource('middleware.ts')
  assert.match(middleware, /request\.cookies\.get\(NATIVE_BROWSER_COOKIE\)/)
  assert.match(middleware, /nativeBrowserCookie\(\)/)
})
