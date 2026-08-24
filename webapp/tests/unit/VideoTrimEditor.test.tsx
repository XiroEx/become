// Run with: npx tsx --test tests/unit/VideoTrimEditor.test.tsx
//
// Smoke coverage for the collapsed header state (the only state
// renderToStaticMarkup can exercise, since the panel opens via client-side
// click state). Confirms the badge logic — the one piece of VideoTrimEditor
// untouched by the filmstrip rework — still reflects the saved trim, and
// that swapping the panel internals for VideoFilmstripTrimmer didn't break
// the component's ability to render at all.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderToStaticMarkup } from 'react-dom/server'
import VideoTrimEditor from '../../components/admin/VideoTrimEditor'

test('no video URL renders nothing', () => {
  const html = renderToStaticMarkup(<VideoTrimEditor slug="bench-press" videoUrl="" />)
  assert.equal(html, '')
})

test('no stored trim shows the "Full" badge, collapsed', () => {
  const html = renderToStaticMarkup(
    <VideoTrimEditor slug="bench-press" videoUrl="/videos/bench.mp4" />,
  )
  assert.match(html, /Full</)
  // Panel starts closed — none of the new filmstrip/preview UI should render yet.
  assert.doesNotMatch(html, /role="slider"/)
})

test('a stored trim shows its timecodes in the collapsed badge', () => {
  const html = renderToStaticMarkup(
    <VideoTrimEditor
      slug="bench-press"
      videoUrl="/videos/bench.mp4"
      videoTrim={{ start: 2, end: 8 }}
    />,
  )
  assert.match(html, /0:02\.0/)
  assert.match(html, /0:08\.0/)
})
