// Run with: npm run test:file tests/unit/chromeStacking.test.ts
//
// The profile menu hangs out of TopNav's header and into the page. An
// `absolute` child can never outrank the stacking context it lives in, so the
// menu's paint order is decided entirely by the header's own z-index. While
// that was z-10, any in-page `sticky top-0` outranked it and painted over the
// open menu: on the workout Track view (sticky z-20) everything above "Food
// reports" — the member's name, Profile, Settings — was hidden behind the
// progress header, which is what the bug report screenshot showed.
//
// TopNav and BottomNav are both router-dependent (usePathname/useRouter) and
// can't be rendered by react-dom/server outside Next's own render, so this is
// a source scan for the same reason animationSweepChrome.test.ts is one.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.join(__dirname, '../..')

// The app's stacking tiers, as documented in BottomNav.tsx:
//   page content and its sticky headers   z-0 .. z-30
//   app chrome (TopNav, BottomNav)        z-40
//   overlays, sheets, modals              z-50 and up
const CHROME_Z = 40

function readSource(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8')
}

function tsxFiles(dir: string): string[] {
  const abs = path.join(ROOT, dir)
  if (!fs.existsSync(abs)) return []
  const out: string[] = []
  for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue
    const rel = path.join(dir, entry.name)
    if (entry.isDirectory()) out.push(...tsxFiles(rel))
    else if (entry.name.endsWith('.tsx')) out.push(rel)
  }
  return out
}

// Pull every string literal that looks like a class list, so both
// className="..." and className={`...`} are covered.
function classStrings(src: string): string[] {
  const out: string[] = []
  const re = /(?:className|class)\s*=\s*(?:\{?\s*)?[`"']([^`"']*)[`"']/g
  let m: RegExpExecArray | null
  while ((m = re.exec(src)) !== null) out.push(m[1])
  return out
}

// z-40 and z-[60] are both real Tailwind; -z-10 is a negative tier and never
// competes with chrome, so it is ignored.
function zIndexes(classes: string): number[] {
  const out: number[] = []
  const re = /(?:^|\s)z-(?:\[(\d+)\]|(\d+))(?:\s|$)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(classes)) !== null) out.push(Number(m[1] ?? m[2]))
  return out
}

function hasClass(classes: string, name: string): boolean {
  return new RegExp(`(?:^|\\s)${name}(?:\\s|$)`).test(classes)
}

test('TopNav: the header sits in the app-chrome tier, so the profile menu clears page content', () => {
  const src = readSource('components/TopNav.tsx')
  const header = classStrings(src).find((c) => hasClass(c, 'relative') && hasClass(c, 'shrink-0') && hasClass(c, 'border-b'))
  assert.ok(header, 'could not find the TopNav header className')
  assert.deepEqual(zIndexes(header!), [CHROME_Z], `TopNav header must be z-${CHROME_Z}, got: ${header}`)
})

test('TopNav and BottomNav claim the same chrome tier', () => {
  const bottom = classStrings(readSource('components/BottomNav.tsx')).find((c) => hasClass(c, 'fixed') && hasClass(c, 'inset-x-0'))
  assert.ok(bottom, 'could not find the BottomNav pill className')
  assert.deepEqual(zIndexes(bottom!), [CHROME_Z], `BottomNav must be z-${CHROME_Z}, got: ${bottom}`)
})

test('the workout Track header no longer outranks the app chrome', () => {
  // The exact surface from the bug report: /dashboard/workout/[id]/workout, Track view.
  const src = readSource('app/dashboard/workout/[programId]/workout/WorkoutFormClient.tsx')
  const sticky = classStrings(src).filter((c) => hasClass(c, 'sticky'))
  assert.ok(sticky.length > 0, 'expected a sticky progress header in WorkoutFormClient')
  for (const c of sticky) {
    for (const z of zIndexes(c)) {
      assert.ok(z < CHROME_Z, `Track sticky header must stay under z-${CHROME_Z}, got z-${z}: ${c}`)
    }
  }
})

test('no page-level sticky anywhere outranks the app chrome', () => {
  // The guard that matters: a new `sticky top-0 z-40` header added later would
  // silently clip the profile menu again, on whatever page it was added to.
  const offenders: string[] = []
  for (const rel of [...tsxFiles('app'), ...tsxFiles('components')]) {
    for (const c of classStrings(readSource(rel))) {
      if (!hasClass(c, 'sticky')) continue
      for (const z of zIndexes(c)) {
        if (z >= CHROME_Z) offenders.push(`${rel}: z-${z} in "${c}"`)
      }
    }
  }
  assert.deepEqual(offenders, [], `sticky elements must stay under z-${CHROME_Z}:\n${offenders.join('\n')}`)
})
