// Run with: npx tsx --test tests/unit/VideoFilmstripTrimmer.test.tsx
//
// Rendered via JSX + renderToStaticMarkup, same pattern as MacroBar.test.tsx.
// Frame extraction (canvas/video) only happens inside a useEffect, which
// renderToStaticMarkup never runs — so this checks the parts that render
// synchronously: handle positions, aria state for the "drag from either
// side" interaction, and the empty-frames skeleton before extraction lands.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderToStaticMarkup } from 'react-dom/server'
import VideoFilmstripTrimmer from '../../components/admin/VideoFilmstripTrimmer'

test('handles sit at the percentage positions matching start/end against duration', () => {
  const html = renderToStaticMarkup(
    <VideoFilmstripTrimmer
      videoUrl="/videos/a.mp4"
      duration={20}
      start={5}
      end={15}
      minDuration={0.5}
      onChange={() => {}}
    />,
  )
  // start=5/20 -> 25%, end=15/20 -> 75%.
  assert.match(html, /left:calc\(25%\s*-\s*11px\)/)
  assert.match(html, /left:calc\(75%\s*-\s*11px\)/)
})

test('a null end is treated as the full duration for handle placement', () => {
  const html = renderToStaticMarkup(
    <VideoFilmstripTrimmer
      videoUrl="/videos/a.mp4"
      duration={20}
      start={0}
      end={null}
      minDuration={0.5}
      onChange={() => {}}
    />,
  )
  assert.match(html, /left:calc\(100%\s*-\s*11px\)/)
})

test('both handles expose slider semantics for assistive tech and keyboard nudging', () => {
  const html = renderToStaticMarkup(
    <VideoFilmstripTrimmer
      videoUrl="/videos/a.mp4"
      duration={20}
      start={2}
      end={18}
      minDuration={0.5}
      onChange={() => {}}
    />,
  )
  assert.match(html, /role="slider"/)
  assert.match(html, /aria-label="Trim start"/)
  assert.match(html, /aria-label="Trim end"/)
  assert.match(html, /aria-valuenow="2"/)
  assert.match(html, /aria-valuenow="18"/)
})

test('before frame extraction lands, the strip renders placeholder tiles rather than nothing', () => {
  const html = renderToStaticMarkup(
    <VideoFilmstripTrimmer
      videoUrl="/videos/a.mp4"
      duration={20}
      start={0}
      end={null}
      minDuration={0.5}
      onChange={() => {}}
    />,
  )
  // renderToStaticMarkup never runs the extraction effect, so `frames` is
  // always empty here — this is the pre-extraction / no-JS state.
  assert.match(html, /animate-pulse/)
  assert.doesNotMatch(html, /<img/)
})

test('placeholder tiles shrink to fit the strip instead of overflowing it', () => {
  // Regression: an <img> flex child defaults to min-width:auto, so without an
  // explicit override the tiles refuse to shrink below their natural pixel
  // width and the strip's later frames get clipped off the right edge on a
  // narrow (mobile) viewport instead of evenly filling it.
  const html = renderToStaticMarkup(
    <VideoFilmstripTrimmer
      videoUrl="/videos/a.mp4"
      duration={20}
      start={0}
      end={null}
      minDuration={0.5}
      onChange={() => {}}
    />,
  )
  assert.match(html, /class="[^"]*min-w-0[^"]*flex-1[^"]*"/)
})

test('no frame-unavailable note when nothing has failed yet', () => {
  const html = renderToStaticMarkup(
    <VideoFilmstripTrimmer
      videoUrl="/videos/a.mp4"
      duration={20}
      start={0}
      end={null}
      minDuration={0.5}
      onChange={() => {}}
    />,
  )
  assert.doesNotMatch(html, /aren.t available/)
})
