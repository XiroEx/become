// Run with: npx tsx --test tests/unit/motionProvider.test.tsx
//
// Root-level Framer Motion defaults (see components/MotionProvider.tsx):
// reduced-motion opt-out for every motion.* component in the app, plus a
// fallback easing so components that don't set their own transition still
// land on the app's shared curve. This just covers that the provider is a
// transparent passthrough — it must never swallow or wrap its children in
// extra DOM.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { renderToStaticMarkup } from 'react-dom/server'
import MotionProvider from '../../components/MotionProvider'

test('renders children unchanged, with no extra wrapper element', () => {
  const html = renderToStaticMarkup(
    <MotionProvider>
      <div id="app-root">hello</div>
    </MotionProvider>,
  )
  assert.equal(html, '<div id="app-root">hello</div>')
})
