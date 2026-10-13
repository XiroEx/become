// Run with: npm run test:file tests/unit/quickSession/name-prompt-exit.test.ts
//
// The naming prompt used to be a wall: the only ways out were typing a name or
// "Back", and Back abandoned the completing save — so a member who did not want
// to name their session was stuck, and the workout they had just finished never
// reached the summary or the log. Exiting now finishes under the day it was
// done ("9/9/26 workout").
//
// No jsdom in this repo, so what is enforced here is the WIRING: every place
// that mounts the prompt hands it both halves (the fallback name and the skip
// handler), and each takes its date from the day that call site actually logs
// to. A new call site added without them is silently a wall again, which is
// exactly the regression this file exists to fail on.

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import assert from 'node:assert/strict'

const ROOT = join(__dirname, '../../..')

function sourceFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.next' || entry === 'tests') continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...sourceFiles(full))
    else if (entry.endsWith('.tsx')) out.push(full)
  }
  return out
}

/** Every `<QuickSessionNamePrompt ... />` element, as raw source text. */
function promptElements(source: string): string[] {
  const out: string[] = []
  let from = 0
  for (;;) {
    const start = source.indexOf('<QuickSessionNamePrompt', from)
    if (start === -1) return out
    const end = source.indexOf('/>', start)
    assert.notEqual(end, -1, 'unterminated <QuickSessionNamePrompt element')
    out.push(source.slice(start, end + 2))
    from = end + 2
  }
}

const callSites = sourceFiles(join(ROOT, 'app'))
  .concat(sourceFiles(join(ROOT, 'components')))
  .filter((file) => !file.endsWith('QuickSessionNamePrompt.tsx'))
  .map((file) => ({ file: file.slice(ROOT.length + 1), elements: promptElements(readFileSync(file, 'utf8')) }))
  .filter((entry) => entry.elements.length > 0)

test('the prompt is mounted somewhere, or this file is asserting nothing', () => {
  assert.ok(callSites.length >= 4, `expected the four naming surfaces, found ${callSites.length}`)
})

test('every naming prompt can be exited into a completed, date-named workout', () => {
  for (const { file, elements } of callSites) {
    for (const element of elements) {
      assert.match(element, /fallbackName=\{fallbackQuickSessionName\(/, `${file}: prompt has no fallback name`)
      assert.match(element, /onSkip=\{/, `${file}: prompt has no way out but a name`)
    }
  }
})

test('each fallback name is dated from the day that surface actually logs to', () => {
  const dateSourceOf = (file: string) => {
    const element = callSites.find((entry) => entry.file === file)?.elements[0]
    assert.ok(element, `${file} no longer mounts the naming prompt`)
    return /fallbackQuickSessionName\(([^)]*)\)/.exec(element)?.[1]
  }

  // Live: the day the log is attributed to — the day-choice answer if one was
  // given, otherwise the day the workout belongs to. Captured on the pending
  // completion because saveWorkout consumes logDateOverrideRef.
  assert.equal(
    dateSourceOf('app/dashboard/workout/[programId]/workout/live/LiveWorkoutClient.tsx'),
    'pendingQuickCompletion.dayKey',
  )
  // Track sends no performedAt, so the server dates the log now: today.
  assert.equal(dateSourceOf('app/dashboard/workout/[programId]/workout/WorkoutFormClient.tsx'), '')
  // Both backfill surfaces post `performedAt`/`date` from the picked day.
  assert.equal(dateSourceOf('app/dashboard/workout/quick-session/page.tsx'), 'logDate')
  assert.equal(dateSourceOf('components/SessionBuilder.tsx'), 'logDate')
})

test('the live prompt carries the day forward instead of re-reading a consumed ref', () => {
  const live = readFileSync(
    join(ROOT, 'app/dashboard/workout/[programId]/workout/live/LiveWorkoutClient.tsx'),
    'utf8',
  )

  // The day is stamped onto the pending completion at the moment the gate
  // opens. saveWorkout reads logDateOverrideRef ONCE and clears it, so a
  // render-time read would show the wrong date on a retry after a failed save.
  assert.match(live, /dayKey: logDateOverrideRef\.current \?\? workoutOriginKey/)
  assert.match(live, /useState<\{ data: SetData\[\]\[\]; dayKey: string \} \| null>\(null\)/)
  // Skipping finishes through the same path a typed name does — same save,
  // same summary.
  assert.match(live, /onConfirm=\{finishNamedQuickSession\}\s*\n\s*onSkip=\{finishNamedQuickSession\}/)
  assert.match(live, /setShowSummary\(true\);\n\s*\}, \[pendingQuickCompletion/)
})
