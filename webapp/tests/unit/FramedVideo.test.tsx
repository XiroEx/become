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

// ─── Trim reaches the element ────────────────────────────────────────────────
//
// Trimming is non-destructive: the file is whole and the player seeks/loops
// within the stored window. The first visible consequence is that native
// `loop` is turned OFF — a trimmed video is looped by hand from the
// `timeupdate` handler, because the element would otherwise run to the real
// end of the file. So the presence of `loop` in the markup is a direct read on
// whether a trim was honoured, which is what the program preview was missing.

test('an untrimmed video loops natively', () => {
  const html = renderToStaticMarkup(
    <FramedVideo src="/videos/leg-press.mp4" surface="form" />,
  )
  assert.match(html, /<video[^>]*\bloop\b/)
})

test('a trimmed video does not loop natively — the window is looped by hand', () => {
  const html = renderToStaticMarkup(
    <FramedVideo
      src="/videos/leg-press.mp4"
      surface="form"
      videoTrim={{ start: 10.6, end: 41.1 }}
    />,
  )
  assert.doesNotMatch(html, /<video[^>]*\bloop\b/)
})

test('a start-only trim still counts as trimmed', () => {
  const html = renderToStaticMarkup(
    <FramedVideo src="/videos/leg-press.mp4" surface="form" videoTrim={{ start: 3 }} />,
  )
  assert.doesNotMatch(html, /<video[^>]*\bloop\b/)
})

test('a null trim is the same as no trim', () => {
  // What a swapped-in exercise passes before its own video resolves.
  const html = renderToStaticMarkup(
    <FramedVideo src="/videos/leg-press.mp4" surface="form" videoTrim={null} />,
  )
  assert.match(html, /<video[^>]*\bloop\b/)
})
