// Run with: npm run test:file tests/unit/mind/adminProgressOps.test.ts
//
// The admin reset silently did nothing, because level and chapter are DERIVED:
//   chapter = max(storedChapter, chapterFromSessions(mainSessionCount))
//   level   = getLevelProgress(levelXp).level
// The old reset wrote `chapter: 1, xp: 0` and left mainSessionCount, levelXp and
// lastMainSessionAt untouched, so the very next read recomputed the old values.
//
// Every test here applies a write to a simulated stored document and then runs
// the SAME derivations the app runs, so a write that doesn't survive the round
// trip fails.

import { test } from 'node:test'
import assert from 'node:assert/strict'

import { resetUpdate, chapterUpdate, levelUpdate } from '../../../lib/mind/adminProgressOps'
import {
  chapterFromSessions,
  getLevelProgress,
  getUnlockedSystems,
  mainSessionAvailable,
  SESSIONS_PER_CHAPTER,
} from '../../../lib/mindXP'

interface Stored {
  chapter?: number
  xp?: number
  xpBank?: number
  levelXp?: number
  mainSessionCount?: number
  xpSeeded?: boolean
  lastMainSessionAt?: Date
  lastBreathAt?: Date
  lastGrowthAt?: Date
  introducedSystems?: string[]
}

/** A user deep into the journey — the state the broken reset was tested against. */
function veteran(): Stored {
  return {
    chapter: 4,
    xp: 420,
    xpBank: 900,
    levelXp: 900,
    mainSessionCount: 34,
    lastMainSessionAt: new Date(),
    lastBreathAt: new Date(),
    lastGrowthAt: new Date(),
    introducedSystems: ['state-shift', 'self-image', 'mission', 'discipline', 'anti-sabotage'],
  }
}

/** Apply a $set/$unset pair the way Mongo would. */
function applyUpdate(doc: Stored, update: { set: Record<string, unknown>; unset?: Record<string, string> }): Stored {
  const next: Stored = { ...doc, ...(update.set as Stored) }
  for (const key of Object.keys(update.unset ?? {})) delete next[key as keyof Stored]
  return next
}

/**
 * Everything /api/mind/progress does on read, in order. This has to mirror the
 * WHOLE route, not just the last step: the first version of these tests modelled
 * only the levelXp/mainSessionCount derivation and therefore missed that the
 * evolutionScore seeding above it re-inflated xp after a reset.
 *
 * `evolutionScore` is the user's IdentityProfile score, re-persisted on every GET,
 * so it is non-zero for anyone who has actually used the app.
 */
function derive(doc: Stored, evolutionScore = 0) {
  // 1. One-time xp seeding from evolutionScore.
  let xp = doc.xp ?? 0
  if (!doc.xpSeeded && xp === 0 && evolutionScore > 0) xp += Math.min(evolutionScore, 100)

  // 2. Migration seeding of the fields that derive level and chapter.
  const storedChapter = doc.chapter ?? 1
  const rawLevelXp = doc.levelXp ?? 0
  const rawCount = doc.mainSessionCount ?? 0
  const levelXp = rawLevelXp > 0 ? rawLevelXp : xp + (doc.xpBank ?? 0)
  const mainSessionCount = Math.max(rawCount, (storedChapter - 1) * SESSIONS_PER_CHAPTER)

  // 3. The values the user actually sees.
  const chapter = Math.max(storedChapter, chapterFromSessions(mainSessionCount))
  return {
    chapter,
    level: getLevelProgress(levelXp).level,
    xp,
    mainSessionAvailable: mainSessionAvailable(doc.lastMainSessionAt),
    unlocked: getUnlockedSystems(chapter),
  }
}

// ─── The regression ───────────────────────────────────────────────────────────

test('REGRESSION: the old reset left the user exactly where they were', () => {
  const before = derive(veteran())
  // What the route used to write.
  const broken = applyUpdate(veteran(), {
    set: { chapter: 1, xp: 0, xpBank: 0, chapterHistory: [], selfDeclaredChapters: [] },
  })
  const after = derive(broken)
  assert.equal(after.chapter, before.chapter, 'chapter re-derived from the untouched session count')
  assert.equal(after.level, before.level, 'level never moved because levelXp was untouched')
  assert.equal(after.mainSessionAvailable, false, 'the 20h cooldown survived the reset')
  // Sanity: the fixture really is a mid-journey account, so the above means something.
  assert.ok(before.chapter > 1 && before.level > 1)
})

// ─── Full reset ───────────────────────────────────────────────────────────────

test('the reset lands on level 1 / chapter 1 and survives the derivation', () => {
  const after = applyUpdate(veteran(), resetUpdate())
  const d = derive(after)
  assert.equal(d.chapter, 1)
  assert.equal(d.level, 1)
})

test('the reset clears the 20h main-session cooldown', () => {
  const after = applyUpdate(veteran(), resetUpdate())
  assert.equal(after.lastMainSessionAt, undefined)
  assert.equal(derive(after).mainSessionAvailable, true, 'main session must be playable straight after a reset')
})

