// Run with: npx tsx --test tests/unit/guided-ask.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { validateGuidedSteps, ensureStepAsks, trailingQuestion } from '../../lib/ai/sanitize'
import { openCount } from '../../components/mind/system/ProtocolUnlock'

// ── The reported bug ─────────────────────────────────────────────────────────
//
// "One Concrete Action" and "The Amplified Impact" showed a statement and a bare
// text box. The model HAD written a question — into `inputPrompt` — but
// GuidedFlow only ever rendered `title` and `body`, so the ask was invisible.

const GUIDED_FLOW = readFileSync(
  join(process.cwd(), 'components/mind/system/GuidedFlow.tsx'),
  'utf8',
)

test('GuidedFlow actually renders the ask', () => {
  // Not just `!!step.inputPrompt` as a boolean gate — it must reach the JSX.
  assert.match(
    GUIDED_FLOW,
    /\{showAsk && \(/,
    'inputPrompt must be rendered, not only used to decide whether to show a textarea',
  )
  assert.match(GUIDED_FLOW, /\{ask\}<\/p>/, 'the ask text must be printed')
})

test('the ask is not printed twice when the body already contains it', () => {
  assert.match(GUIDED_FLOW, /function containsAsk/)
})

// ── ensureStepAsks ───────────────────────────────────────────────────────────

test('a question inputPrompt is left exactly as written', () => {
  const step = { title: 'X', body: 'Some setup.', inputPrompt: 'What will you do today?' }
  assert.equal(ensureStepAsks({ ...step }).inputPrompt, 'What will you do today?')
})

test('a declarative inputPrompt is replaced by the question the body ends on', () => {
  // The exact failure shape from the screenshots: the real question was stranded
  // in the body while inputPrompt read as a statement.
  const step = {
    title: 'One Concrete Action',
    body: "You're hard-working and get the job done. What is the one action you will take today?",
    inputPrompt: 'Name the action.',
  }
  assert.equal(ensureStepAsks(step).inputPrompt, 'What is the one action you will take today?')
})

test('a declarative inputPrompt with no question anywhere is left alone, not fabricated', () => {
  // Inventing a question here would put words in the coach's mouth. The render
  // fix already guarantees the ask is visible.
  const step = { title: 'X', body: 'A statement.', inputPrompt: 'Write your answer.' }
  assert.equal(ensureStepAsks(step).inputPrompt, 'Write your answer.')
})

test('steps with no input are untouched', () => {
  const step = { title: 'Info', body: 'Just context.' }
  assert.deepEqual(ensureStepAsks({ ...step }), step)
})

test('trailingQuestion only promotes a real question', () => {
  assert.equal(trailingQuestion('Setup here. What matters most today?'), 'What matters most today?')
  assert.equal(trailingQuestion('No question at all.'), null)
  assert.equal(trailingQuestion('Huh?'), null, 'a two-word fragment is not a coaching question')
  assert.equal(
    trailingQuestion('Why does it matter? Because you said so.'),
    null,
    'a question that is not at the end is not the ask',
  )
})

test('validateGuidedSteps repairs the ask as part of normal validation', () => {
  const steps = validateGuidedSteps([
    { title: 'A', body: 'Context. What is your one move?', inputPrompt: 'State it.' },
    { title: 'B', body: 'Close.' },
  ])
  assert.ok(steps)
  assert.equal(steps![0].inputPrompt, 'What is your one move?')
})

test('validateGuidedSteps still rejects an unusable flow', () => {
  assert.equal(validateGuidedSteps([{ title: 'only one' }]), null)
  assert.equal(validateGuidedSteps('nope'), null)
})

// ── Protocol unlock boundary ─────────────────────────────────────────────────

test('openCount matches the lock rule the cards render', () => {
  // Cards use `locked={i >= 1 + reps}`, so `1 + reps` are open.
  assert.equal(openCount(0, 5), 1, 'a brand-new member has exactly one protocol open')
  assert.equal(openCount(3, 5), 4)
  assert.equal(openCount(9, 5), 5, 'never claims more protocols than exist')
  assert.equal(openCount(-2, 5), 0, 'never negative')
})

test('the unlock hook baselines rather than celebrating on first load', () => {
  const SRC = readFileSync(
    join(process.cwd(), 'components/mind/system/ProtocolUnlock.tsx'),
    'utf8',
  )
  // reps must be nullable, or the pre-load 0 reads as a real value and every
  // page open looks like a jump from 1 unlocked protocol to N.
  assert.match(SRC, /reps: number \| null/)
  assert.match(SRC, /if \(reps === null\) return/)
  assert.match(SRC, /if \(before === null \|\| open <= before\) return/)
})

test('every arsenal dashboard wires the unlock moment', () => {
  const dashboards = [
    'Mission', 'Social', 'SelfImage', 'StateShift', 'Vision', 'Discipline', 'AntiSabotage',
  ]
  for (const d of dashboards) {
    const src = readFileSync(join(process.cwd(), `components/mind/${d}Dashboard.tsx`), 'utf8')
    assert.match(src, /useProtocolUnlocks\(/, `${d} must detect unlocks`)
    assert.match(src, /<ProtocolUnlockModal/, `${d} must render the unlock moment`)
    assert.match(
      src,
      /const \[reps, setReps\] = useState<number \| null>\(null\)/,
      `${d} must treat reps as unknown until loaded`,
    )
  }
})

test('StateShift watches the same filtered list its cards render', () => {
  // Its list excludes "protect-the-state", so indexing RESET_FLOWS would name a
  // different protocol than the one that actually opened.
  const src = readFileSync(join(process.cwd(), 'components/mind/StateShiftDashboard.tsx'), 'utf8')
  assert.match(src, /useProtocolUnlocks\(UNLOCKABLE_RESETS, reps\)/)
  assert.match(src, /\{UNLOCKABLE_RESETS\.map\(/)
})

// ── No stuttered ask ─────────────────────────────────────────────────────────

test('the body loses its trailing question once the ask renders it', () => {
  // Screens 1 and 2 of the reported session put the question in `body`. With the
  // ask finally rendered, leaving it there asks the same thing twice.
  const step = ensureStepAsks({
    title: 'Embodying Your Leadership',
    body: "You've said you're a role model. When your actions don't align, what impact does that have on your ability to lead?",
    inputPrompt: 'What impact does that have on your ability to lead?',
  })
  // The whole question SENTENCE goes, not just the interrogative clause — what
  // is left has to read as clean setup on its own.
  assert.equal(step.body, "You've said you're a role model.")
  assert.equal(step.inputPrompt, 'What impact does that have on your ability to lead?')
})

test('a body that was only a question is dropped, not left empty', () => {
  const step = ensureStepAsks({
    title: 'X',
    body: 'What is your one move today?',
    inputPrompt: 'What is your one move today?',
  })
  assert.equal(step.body, undefined)
  assert.equal(step.inputPrompt, 'What is your one move today?')
})

test('a declarative body is left fully intact', () => {
  const body = 'Every step you take to align your actions amplifies your mission.'
  const step = ensureStepAsks({ title: 'X', body, inputPrompt: 'What does that unlock for you?' })
  assert.equal(step.body, body)
})
