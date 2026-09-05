// Run with: npx tsx --test tests/unit/entitlements/generatorFallback.test.ts
//
// Two ways a paywall stops being a paywall and starts being a wall, both of
// them client-side and both of them invisible to tsc.
//
// 1. A refused AI generation must DEGRADE, not dead-end. /api/generate/session
//    and /api/generate/program are deliberately unmetered — they are the
//    deterministic fallback every AI route degrades to, and
//    tests/unit/allowance/inventory.test.ts pins them that way — so a member
//    who has spent their 3 weekly AI generations can still get a session by
//    falling through to them. Both modals used to `return` on a gate, on the
//    stated but false belief that the deterministic route "shares the same
//    allowance and would refuse it again". It does not, and with billing
//    unconfigured that return was a dead end with no way out of it.
//
// 2. Deleting a row frees an inventory slot server-side immediately, but the
//    entitlements snapshot is cached for 60s. Without an explicit refresh the
//    lock outlives the delete that cleared it — and deleting is the only way
//    back under an inventory cap, so the one action that helps looks inert.
//
// Source scans: these modules are React components wired to fetch and
// localStorage, and the property under test is structural.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.join(__dirname, '../../..')
const readSource = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8')

/** The body of the `if (r.gate) {` branch — the whole decision lives in it. */
function gateBranch(src: string): string {
  const at = src.indexOf('if (r.gate) {')
  assert.ok(at > 0, 'expected an `if (r.gate) {` branch handling the AI refusal')
  let depth = 0
  for (let i = src.indexOf('{', at); i < src.length; i++) {
    if (src[i] === '{') depth++
    else if (src[i] === '}' && --depth === 0) return src.slice(at, i + 1)
  }
  assert.fail('unbalanced braces in the gate branch')
}

const MODALS = ['components/GenerateModal.tsx', 'components/QuickSessionModal.tsx']

// ─── 1. A gate degrades to the free generator ────────────────────────────────

for (const rel of MODALS) {
  test(`${rel} falls through to the deterministic generator on a gate`, () => {
    const src = readSource(rel)

    // Every gate branch in the file — GenerateModal has one per tab.
    let rest = src
    let branches = 0
    while (rest.includes('if (r.gate) {')) {
      const branch = gateBranch(rest)
      branches++

      assert.doesNotMatch(
        branch,
        /\breturn\b/,
        `${rel}: a spent AI allowance must not return — the unmetered ` +
          '/api/generate route below is the free path out of the cap',
      )
      // The upgrade sheet is modal. Raising it here would cover a session the
      // member DID get, which reads as a failure rather than an upsell.
      assert.doesNotMatch(
        branch,
        /setGate\(/,
        `${rel}: an AI refusal that still produced a result must not raise the ` +
          'upgrade sheet over it',
      )
      assert.match(
        branch,
        /setFallbackNote\(/,
        `${rel}: the refusal must still be surfaced, as a non-blocking note`,
      )

      rest = rest.slice(rest.indexOf(branch) + branch.length)
    }
    assert.ok(branches > 0, `${rel}: no AI gate branch found`)

    // And the thing it falls through TO is really the unmetered route.
    assert.match(src, /['"`]\/api\/generate\/(session|program)['"`]/, `${rel}: no deterministic fallback call`)
  })

  test(`${rel} carries no claim that the free generator shares the allowance`, () => {
    // The comment that justified the dead end. It was wrong, and a future
    // reader restoring the `return` from it is the regression this guards.
    assert.doesNotMatch(
      readSource(rel),
      /shares the same allowance/,
      `${rel}: /api/generate/* is unmetered — it does not share the AI allowance`,
    )
  })
}

// ─── 2. A delete refreshes the snapshot it just invalidated ──────────────────

test('the hook exposes a fetch-free way to mark the snapshot stale', () => {
  const src = readSource('hooks/useEntitlements.ts')
  assert.match(
    src,
    /export function invalidateEntitlements\(\)/,
    'delete handlers on pages that render no gate need a refresh that does not fetch',
  )
  const at = src.indexOf('export function invalidateEntitlements()')
  const body = src.slice(at, at + 200)
  assert.match(body, /fetchedAt = 0/, 'invalidating must expire the TTL')
  // It must NOT drop the snapshot: the client fails open, and clearing it would
  // flash a loading state (or a lock) on the next gated surface.
  assert.doesNotMatch(body, /snapshot = null/, 'invalidating must not clear the last-known snapshot')
})

const DELETE_SURFACES: { rel: string; anchor: string; call: RegExp }[] = [
  {
    rel: 'app/dashboard/workout/library/ExerciseLibraryClient.tsx',
    anchor: 'handleDelete',
    call: /refreshEntitlements\(\)/,
  },
  {
    rel: 'app/dashboard/programs/mine/MyProgramsClient.tsx',
    anchor: 'handleDelete',
    call: /refreshEntitlements\(\)/,
  },
  // No hook on this page, so it invalidates rather than refetching — it must
  // not start rendering gates as a side effect of deleting a meal.
  {
    rel: 'app/dashboard/meals/[id]/page.tsx',
    anchor: 'handleDelete',
    call: /invalidateEntitlements\(\)/,
  },
]

for (const { rel, anchor, call } of DELETE_SURFACES) {
  test(`${rel} refreshes entitlements after a delete`, () => {
    const src = readSource(rel)
    const at = src.indexOf(anchor)
    assert.ok(at > 0, `${rel}: no ${anchor}`)
    assert.match(
      src.slice(at, at + 1400),
      call,
      `${rel}: deleting frees a slot immediately — the snapshot must not keep the lock`,
    )
  })
}

test('the meal pages take no gating UI along with the invalidate', () => {
  // invalidateEntitlements is fetch-free precisely so a page with no plan UI
  // can call it. Importing the hook itself, or the upgrade sheet, would make a
  // delete handler the reason a gate appears on a page that had none.
  for (const rel of ['app/dashboard/meals/page.tsx', 'app/dashboard/meals/[id]/page.tsx']) {
    const src = readSource(rel)
    // The CALL, not the module path — `invalidateEntitlements` is imported
    // from the same file and that import is the whole point.
    assert.doesNotMatch(src, /useEntitlements\(/, `${rel} must not subscribe to entitlements`)
    assert.doesNotMatch(src, /UpgradeSheet/, `${rel} must not render the upgrade sheet`)
  }
})
