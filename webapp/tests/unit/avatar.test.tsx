// Run with: npm run test:file tests/unit/avatar.test.tsx
//
// An equipped photo is a POINTER at a blob-store object, and the pointer
// outlives the object: avatars uploaded before ~2026-06-21 are in neither
// MinIO today, so `/api/blob/avatars/<id>/<rand>.jpg` answers 404 and every
// surface that draws an avatar — TopNav, the profile card, the icon picker's
// preview, the picker's own "custom" slot — rendered the browser's
// broken-image box at once.
//
// These pin the two halves of the fix: the pure rule that decides what to
// draw, and the component honouring it.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import Avatar from '../../components/Avatar'
import {
  avatarImageSrc,
  canOptimizeAvatarSrc,
  equippedCustomAvatar,
  CUSTOM_ICON,
} from '../../lib/avatarSource'

const BLOB = '/api/blob/avatars/693225e3d3921c2cb9e2c0d8/gg55hr30mpynbb9d.jpg'
const GOOGLE = 'https://lh3.googleusercontent.com/a/ACg8ocJ=s96-c'

test('only an equipped custom icon with a URL produces an image src', () => {
  assert.equal(avatarImageSrc(CUSTOM_ICON, BLOB), BLOB)
  // A preset never draws the stored URL, even when one is present — a Google
  // avatar is backfilled onto rows whose equipped icon is a preset.
  assert.equal(avatarImageSrc('flame', GOOGLE), null)
  assert.equal(avatarImageSrc(CUSTOM_ICON, null), null)
  assert.equal(avatarImageSrc(CUSTOM_ICON, undefined), null)
  assert.equal(avatarImageSrc(CUSTOM_ICON, '   '), null)
  assert.equal(avatarImageSrc(null, null), null)
})

test('equippedCustomAvatar separates "no photo chosen" from "photo is missing"', () => {
  assert.equal(equippedCustomAvatar(CUSTOM_ICON), true)
  assert.equal(equippedCustomAvatar('flame'), false)
  assert.equal(equippedCustomAvatar(null), false)
  assert.equal(equippedCustomAvatar(undefined), false)
})

test('only a same-origin path may go through the image optimizer', () => {
  // next/image THROWS on a remote host that is not in images.remotePatterns —
  // an exception, not an onError, so no fallback below it could ever run.
  // `lh3.googleusercontent.com` is not configured and reaches rows through
  // authBridge and PATCH /api/profile, so it must render unoptimized.
  assert.equal(canOptimizeAvatarSrc(BLOB), true)
  assert.equal(canOptimizeAvatarSrc(GOOGLE), false)
  assert.equal(canOptimizeAvatarSrc('http://example.com/a.jpg'), false)
  // Protocol-relative is remote too, however much it looks like a path.
  assert.equal(canOptimizeAvatarSrc('//evil.example/a.jpg'), false)
})

test('an equipped photo renders as an image', () => {
  const html = renderToStaticMarkup(<Avatar icon="custom" imageUrl={BLOB} size={96} />)
  assert.match(html, /<img/)
  assert.match(html, /gg55hr30mpynbb9d\.jpg/)
})

test('a remote avatar renders its URL verbatim, not through /_next/image', () => {
  const html = renderToStaticMarkup(<Avatar icon="custom" imageUrl={GOOGLE} size={32} />)
  assert.match(html, /<img/)
  assert.doesNotMatch(html, /_next\/image/)
  assert.match(html, /lh3\.googleusercontent\.com/)
})

test('a preset renders a glyph and never an image', () => {
  const html = renderToStaticMarkup(<Avatar icon="flame" size={48} />)
  assert.doesNotMatch(html, /<img/)
  assert.match(html, /<svg/)
})

test('custom with no URL falls back to a glyph instead of a broken image', () => {
  // This is the state a repaired row passes through, and the state any row
  // reaches the moment its stored URL is cleared.
  const html = renderToStaticMarkup(<Avatar icon="custom" imageUrl={null} size={96} />)
  assert.doesNotMatch(html, /<img/)
  assert.match(html, /<svg/)
})

test('the missing-photo glyph is neutral, not the first preset', () => {
  // presetIcon() falls back to PRESET_ICONS[0] (flame, orange→red). A member
  // whose upload went missing must not be shown an icon they never picked.
  const missing = renderToStaticMarkup(<Avatar icon="custom" imageUrl={null} size={48} />)
  const flame = renderToStaticMarkup(<Avatar icon="flame" size={48} />)
  assert.notEqual(missing, flame)
  assert.doesNotMatch(missing, /from-orange-500/)
  assert.match(missing, /from-zinc-400/)
})

test('the image is wired to fall back when it fails to load', () => {
  // A server render drops event handlers, and the fallback only fires in a
  // browser — so the wiring is asserted on the source. Without `onError` a
  // dead object stays a broken-image box forever and every branch above is
  // unreachable in the app, which is exactly the bug this file exists for.
  const src = readFileSync(new URL('../../components/Avatar.tsx', import.meta.url), 'utf8')
  assert.match(src, /onError=\{\(\) => setBrokenSrc\(src\)\}/)
  assert.match(src, /src !== brokenSrc/)
})
