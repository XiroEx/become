// Run with: npm run test:file tests/unit/quickSession/hubLinks.test.ts
//
// Locks the contract between "Build a custom session" (BUILD_SESSION_HREF)
// and the hub page that reads its ?build=1 flag (shouldAutoOpenBuilder) — the
// two silently drift apart if only one side changes.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { SESSIONS_HUB_HREF, BUILD_SESSION_HREF, shouldAutoOpenBuilder } from '../../../lib/quickSession/hubLinks'

test('BUILD_SESSION_HREF points at the Sessions tab with the auto-open flag', () => {
  assert.equal(BUILD_SESSION_HREF, '/dashboard/workout/hub?tab=sessions&build=1')
})

test('shouldAutoOpenBuilder is true for a URL built from BUILD_SESSION_HREF', () => {
  const url = new URL(`https://example.com${BUILD_SESSION_HREF}`)
  assert.equal(shouldAutoOpenBuilder(url.searchParams), true)
})

test('shouldAutoOpenBuilder is false for the plain Sessions tab link', () => {
  const url = new URL(`https://example.com${SESSIONS_HUB_HREF}`)
  assert.equal(shouldAutoOpenBuilder(url.searchParams), false)
})

test('shouldAutoOpenBuilder ignores unrelated or falsy build values', () => {
  assert.equal(shouldAutoOpenBuilder(new URL('https://example.com/dashboard/workout/hub?tab=sessions&build=0').searchParams), false)
  assert.equal(shouldAutoOpenBuilder(new URL('https://example.com/dashboard/workout/hub?tab=sessions').searchParams), false)
})
