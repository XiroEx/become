// Run with: npx tsx --test tests/unit/animationSweepChrome.test.ts
//
// BottomNav and TopNav both call next/navigation hooks (usePathname/useRouter)
// that require an App Router context react-dom/server can't provide outside
// Next's own render — see tests/unit/weightLogSheet.test.tsx and friends for
// the same constraint on router-dependent components. That leaves a source
// scan as the safe way to pin the animation wiring these two got in the
// sweep: BottomNav's active-tab pill now slides via a shared layoutId instead
// of an instant class swap, and TopNav's profile dropdown now mounts/unmounts
// through AnimatePresence instead of a bare `isOpen &&`.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.join(__dirname, '../..')
function readSource(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8')
}

test('BottomNav: active tab renders a layoutId-tracked sliding pill', () => {
  const src = readSource('components/BottomNav.tsx')
  assert.match(src, /layoutId="bottom-nav-active-pill"/)
  // The pill only renders for the active tab, not unconditionally.
  assert.match(src, /\{active && \(\s*<motion\.span/)
})

test('BottomNav: tab icons get tap feedback', () => {
  const src = readSource('components/BottomNav.tsx')
  assert.match(src, /whileTap=\{\{ scale: 0\.85 \}\}/)
})

test('BottomNav: unread badge still renders for every tab, not just the active one', () => {
  const src = readSource('components/BottomNav.tsx')
  assert.match(src, /\(badge \?\? 0\) > 0/)
})

test('TopNav: profile dropdown animates in/out via AnimatePresence', () => {
  const src = readSource('components/TopNav.tsx')
  assert.match(src, /import \{ AnimatePresence, motion \} from 'framer-motion'/)
  const dropdownStart = src.indexOf('<AnimatePresence>')
  const dropdownEnd = src.indexOf('</AnimatePresence>')
  assert.ok(dropdownStart !== -1 && dropdownEnd !== -1 && dropdownEnd > dropdownStart)
  const body = src.slice(dropdownStart, dropdownEnd)
  assert.match(body, /isOpen &&/)
  assert.match(body, /exit=\{\{ opacity: 0/)
})
