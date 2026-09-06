// Run with: npm run test:file tests/unit/mind/sessionAllowance.test.ts
//
// WHICH NUMBER THE MIND PAYWALL COUNTS.
//
// The free tier gets the first 10 Mind sessions. That allowance used to read
// `MindProgress.mainSessionCount`, which reads like a session count and is not:
// it is CHAPTER PROGRESS expressed in sessions, and it legitimately carries a
// head start nobody sat through.
//
//   • the Mind intake maps "I'm building momentum" → chapter 2 and "I'm ready
//     for the next level" → chapter 3, both with 0 XP and 0 sessions;
//   • POST /api/mind/progress/levelup advances a chapter on a self-declaration;
//   • an admin can set a chapter outright;
//   • and GET /api/mind/progress then PERSISTS
//     max(count, (chapter - 1) * SESSIONS_PER_CHAPTER) so the chapter survives
//     the round trip.
//
// So a brand-new free member who answered "building" at intake was 10/10 before
// their first session and was refused it with "You've finished your first 10
// Mind sessions" (reproduced on production, twice, on fresh accounts), and a
// self-declared level-up burned 9 more phantom sessions on top — locking that
// member out on their SECOND real session.
//
// The head start is the intended product. The bug was a paywall counter reading
// a progress number. There are now two counters and the allowance reads the
// truthful one.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

import { consumeAllowance, peekAllowance } from '../../../lib/allowances'
import { FREE_LIMITS, type Feature } from '../../../lib/entitlements'
import { startingChapterForPoint, SESSIONS_PER_CHAPTER } from '../../../lib/mindXP'
import { resetUpdate, chapterUpdate } from '../../../lib/mind/adminProgressOps'

const ROOT = path.join(__dirname, '../../..')
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8')

const FEATURE: Feature = 'mind-sessions'
const LIMIT = FREE_LIMITS[FEATURE].limit
const USER = '65f0000000000000000000aa'

/** Ask the real allowance what it decides when the count is `n`. */
const decide = (n: number) =>
  consumeAllowance(FEATURE, { userId: USER, countRows: async () => n }, { enforce: true })

// ─── The defect, in arithmetic ───────────────────────────────────────────────

test('the intake head start alone reaches the free limit, with zero sessions done', () => {
  // This is the whole bug in three lines: nothing here involves a session.
  const chapter = startingChapterForPoint('building')
  const chapterProgress = (chapter - 1) * SESSIONS_PER_CHAPTER
  assert.equal(chapter, 2)
  assert.ok(
    chapterProgress >= LIMIT,
    `the 'building' head start (${chapterProgress}) already meets the free limit (${LIMIT})`,
  )
  // 'leveling_up' is worse still — 20 against a limit of 10.
  const levelling = (startingChapterForPoint('leveling_up') - 1) * SESSIONS_PER_CHAPTER
  assert.ok(levelling > LIMIT)
})

test('a member who has completed nothing gets their first session; the head-start number would refuse it', async () => {
  const completed = await decide(0)
  assert.equal(completed.allowed, true, 'zero completed sessions must never be at the cap')
  assert.equal(completed.state.used, 0)
  assert.equal(completed.state.remaining, LIMIT)

  // The number the allowance USED to read, for the same member on day one.
  const chapterProgress = await decide((startingChapterForPoint('building') - 1) * SESSIONS_PER_CHAPTER)
  assert.equal(chapterProgress.allowed, false, 'documents the refusal that shipped')
  assert.equal(chapterProgress.reason, 'limit')
})

test('a self-declared level-up must not spend sessions the member never did', async () => {
  // The D2 shape: chapter 1 → 2 with 0 XP, then the backfill writes 10.
  const afterSelfDeclare = (2 - 1) * SESSIONS_PER_CHAPTER
  assert.equal((await decide(afterSelfDeclare)).allowed, false, 'documents the lockout that shipped')

  // What actually happened: one real session. The allowance must see one.
  const realSessions = 1
  const gate = await decide(realSessions)
  assert.equal(gate.allowed, true, 'their SECOND session must not be refused')
  assert.equal(gate.state.remaining, LIMIT - realSessions)
})

