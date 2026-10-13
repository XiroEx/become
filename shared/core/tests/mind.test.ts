// The copied Mind domain, checked on the fixtures the WEB generated (NP-017 / NP-062).
//
// webapp/lib is the source of truth; these modules are written by
// `node scripts/vendor-mind.mjs` and pinned by
// tests/fixtures/mindParity.json, which comes out of
// `cd webapp && npx tsx scripts/gen-mind-fixtures.ts`.
//
// This suite is what the `shared-core` CI job runs: it fails when @become/core
// stops producing the web's answers for the same seed and context.

import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

import {
  CHAPTERS,
  CHAPTER_XP_THRESHOLDS,
  MAIN_SESSION_COOLDOWN_MS,
  MAX_CHAPTER,
  SESSIONS_PER_CHAPTER,
  chapterFromSessions,
  getLevelProgress,
  getUnlockedSystems,
  getXpToNextChapter,
  mainSessionAvailable,
  sessionsIntoChapter,
} from '../src/mindXP'
import { CONTENT_PIECES } from '../src/mindContent'
import { composeSession, composeThemedSession, singleMovePlan } from '../src/mind/composeSession'
import { SESSION_PATH, getPathSession } from '../src/mind/sessionPath'
import { matchSpeech, normalizeWords, wordsClose } from '../src/mind/speechMatch'
import type { MindState } from '../src/mindContent'
import type { SessionContext } from '../src/mind/moves'

interface CaseCtx {
  chapter: number
  seed: number
  dayOfYear: number
  recentState: MindState | null
  recentFeeling?: string | null
  identityStatement?: string | null
  missionAction?: string | null
  recentKinds?: string[] | null
  moodToday?: { value: 1 | 2 | 3 | 4 | 5; label: string; at: number } | null
  now?: number
  lastBreathAt?: number | null
  pathIndex: number | null
}

interface Fixture {
  clock: number
  composeSession: { name: string; ctx: CaseCtx; expected: unknown }[]
  composeThemedSession: { system: string; name: string; ctx: CaseCtx; hasScene: boolean; expected: unknown }[]
  singleMovePlan: { system: string; ctx: CaseCtx; expected: unknown }[]
  getLevelProgress: { levelXp: number; expected: unknown }[]
  chapterFromSessions: {
    mainSessionCount: number
    expected: number
    sessionsIntoChapter: unknown
    unlockedSystems: string[]
    xpToNextChapter: unknown
    pathSession: unknown
  }[]
  mainSessionAvailable: { lastMainSessionAt: number | null; now: number; expected: boolean }[]
  matchSpeech: { target: string; spoken: string; expected: unknown }[]
}

// `@become/core` is an ES module, so there is no `__dirname` here.
const TESTS_DIR = path.dirname(fileURLToPath(import.meta.url))

const FIXTURE = JSON.parse(
  fs.readFileSync(path.resolve(TESTS_DIR, 'fixtures/mindParity.json'), 'utf8'),
) as Fixture

const REGEN =
  'The web changed: re-run `node scripts/vendor-mind.mjs` and `cd webapp && npx tsx scripts/gen-mind-fixtures.ts`.'

function toContext(c: CaseCtx): SessionContext {
  return {
    chapter: c.chapter,
    unlockedSystems: getUnlockedSystems(c.chapter),
    recentState: c.recentState,
    recentFeeling: c.recentFeeling ?? null,
    identityStatement: c.identityStatement ?? null,
    missionAction: c.missionAction ?? null,
    recentKinds: c.recentKinds ?? null,
    moodToday: c.moodToday ?? null,
    pathFocus: c.pathIndex === null ? null : getPathSession(c.pathIndex),
    dayOfYear: c.dayOfYear,
    seed: c.seed,
    now: c.now,
    lastBreathAt: c.lastBreathAt ?? null,
  }
}

/** JSON round-trip so an absent key and an explicit `undefined` compare equal. */
function plain(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value ?? null))
}

