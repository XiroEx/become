// Run with: npm run test:file tests/unit/FramedVideo.test.tsx
//
// Workout demo videos must never play with sound. Locks in that every
// FramedVideo render carries the native `muted` attribute regardless of
// surface or props, and that there's no toggle left that could turn it off.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderToStaticMarkup } from 'react-dom/server'
import FramedVideo, { mimeForVideoUrl } from '../../components/FramedVideo'

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

// ─── <source type> MIME mapping ──────────────────────────────────────────────
//
// Most exercise demos in webapp/public/exercises/ are `.mov` (H.264 in a
// QuickTime container) and the server serves them as `Content-Type: video/mp4`.
// Advertising `type="video/quicktime"` on the one <source> we render made
// Chromium and Firefox skip it outright (`canPlayType('video/quicktime') === ''`)
// and the demo showed as a black panel on desktop/Android Chrome while playing
// on iOS/Safari. These pin the mapping so that cannot come back.

test('a .mov url is advertised as video/mp4, never video/quicktime', () => {
  assert.equal(mimeForVideoUrl('/exercises/back-squat.mov'), 'video/mp4')
})

test('an uppercase .MOV url maps the same way', () => {
  assert.equal(mimeForVideoUrl('/exercises/BACK-SQUAT.MOV'), 'video/mp4')
})

test('a .mp4 url maps to video/mp4', () => {
  assert.equal(mimeForVideoUrl('/exercises/bench-press.mp4'), 'video/mp4')
})

test('a .webm url maps to video/webm', () => {
  assert.equal(mimeForVideoUrl('/exercises/cable-row.webm'), 'video/webm')
})

test('a .mkv url maps to video/x-matroska', () => {
  assert.equal(mimeForVideoUrl('/exercises/deadlift.mkv'), 'video/x-matroska')
})

test('a query string does not defeat the extension match', () => {
  // Blob/CDN urls arrive with cache-busting and signature params.
  assert.equal(mimeForVideoUrl('/exercises/back-squat.mov?v=3'), 'video/mp4')
  assert.equal(
    mimeForVideoUrl('https://cdn.example.com/x/clip.webm?token=abc&exp=123'),
    'video/webm',
  )
  assert.equal(mimeForVideoUrl('https://cdn.example.com/x/clip.mkv?token=abc'), 'video/x-matroska')
})

test('an unknown extension falls back to video/mp4', () => {
  assert.equal(mimeForVideoUrl('/exercises/hip-thrust.m4v'), 'video/mp4')
})

test('a .mov source renders type="video/mp4" in the markup', () => {
  const html = renderToStaticMarkup(
    <FramedVideo src="/exercises/back-squat.mov" surface="live" />,
  )
  assert.match(html, /<source[^>]*type="video\/mp4"/)
  assert.doesNotMatch(html, /quicktime/)
})