// ─── The field the counter reads ─────────────────────────────────────────────

test('the mind-sessions milestone counts completedMainSessions, never mainSessionCount', () => {
  const src = read('lib/allowances.ts')
  const map = src.slice(src.indexOf('const MILESTONE_COUNTS'), src.indexOf('function stateFor'))

  assert.match(map, /completedMainSessions/, 'the allowance must read the truthful counter')
  // The chapter-progress number must not appear ANYWHERE in the counter, not
  // even as a fallback: `completedMainSessions ?? mainSessionCount` would
  // reintroduce the whole defect for every existing member.
  assert.doesNotMatch(
    map.replace(/\/\/[^\n]*/g, ''),
    /mainSessionCount/,
    'mainSessionCount is chapter progress — a paywall must never read it, not even as a fallback',
  )
})

test('only a completed session increments the truthful counter', () => {
  const src = read('app/api/mind/session/route.ts')
  // `counted` is the 20h-cooldown flag: a replay inside the cooldown nudges XP
  // but is not a main session, and must not spend one.
  assert.match(src, /if \(counted\) inc\.completedMainSessions = 1/)
  const writers = src.match(/completedMainSessions/g) ?? []
  assert.ok(writers.length >= 2, 'the route both reads and increments it')
})

test('nothing else in the app writes completedMainSessions from a chapter', () => {
  // The one legitimate non-session writer is the admin RESET (it zeroes it).
  // Anything else deriving it from a chapter is the original defect returning.
  const offenders: string[] = []
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (entry.name.endsWith('.ts')) {
        const src = fs.readFileSync(full, 'utf8')
        if (/completedMainSessions\s*:\s*[^0\s]/.test(src)) offenders.push(path.relative(ROOT, full))
      }
    }
  }
  walk(path.join(ROOT, 'app/api'))
  walk(path.join(ROOT, 'lib'))
  assert.deepEqual(offenders, [], `completedMainSessions written from a derived value: ${offenders.join(', ')}`)
})

test('a self-declared level-up writes no session count at all', () => {
  // D2: the level-up itself was never the thing that inflated the counter — the
  // backfill on the next progress read was. Advancing a chapter must stay a
  // chapter write, and must never learn to touch either counter.
  const src = read('app/api/mind/progress/levelup/route.ts')
  assert.doesNotMatch(src, /completedMainSessions/, 'a self-declaration is not a session')
  assert.doesNotMatch(src, /mainSessionCount/, 'the chapter is the write; the count is derived')
})

// ─── The admin ops (pure, so these are behavioural) ──────────────────────────

test('an admin chapter change moves chapter progress and NOT the session count', () => {
  const update = chapterUpdate(4)
  assert.equal(update.mainSessionCount, (4 - 1) * SESSIONS_PER_CHAPTER, 'the chapter must still unlock')
  assert.ok(
    !('completedMainSessions' in update),
    'setting a chapter must neither grant nor burn free Mind sessions',
  )
})

test('an admin reset gives the member their free sessions back', () => {
  const { set } = resetUpdate(new Date(0))
  assert.equal(set.mainSessionCount, 0)
  assert.equal(
    set.completedMainSessions, 0,
    'a reset that left the paywall counter behind hands out a new journey with the sessions already spent',
  )
})

// ─── The reported meter ──────────────────────────────────────────────────────

test('the session hub reports the same number the gate decides on', async () => {
  const src = read('app/api/mind/session/route.ts')
  assert.match(src, /completedMainSessions \?\? 0/, 'GET must meter the truthful counter')
  assert.match(src, /peekQuota\(userId, 'mind-sessions'\)/, 'the gate has ONE definition')

  // And the meter can never render over 100%.
  const state = await peekAllowance(FEATURE, { userId: USER, countRows: async () => LIMIT * 4 })
  assert.equal(state.used, LIMIT)
  assert.equal(state.remaining, 0)
})