describe('@become/core Mind composer — the web fixtures', () => {
  it('has the fixture spread it was generated with', () => {
    assert.ok(FIXTURE.composeSession.length >= 25)
    assert.ok(FIXTURE.composeThemedSession.length >= 14)
    assert.ok(FIXTURE.matchSpeech.length >= 8)
  })

  it('composes the web plan for every seed, chapter, state and path position', () => {
    for (const c of FIXTURE.composeSession) {
      assert.deepStrictEqual(plain(composeSession(toContext(c.ctx))), c.expected, `${c.name}: ${REGEN}`)
    }
  })

  it('composes the web themed session and single-move plan', () => {
    for (const c of FIXTURE.composeThemedSession) {
      assert.deepStrictEqual(
        plain(composeThemedSession(c.system, toContext(c.ctx))),
        c.expected,
        `${c.name}: ${REGEN}`,
      )
    }
    for (const c of FIXTURE.singleMovePlan) {
      assert.deepStrictEqual(plain(singleMovePlan(c.system, toContext(c.ctx))), c.expected, `${c.system}: ${REGEN}`)
    }
  })

  it('replays the same plan for the same seed and context', () => {
    for (const c of FIXTURE.composeSession.slice(0, 5)) {
      const first = composeSession(toContext(c.ctx))
      const second = composeSession(toContext(c.ctx))
      assert.deepStrictEqual(second, first, 'the composer must be deterministic')
    }
  })

  it('opens every session with the state check and ends on the path body', () => {
    for (const c of FIXTURE.composeSession) {
      const plan = composeSession(toContext(c.ctx))
      assert.equal(plan.moves[0]?.kind, 'state-check')
      assert.equal(plan.moves.length, 4)
      assert.equal(plan.rewardXp, 15)
      if (c.ctx.pathIndex !== null) {
        const focus = getPathSession(c.ctx.pathIndex)!
        assert.equal(plan.intro.title, focus.focus)
        assert.equal(plan.blueprintId, `${plan.openingId}/${focus.shape}`)
      }
    }
  })
})

describe('@become/core Mind XP and chapters — the web fixtures', () => {
  it('resolves the web level progress', () => {
    for (const c of FIXTURE.getLevelProgress) {
      assert.deepStrictEqual(plain(getLevelProgress(c.levelXp)), c.expected, `getLevelProgress(${c.levelXp}): ${REGEN}`)
    }
  })

  it('resolves the web chapter, chapter progress and path session', () => {
    for (const c of FIXTURE.chapterFromSessions) {
      assert.equal(chapterFromSessions(c.mainSessionCount), c.expected, `chapterFromSessions: ${REGEN}`)
      assert.deepStrictEqual(plain(sessionsIntoChapter(c.mainSessionCount)), c.sessionsIntoChapter, REGEN)
      assert.deepEqual(getUnlockedSystems(c.expected), c.unlockedSystems, REGEN)
      assert.deepStrictEqual(plain(getXpToNextChapter(c.expected, 120)), c.xpToNextChapter, REGEN)
      assert.deepStrictEqual(plain(getPathSession(c.mainSessionCount)), c.pathSession, REGEN)
    }
  })

  it('gates the main session on the web cooldown', () => {
    for (const c of FIXTURE.mainSessionAvailable) {
      assert.equal(mainSessionAvailable(c.lastMainSessionAt, c.now), c.expected, `mainSessionAvailable: ${REGEN}`)
    }
    assert.equal(MAIN_SESSION_COOLDOWN_MS, 20 * 60 * 60 * 1000)
  })

  it('keeps the chapter model intact', () => {
    assert.equal(CHAPTERS.length, 5)
    assert.equal(MAX_CHAPTER, CHAPTERS.length)
    assert.equal(SESSIONS_PER_CHAPTER, 10)
    assert.equal(CHAPTER_XP_THRESHOLDS[0], 0)
    assert.equal(SESSION_PATH.length, MAX_CHAPTER * SESSIONS_PER_CHAPTER)
    assert.equal(getPathSession(SESSION_PATH.length), null)
    assert.ok(CONTENT_PIECES.length >= 30)
  })
})

describe('@become/core Mind speech matcher — the web fixtures', () => {
  it('matches the web transcripts, fillers and misses included', () => {
    for (const c of FIXTURE.matchSpeech) {
      assert.deepStrictEqual(plain(matchSpeech(c.target, c.spoken)), c.expected, `matchSpeech("${c.spoken}"): ${REGEN}`)
    }
  })

  it('normalizes and compares words the way the web does', () => {
    assert.deepEqual(normalizeWords("Hello, WORLD! It's me."), ['hello', 'world', "it's", 'me'])
    assert.equal(wordsClose('discipline', 'discip'), true)
    assert.equal(wordsClose('discipline', 'dis'), true)
    assert.equal(wordsClose('discipline', 'di'), false)
    assert.equal(wordsClose('focus', 'water'), false)
    const { matched, matchedCount, total, ratio } = matchSpeech('I am calm', 'um I am calm')
    assert.deepEqual(matched, [true, true, true])
    assert.equal(matchedCount, 3)
    assert.equal(total, 3)
    assert.equal(ratio, 1)
  })
})
