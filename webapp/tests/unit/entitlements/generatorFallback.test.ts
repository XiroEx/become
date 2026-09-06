// Run with: npm run test:file tests/unit/entitlements/generatorFallback.test.ts
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
// 3. The note that reports the degrade is written BEFORE the deterministic
//    build it describes. That is fine while the build works and a lie the
//    moment it doesn't: a capped member whose /api/generate/session call 500s
//    saw an amber "Built you a standard session instead" above a red "Could
//    not generate a session", with no session anywhere. So every exit from the
//    deterministic block that is not a result must retract the note — which
//    also makes the note and the upgrade sheet mutually exclusive, since the
//    sheet is only ever raised from those same exits.
//
// 4. A delete whose response is never checked is the same class of lie: the
//    row leaves the list, the refresh returns the identical count, and the
//    member watches an item vanish while the lock stays put.
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

/** A `const <name> = ...` declaration, brace-matched to its closing `}`. */
function declBody(src: string, name: string): string {
  const at = src.indexOf(`const ${name} = `)
  assert.ok(at > 0, `expected a \`const ${name}\` declaration`)
  let depth = 0
  for (let i = src.indexOf('{', at); i < src.length; i++) {
    if (src[i] === '{') depth++
    else if (src[i] === '}' && --depth === 0) return src.slice(at, i + 1)
  }
  assert.fail(`unbalanced braces in ${name}`)
}

/** Everything from the unmetered /api/generate/* call to the end of `name`. */
function deterministicBlock(src: string, name: string): string {
  const body = declBody(src, name)
  const at = body.search(/['"`]\/api\/generate\//)
  assert.ok(at > 0, `${name}: no deterministic /api/generate call`)
  return body.slice(at)
}

const MODALS = ['components/GenerateModal.tsx', 'components/QuickSessionModal.tsx']

/** The generate entry points, per modal. */
const GENERATORS: Record<string, string[]> = {
  'components/GenerateModal.tsx': ['generateSession', 'generateProgram'],
  'components/QuickSessionModal.tsx': ['generateFor'],
}

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
  // DELETE /api/nutrition/foods/[id] is the one that frees a `custom-foods`
  // slot. The favorites delete on the meals page unbookmarks and frees nothing,
  // so this page is the only food surface that owes the invalidate — and, like
  // the meal page, it renders no gate, so it invalidates rather than refetches.
  {
    rel: 'app/dashboard/foods/[id]/page.tsx',
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

test('the meal and food pages take no gating UI along with the invalidate', () => {
  // invalidateEntitlements is fetch-free precisely so a page with no plan UI
  // can call it. Importing the hook itself, or the upgrade sheet, would make a
  // delete handler the reason a gate appears on a page that had none.
  for (const rel of [
    'app/dashboard/meals/page.tsx',
    'app/dashboard/meals/[id]/page.tsx',
    'app/dashboard/foods/[id]/page.tsx',
  ]) {
    const src = readSource(rel)
    // The CALL, not the module path — `invalidateEntitlements` is imported
    // from the same file and that import is the whole point.
    assert.doesNotMatch(src, /useEntitlements\(/, `${rel} must not subscribe to entitlements`)
    assert.doesNotMatch(src, /UpgradeSheet/, `${rel} must not render the upgrade sheet`)
  }
})

// ─── 3. The note may not outlive the fallback it describes ───────────────────

for (const rel of MODALS) {
  for (const name of GENERATORS[rel]) {
    test(`${rel}: ${name} retracts the note when the deterministic build fails`, () => {
      const block = deterministicBlock(readSource(rel), name)

      // Split on every error exit: each chunk BEFORE one has to contain the
      // retraction, so no path reaches an error banner with the note still up.
      const parts = block.split('setError(')
      assert.ok(parts.length > 1, `${rel}: ${name} has no error path to check`)
      for (let i = 0; i < parts.length - 1; i++) {
        assert.match(
          parts[i],
          /setFallbackNote\(null\)/,
          `${rel}: ${name} surfaces an error without retracting the note — the ` +
            'member is told a standard session was built and shown none',
        )
      }
    })

    test(`${rel}: ${name} clears a stale upgrade sheet on entry`, () => {
      const body = declBody(readSource(rel), name)
      const beforeFirstAwait = body.slice(0, body.indexOf('await'))
      assert.match(
        beforeFirstAwait,
        /setGate\(null\)/,
        `${rel}: ${name} must drop the previous attempt's sheet before starting, ` +
          'or it reappears over a session this attempt produced',
      )
    })
  }

  test(`${rel} never raises the upgrade sheet while the note stands`, () => {
    const src = readSource(rel)
    // Every raise — `setGate(<something that is not null>)`. Resetting to null
    // (on entry, on the sheet's own close) is not a raise.
    const raises = /setGate\(\s*(?!null)/g
    let m: RegExpExecArray | null
    let seen = 0
    while ((m = raises.exec(src))) {
      seen++
      assert.match(
        src.slice(Math.max(0, m.index - 300), m.index),
        /setFallbackNote\(null\)/,
        `${rel}: the sheet is modal — raising it over a live fallback note ` +
          'covers the result the note says the member got',
      )
    }
    assert.ok(seen > 0, `${rel}: no gate is ever raised — is the sheet still wired up?`)
  })
}

// ─── 4. A delete that was refused is not a delete ────────────────────────────

const CHECKED_DELETES = [
  'app/dashboard/workout/library/ExerciseLibraryClient.tsx',
  'app/dashboard/programs/mine/MyProgramsClient.tsx',
]

for (const rel of CHECKED_DELETES) {
  test(`${rel}: a refused delete keeps the row and reports itself`, () => {
    const body = declBody(readSource(rel), 'handleDelete')

    const checkAt = body.search(/!res\.ok/)
    assert.ok(checkAt > 0, `${rel}: handleDelete must check the response`)

    const removeAt = body.indexOf('prev.filter')
    assert.ok(removeAt > 0, `${rel}: handleDelete must drop the row from the list`)
    assert.ok(
      removeAt > checkAt,
      `${rel}: the row may only leave the list once the server confirms it left ` +
        'the database',
    )

    const refreshAt = body.indexOf('refreshEntitlements()')
    assert.ok(refreshAt > 0, `${rel}: handleDelete must re-read the snapshot`)
    assert.ok(
      refreshAt > checkAt,
      `${rel}: a refused delete frees no slot, so the re-read returns the same ` +
        'count — a pointless request that leaves the lock unexplained',
    )

    // Something has to say so. Whichever error channel the page already owns.
    assert.match(
      body,
      /set(Delete)?Error\(|throw new Error\(/,
      `${rel}: a refused delete must surface as an error`,
    )
  })
}

test('the exercise library renders its delete error', () => {
  // A state field nothing reads is the same silence with extra steps.
  assert.match(
    readSource('app/dashboard/workout/library/ExerciseLibraryClient.tsx'),
    /\{deleteError && \(/,
    'setDeleteError with no banner behind it tells the member nothing',
  )
})
