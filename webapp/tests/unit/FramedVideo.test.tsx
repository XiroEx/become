// Run with: npm run test:file tests/unit/FramedVideo.test.tsx
//
// Workout demo videos must never play with sound. Locks in that every
// FramedVideo render carries the native `muted` attribute regardless of
// surface or props, and that there's no toggle left that could turn it off.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderToStaticMarkup } from 'react-dom/server'
import FramedVideo from '../../components/FramedVideo'

test('renders muted for a plain form video', () => {
  const html = renderToStaticMarkup(
    <FramedVideo src="/videos/bench-press.mp4" surface="form" />,
  )
  assert.match(html, /<video[^>]*\bmuted\b/)
})

test('stays muted with the fullscreen toggle enabled', () => {
  const html = renderToStaticMarkup(
    <FramedVideo src="/videos/bench-press.mp4" surface="form" showFullscreenToggle />,
  )
  assert.match(html, /<video[^>]*\bmuted\b/)
})

test('renders muted on the live surface too', () => {
  const html = renderToStaticMarkup(
    <FramedVideo src="/videos/bench-press.mp4" surface="live" />,
  )
  assert.match(html, /<video[^>]*\bmuted\b/)
})

test('no mute/unmute control is rendered', () => {
  const html = renderToStaticMarkup(
    <FramedVideo src="/videos/bench-press.mp4" surface="form" showFullscreenToggle />,
  )
  assert.doesNotMatch(html, /Unmute video/)
  assert.doesNotMatch(html, /Mute video/)
})

test('unsupported src (no direct video extension) renders nothing', () => {
  const html = renderToStaticMarkup(
    <FramedVideo src="https://youtube.com/watch?v=abc" surface="form" />,
  )
  assert.equal(html, '')
})