test('REGRESSION: the reset is not undone by the evolutionScore xp seeding', () => {
  // The seeding condition used to be just "xp === 0", so it re-fired on the next
  // read after a reset: xp came back, levelXp was derived from it, and the level
  // climbed off 1. Anyone who has used the app has a non-zero evolutionScore, so
  // this hit every real account.
  const after = applyUpdate(veteran(), resetUpdate())
  const d = derive(after, 100) // a fully-active user's evolution score
  assert.equal(d.xp, 0, 'xp must stay at zero after a deliberate reset')
  assert.equal(d.level, 1, 'level must stay at 1 after a deliberate reset')
  assert.equal(d.chapter, 1)
})

test('the one-time xp seeding still works for a user who was never seeded', () => {
  // Guard the fix: a genuine pre-existing account must still get its seed.
  const legacy: Stored = { chapter: 1, xp: 0, xpBank: 0, levelXp: 0, mainSessionCount: 0 }
  assert.equal(derive(legacy, 80).xp, 80, 'unseeded legacy accounts still seed')
  assert.equal(derive({ ...legacy, xpSeeded: true }, 80).xp, 0, 'seeded accounts do not re-seed')
})

test('the reset zeroes every counter that derives level or chapter', () => {
  const after = applyUpdate(veteran(), resetUpdate())
  assert.equal(after.levelXp, 0)
  assert.equal(after.mainSessionCount, 0)
  assert.equal(after.xp, 0)
  assert.equal(after.xpBank, 0)
})

test('the reset re-locks tool intros and clears session recency', () => {
  const after = applyUpdate(veteran(), resetUpdate())
  assert.deepEqual(after.introducedSystems, [])
  assert.equal(after.lastBreathAt, undefined)
  assert.equal(after.lastGrowthAt, undefined)
})

// ─── Setting a chapter ────────────────────────────────────────────────────────

test('setting a chapter DOWN actually sticks', () => {
  // The old route wrote only `chapter`, so this was silently undone.
  const after = { ...veteran(), ...chapterUpdate(2, veteran().introducedSystems) }
  assert.equal(derive(after).chapter, 2)
})

test('setting a chapter UP sticks too', () => {
  const after = { ...veteran(), ...chapterUpdate(5, veteran().introducedSystems) }
  assert.equal(derive(after).chapter, 5)
})

test('every chapter round-trips through the derivation', () => {
  for (const c of [1, 2, 3, 4, 5]) {
    const after = { ...veteran(), ...chapterUpdate(c, []) }
    assert.equal(derive(after).chapter, c, `chapter ${c} did not survive`)
    assert.equal(after.mainSessionCount, (c - 1) * SESSIONS_PER_CHAPTER)
  }
})

test('chapter requests are clamped to the real range', () => {
  assert.equal(derive({ ...veteran(), ...chapterUpdate(0, []) }).chapter, 1)
  assert.equal(derive({ ...veteran(), ...chapterUpdate(99, []) }).chapter, 5)
})

test('lowering the chapter re-locks tools it no longer unlocks', () => {
  const after = { ...veteran(), ...chapterUpdate(2, veteran().introducedSystems) }
  const unlocked = getUnlockedSystems(2)
  for (const s of after.introducedSystems ?? []) {
    assert.ok(unlocked.includes(s), `${s} should not stay introduced at chapter 2`)
  }
  assert.ok((after.introducedSystems ?? []).length < (veteran().introducedSystems ?? []).length)
})

// ─── Setting a level ──────────────────────────────────────────────────────────

test('every level round-trips through the derivation', () => {
  for (const l of [1, 2, 3, 5, 8, 12, 20]) {
    const v = veteran()
    const after = { ...v, ...levelUpdate(l, v.xp, v.xpBank) }
    assert.equal(derive(after).level, l, `level ${l} did not survive`)
  }
})

test('dropping to level 1 is not undone by the xp re-seed', () => {
  // levelXp 0 makes /api/mind/progress fall back to xp + xpBank, so those have to
  // come down too or the level bounces straight back.
  const v = veteran()
  const after = { ...v, ...levelUpdate(1, v.xp, v.xpBank) }
  assert.equal(after.levelXp, 0)
  assert.equal(after.xp, 0)
  assert.equal(after.xpBank, 0)
  assert.equal(derive(after).level, 1)
})

test('raising a level leaves xp and the becoming bank alone', () => {
  const v = veteran()
  const after = { ...v, ...levelUpdate(20, v.xp, v.xpBank) }
  assert.equal(after.xp, v.xp, 'xp under the new levelXp is untouched')
  assert.equal(after.xpBank, v.xpBank)
})

test('level requests below 1 are clamped', () => {
  assert.equal(derive({ ...veteran(), ...levelUpdate(0, 0, 0) }).level, 1)
  assert.equal(derive({ ...veteran(), ...levelUpdate(-5, 0, 0) }).level, 1)
})

// ─── Level and chapter are independent ────────────────────────────────────────

test('setting level and chapter together gives exactly both', () => {
  const v = veteran()
  const after = { ...v, ...chapterUpdate(3, v.introducedSystems), ...levelUpdate(7, v.xp, v.xpBank) }
  const d = derive(after)
  assert.equal(d.chapter, 3)
  assert.equal(d.level, 7)
})
