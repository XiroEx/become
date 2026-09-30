// Run with: npm run test:file tests/unit/mindParity.test.ts
//
// Behavioural parity test for the copied pure Mind modules (NP-017 / NP-062).
//
// Acceptance:
//   e015c7fe — the webapp CI job fails when any vendored Mind module disagrees
//              with the web on the fixtures.
//   e015c7ff — the same seed and context compose the same session natively and
//              on the web. The native half of that is pinned through
//              shared/core/tests/fixtures/mindParity.json, which is GENERATED from
//              the web modules (webapp/scripts/gen-mind-fixtures.ts) and asserted
//              here against the web, in shared/core/tests/mind.test.ts against
//              @become/core, and in expo/__tests__/mind.test.ts against
//              @become/core as the native app resolves it.
//
// The text half of the same guarantee (copies stay verbatim) is
// tests/unit/mindDrift.test.ts.

import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

// ── Web modules (the source of truth) ─────────────────────────────────────────
import * as webXP from '../../lib/mindXP'
import * as webContent from '../../lib/mindContent'
import * as webSanitize from '../../lib/ai/sanitize'
import * as webMoves from '../../lib/mind/moves'
import * as webCompose from '../../lib/mind/composeSession'
import * as webBlueprints from '../../lib/mind/blueprints'
import * as webBodies from '../../lib/mind/bodies'
import * as webOpenings from '../../lib/mind/openings'
import * as webSlots from '../../lib/mind/slots'
import * as webBuilders from '../../lib/mind/moveBuilders'
import * as webLibrary from '../../lib/mind/library'
import * as webValidate from '../../lib/mind/validateMove'
import * as webPath from '../../lib/mind/sessionPath'
import * as webRecommend from '../../lib/mind/recommendSegment'
import * as webSuggest from '../../lib/mind/suggestActions'
import * as webProtocols from '../../lib/mind/suggestedProtocols'
import * as webMood from '../../lib/mind/moodBridge'
import * as webAutoStart from '../../lib/mind/autoStart'
import * as webIntros from '../../lib/mind/introFlows'
import * as webSpeech from '../../lib/mind/speechMatch'
import * as webFeeling from '../../lib/mind/recentFeeling'
import * as webRotation from '../../lib/mind/rotation'

// ── The copies in @become/core (shared/core/src) ──────────────────────────────
import * as coreXP from '../../../shared/core/src/mindXP'
import * as coreContent from '../../../shared/core/src/mindContent'
import * as coreSanitize from '../../../shared/core/src/ai/sanitize'
import * as coreMoves from '../../../shared/core/src/mind/moves'
import * as coreCompose from '../../../shared/core/src/mind/composeSession'
import * as coreBlueprints from '../../../shared/core/src/mind/blueprints'
import * as coreBodies from '../../../shared/core/src/mind/bodies'
import * as coreOpenings from '../../../shared/core/src/mind/openings'
import * as coreSlots from '../../../shared/core/src/mind/slots'
import * as coreBuilders from '../../../shared/core/src/mind/moveBuilders'
import * as coreLibrary from '../../../shared/core/src/mind/library'
import * as coreValidate from '../../../shared/core/src/mind/validateMove'
import * as corePath from '../../../shared/core/src/mind/sessionPath'
import * as coreRecommend from '../../../shared/core/src/mind/recommendSegment'
import * as coreSuggest from '../../../shared/core/src/mind/suggestActions'
import * as coreProtocols from '../../../shared/core/src/mind/suggestedProtocols'
import * as coreMood from '../../../shared/core/src/mind/moodBridge'
import * as coreAutoStart from '../../../shared/core/src/mind/autoStart'
import * as coreIntros from '../../../shared/core/src/mind/introFlows'
import * as coreSpeech from '../../../shared/core/src/mind/speechMatch'
import * as coreFeeling from '../../../shared/core/src/mind/recentFeeling'
import * as coreRotation from '../../../shared/core/src/mind/rotation'

import type { MindState } from '../../lib/mindContent'
import type { MoveKind, SessionContext } from '../../lib/mind/moves'

type Ns = Record<string, unknown>

/** Every copied module, paired with its web source. */
const MODULE_PAIRS: { name: string; web: Ns; core: Ns }[] = [
  { name: 'mindXP', web: webXP as unknown as Ns, core: coreXP as unknown as Ns },
  { name: 'mindContent', web: webContent as unknown as Ns, core: coreContent as unknown as Ns },
  { name: 'ai/sanitize', web: webSanitize as unknown as Ns, core: coreSanitize as unknown as Ns },
  { name: 'mind/moves', web: webMoves as unknown as Ns, core: coreMoves as unknown as Ns },
  { name: 'mind/composeSession', web: webCompose as unknown as Ns, core: coreCompose as unknown as Ns },
  { name: 'mind/blueprints', web: webBlueprints as unknown as Ns, core: coreBlueprints as unknown as Ns },
  { name: 'mind/bodies', web: webBodies as unknown as Ns, core: coreBodies as unknown as Ns },
  { name: 'mind/openings', web: webOpenings as unknown as Ns, core: coreOpenings as unknown as Ns },
  { name: 'mind/slots', web: webSlots as unknown as Ns, core: coreSlots as unknown as Ns },
  { name: 'mind/moveBuilders', web: webBuilders as unknown as Ns, core: coreBuilders as unknown as Ns },
  { name: 'mind/library', web: webLibrary as unknown as Ns, core: coreLibrary as unknown as Ns },
  { name: 'mind/validateMove', web: webValidate as unknown as Ns, core: coreValidate as unknown as Ns },
  { name: 'mind/sessionPath', web: webPath as unknown as Ns, core: corePath as unknown as Ns },
  { name: 'mind/recommendSegment', web: webRecommend as unknown as Ns, core: coreRecommend as unknown as Ns },
  { name: 'mind/suggestActions', web: webSuggest as unknown as Ns, core: coreSuggest as unknown as Ns },
  { name: 'mind/suggestedProtocols', web: webProtocols as unknown as Ns, core: coreProtocols as unknown as Ns },
  { name: 'mind/moodBridge', web: webMood as unknown as Ns, core: coreMood as unknown as Ns },
  { name: 'mind/autoStart', web: webAutoStart as unknown as Ns, core: coreAutoStart as unknown as Ns },
  { name: 'mind/introFlows', web: webIntros as unknown as Ns, core: coreIntros as unknown as Ns },
  { name: 'mind/speechMatch', web: webSpeech as unknown as Ns, core: coreSpeech as unknown as Ns },
  { name: 'mind/recentFeeling', web: webFeeling as unknown as Ns, core: coreFeeling as unknown as Ns },
  { name: 'mind/rotation', web: webRotation as unknown as Ns, core: coreRotation as unknown as Ns },
]

// ── Fixture spread: seeds × chapters × states × path positions ────────────────

const STATES: (MindState | null)[] = [null, 'stressed', 'distracted', 'low_energy', 'locked_in']
const SEEDS = [0, 1, 2, 3, 7, 11, 42, 99, 365]
const PATH_POSITIONS: (number | null)[] = [null, 0, 4, 9, 13, 20, 31, 49]
const SYSTEMS = ['state-shift', 'self-image', 'vision', 'mission', 'discipline', 'anti-sabotage', 'social']
const ALL_KINDS: MoveKind[] = [
  'state-check', 'breath', 'identity', 'win', 'challenge', 'mission', 'vision', 'antisabotage',
  'social', 'mirror', 'choice', 'type', 'speak', 'assemble', 'compose', 'acknowledge',
  'interrogative', 'contrast',
]

const T0 = 1_759_000_000_000

interface CaseInput {
  name: string
  chapter: number
  seed: number
  dayOfYear: number
  recentState: MindState | null
  recentFeeling: string | null
  identityStatement: string | null
  missionAction: string | null
  recentKinds: string[] | null
  moodToday: { value: 1 | 2 | 3 | 4 | 5; label: string; at: number } | null
  now: number
  lastBreathAt: number | null
  pathIndex: number | null
}

/** The whole spread: 5 states × 8 path positions × 9 seeds = 360 contexts. */
function cases(): CaseInput[] {
  const out: CaseInput[] = []
  let i = 0
  for (const recentState of STATES) {
    for (const pathIndex of PATH_POSITIONS) {
      for (const seed of SEEDS) {
        out.push({
          name: `state=${recentState ?? 'none'} path=${pathIndex ?? 'off'} seed=${seed}`,
          chapter: (i % 5) + 1,
          seed,
          dayOfYear: 1 + (i % 366),
          recentState,
          recentFeeling: i % 3 === 0 ? 'Drained' : null,
          identityStatement: i % 2 === 0 ? 'I am the person who keeps their word.' : null,
          missionAction: i % 4 === 0 ? 'Train before the day starts.' : null,
          recentKinds: i % 5 === 0 ? ['identity', 'speak'] : i % 7 === 0 ? ['mirror', 'compose', 'type'] : null,
          moodToday: i % 6 === 0 ? { value: 2, label: 'Low', at: T0 - 3_600_000 } : null,
          now: T0,
          lastBreathAt: i % 4 === 1 ? T0 - 60_000 : i % 9 === 0 ? T0 - 5 * 60 * 60 * 1000 : null,
          pathIndex,
        })
        i++
      }
    }
  }
  return out
}

const CASES = cases()

/** Build the context with the WEB path + chapter helpers. */
function webContext(c: CaseInput): SessionContext {
  return {
    chapter: c.chapter,
    unlockedSystems: webXP.getUnlockedSystems(c.chapter),
    recentState: c.recentState,
    recentFeeling: c.recentFeeling,
    identityStatement: c.identityStatement,
    missionAction: c.missionAction,
    recentKinds: c.recentKinds,
    moodToday: c.moodToday,
    pathFocus: c.pathIndex === null ? null : webPath.getPathSession(c.pathIndex),
    dayOfYear: c.dayOfYear,
    seed: c.seed,
    now: c.now,
    lastBreathAt: c.lastBreathAt,
  }
}

/** Build the same context with the COPIES' path + chapter helpers. */
function coreContext(c: CaseInput): SessionContext {
  return {
    chapter: c.chapter,
    unlockedSystems: coreXP.getUnlockedSystems(c.chapter),
    recentState: c.recentState,
    recentFeeling: c.recentFeeling,
    identityStatement: c.identityStatement,
    missionAction: c.missionAction,
    recentKinds: c.recentKinds,
    moodToday: c.moodToday,
    pathFocus: c.pathIndex === null ? null : corePath.getPathSession(c.pathIndex),
    dayOfYear: c.dayOfYear,
    seed: c.seed,
    now: c.now,
    lastBreathAt: c.lastBreathAt,
  }
}

/** JSON round-trip so an absent key and an explicit `undefined` compare equal. */
function plain(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value ?? null))
}

const SPEECH_CASES: { label: string; target: string; spoken: string }[] = [
  { label: 'verbatim', target: 'I am the person who keeps their word', spoken: 'I am the person who keeps their word' },
  {
    label: 'fillers',
    target: 'I am calm and in control of my attention',
    spoken: 'um like I am basically calm and in control of my attention you know',
  },
  { label: 'interim prefixes', target: 'I choose discipline over comfort', spoken: 'I choose discip over comf' },
  { label: 'prefix boundary', target: 'I choose discipline over comfort', spoken: 'I cho dis ove com' },
  { label: 'prefix below boundary', target: 'I choose discipline over comfort', spoken: 'I ch di ov co' },
  { label: 'mis-hears', target: 'I finish what I start today', spoken: 'I finnish what I start todat' },
  { label: 'misses', target: 'I am the person who keeps their word', spoken: 'I am the who keeps word' },
  { label: 'out of order', target: 'discipline over comfort every single day', spoken: 'every single day comfort over discipline' },
  { label: 'nothing close', target: 'I am calm and in control', spoken: 'what time is dinner' },
  { label: 'empty transcript', target: 'I am calm and in control', spoken: '' },
  { label: 'empty target', target: '', spoken: 'I am calm' },
  { label: 'punctuation', target: "I'm not who I was — I'm becoming.", spoken: "im not who i was, i'm becoming" },
  { label: 'repeated words', target: 'again and again and again', spoken: 'again and again' },
  { label: 'extra tail', target: 'I show up', spoken: 'I show up no matter what happens today' },
]

const XP_VALUES = [0, 1, 25, 49, 50, 51, 74, 125, 150, 224, 300, 499, 500, 501, 1000, 2500, -5, 12.7]
const SESSION_COUNTS = [0, 1, 5, 9, 10, 11, 19, 20, 29, 30, 39, 40, 49, 50, 51, 120, -3]

// ─────────────────────────────────────────────────────────────────────────────

describe('Mind parity: web modules vs the @become/core copies (e015c7fe)', () => {
  it('covers all 22 copied modules', () => {
    assert.equal(MODULE_PAIRS.length, 22)
  })

  it('exports the same names from every copied module', () => {
    for (const { name, web, core } of MODULE_PAIRS) {
      assert.deepEqual(
        Object.keys(core).sort(),
        Object.keys(web).sort(),
        `${name}: the copy does not export the same names as the web module`,
      )
    }
  })

  it('exports identical constants (pools, catalogs, chapters, protocols, intros)', () => {
    let compared = 0
    for (const { name, web, core } of MODULE_PAIRS) {
      for (const key of Object.keys(web)) {
        const value = web[key]
        if (typeof value === 'function') continue // exercised below, on fixtures
        assert.deepEqual(
          plain(core[key]),
          plain(value),
          `${name}.${key} drifted between the web and the copy`,
        )
        compared++
      }
    }
    // Chapters, breath protocols, the whole content library, every move pool.
    assert.ok(compared >= 40, `expected to compare many constants, compared ${compared}`)
  })

  describe('the deterministic composer (e015c7ff)', () => {
    it('composes the same session for every seed, chapter, state and path position', () => {
      assert.equal(CASES.length, 360)
      for (const c of CASES) {
        assert.deepStrictEqual(
          plain(coreCompose.composeSession(coreContext(c))),
          plain(webCompose.composeSession(webContext(c))),
          `composeSession drifted for ${c.name}`,
        )
      }
    })

    it('builds the same session shape, moves and realignment', () => {
      for (const c of CASES) {
        const webShape = webBlueprints.sessionShape(webContext(c))
        const coreShape = coreBlueprints.sessionShape(coreContext(c))
        assert.deepStrictEqual(plain(coreShape), plain(webShape), `sessionShape drifted for ${c.name}`)

        assert.deepStrictEqual(
          plain(coreBlueprints.shapeMoves(coreShape, coreContext(c))),
          plain(webBlueprints.shapeMoves(webShape, webContext(c))),
          `shapeMoves drifted for ${c.name}`,
        )

        for (const live of ['stressed', 'distracted', 'low_energy', 'locked_in'] as MindState[]) {
          assert.deepStrictEqual(
            plain(coreBlueprints.realignOpening(coreShape.opening.id, live, coreContext(c))),
            plain(webBlueprints.realignOpening(webShape.opening.id, live, webContext(c))),
            `realignOpening(${live}) drifted for ${c.name}`,
          )
        }
      }
    })

    it('composes the same themed session for every system', () => {
      for (const c of CASES) {
        for (const system of [...SYSTEMS, 'not-a-system']) {
          assert.deepStrictEqual(
            plain(coreCompose.composeThemedSession(system, coreContext(c))),
            plain(webCompose.composeThemedSession(system, webContext(c))),
            `composeThemedSession(${system}) drifted for ${c.name}`,
          )
          assert.equal(
            coreCompose.systemHasScene(system),
            webCompose.systemHasScene(system),
            `systemHasScene(${system}) drifted`,
          )
        }
      }
    })

    it('builds the same single-move plans and the same move per kind', () => {
      for (const c of CASES.slice(0, 40)) {
        for (const system of [...SYSTEMS, 'not-a-system']) {
          assert.deepStrictEqual(
            plain(coreCompose.singleMovePlan(system, coreContext(c))),
            plain(webCompose.singleMovePlan(system, webContext(c))),
            `singleMovePlan(${system}) drifted for ${c.name}`,
          )
        }
        for (const kind of ALL_KINDS) {
          assert.deepStrictEqual(
            plain(coreBuilders.buildMove(kind, coreContext(c))),
            plain(webBuilders.buildMove(kind, webContext(c))),
            `buildMove(${kind}) drifted for ${c.name}`,
          )
        }
      }
    })

    it('resolves the same openings, bodies and slots', () => {
      for (const state of [...STATES, undefined]) {
        assert.deepStrictEqual(
          plain(coreOpenings.openingFor(state)),
          plain(webOpenings.openingFor(state)),
          `openingFor(${state ?? 'undefined'}) drifted`,
        )
      }
      for (const c of CASES.slice(0, 60)) {
        assert.equal(
          coreBodies.shapeForSeed(coreContext(c)),
          webBodies.shapeForSeed(webContext(c)),
          `shapeForSeed drifted for ${c.name}`,
        )
        for (const shape of ['reflect', 'evidence', 'commit', 'envision', 'defend', 'connect'] as const) {
          assert.deepStrictEqual(
            plain(coreBodies.bodyFor(shape, coreContext(c))),
            plain(webBodies.bodyFor(shape, webContext(c))),
            `bodyFor(${shape}) drifted for ${c.name}`,
          )
        }
        const webSlot = webBodies.bodyFor('reflect', webContext(c)).core
        const coreSlot = coreBodies.bodyFor('reflect', coreContext(c)).core
        assert.deepStrictEqual(
          plain(coreSlots.resolveSlot(coreSlot, coreContext(c))),
          plain(webSlots.resolveSlot(webSlot, webContext(c))),
          `resolveSlot drifted for ${c.name}`,
        )
        assert.deepStrictEqual(
          plain(coreSlots.slotMove(coreSlot, coreContext(c))),
          plain(webSlots.slotMove(webSlot, webContext(c))),
          `slotMove drifted for ${c.name}`,
        )
        assert.equal(
          coreSlots.breathOnCooldown(coreContext(c)),
          webSlots.breathOnCooldown(webContext(c)),
          `breathOnCooldown drifted for ${c.name}`,
        )
      }
    })

    it('walks the same 50-session path', () => {
      for (let n = -2; n <= 55; n++) {
        assert.deepStrictEqual(
          plain(corePath.getPathSession(n)),
          plain(webPath.getPathSession(n)),
          `getPathSession(${n}) drifted`,
        )
      }
    })
  })

  describe('XP, levels and chapters', () => {
    it('resolves the same level progress', () => {
      for (const xp of XP_VALUES) {
        assert.deepStrictEqual(
          plain(coreXP.getLevelProgress(xp)),
          plain(webXP.getLevelProgress(xp)),
          `getLevelProgress(${xp}) drifted`,
        )
      }
      for (let level = 1; level <= 25; level++) {
        assert.equal(coreXP.xpForLevelStep(level), webXP.xpForLevelStep(level), `xpForLevelStep(${level}) drifted`)
        assert.equal(
          coreXP.cumulativeXpForLevel(level),
          webXP.cumulativeXpForLevel(level),
          `cumulativeXpForLevel(${level}) drifted`,
        )
      }
    })

    it('resolves the same chapter from the main-session count', () => {
      for (const n of SESSION_COUNTS) {
        assert.equal(coreXP.chapterFromSessions(n), webXP.chapterFromSessions(n), `chapterFromSessions(${n}) drifted`)
        assert.deepStrictEqual(
          plain(coreXP.sessionsIntoChapter(n)),
          plain(webXP.sessionsIntoChapter(n)),
          `sessionsIntoChapter(${n}) drifted`,
        )
      }
      for (let chapter = 0; chapter <= 6; chapter++) {
        assert.deepEqual(coreXP.getUnlockedSystems(chapter), webXP.getUnlockedSystems(chapter))
        for (const xp of XP_VALUES) {
          assert.deepStrictEqual(
            plain(coreXP.getXpToNextChapter(chapter, xp)),
            plain(webXP.getXpToNextChapter(chapter, xp)),
            `getXpToNextChapter(${chapter}, ${xp}) drifted`,
          )
          assert.equal(coreXP.isReadyToLevelUp(chapter, xp), webXP.isReadyToLevelUp(chapter, xp))
        }
      }
      for (const point of ['building', 'leveling_up', 'starting', '']) {
        assert.equal(coreXP.startingChapterForPoint(point), webXP.startingChapterForPoint(point))
      }
      for (const xp of [0, 599, 600, 749, 1000, 3000, 9999]) {
        assert.deepStrictEqual(plain(coreXP.getCurrentMilestone(xp)), plain(webXP.getCurrentMilestone(xp)))
        assert.deepStrictEqual(plain(coreXP.getNextMilestone(xp)), plain(webXP.getNextMilestone(xp)))
      }
    })

    it('gates the main session on the same 20h cooldown', () => {
      const lasts: (number | null | undefined)[] = [
        null,
        undefined,
        T0,
        T0 - 19 * 60 * 60 * 1000,
        T0 - 20 * 60 * 60 * 1000,
        T0 - 48 * 60 * 60 * 1000,
        Number.NaN,
      ]
      for (const last of lasts) {
        assert.equal(
          coreXP.mainSessionAvailable(last, T0),
          webXP.mainSessionAvailable(last, T0),
          `mainSessionAvailable(${String(last)}) drifted`,
        )
      }
      assert.equal(
        coreXP.mainSessionAvailable(new Date(T0 - 21 * 60 * 60 * 1000).toISOString(), T0),
        webXP.mainSessionAvailable(new Date(T0 - 21 * 60 * 60 * 1000).toISOString(), T0),
      )
    })
  })

  describe('the speech matcher', () => {
    it('matches transcripts with fillers and misses identically', () => {
      for (const { label, target, spoken } of SPEECH_CASES) {
        assert.deepStrictEqual(
          plain(coreSpeech.matchSpeech(target, spoken)),
          plain(webSpeech.matchSpeech(target, spoken)),
          `matchSpeech drifted on the ${label} transcript`,
        )
      }
    })

    it('normalizes and compares words identically', () => {
      const texts = ["Hello, WORLD! It's me.", 'ALL  CAPS   spaced', 'punct!?;: only', '', "don't — stop", '¡Vámonos! 42 días']
      for (const text of texts) {
        assert.deepEqual(coreSpeech.normalizeWords(text), webSpeech.normalizeWords(text), `normalizeWords drifted on "${text}"`)
      }
      const words = [
        'discipline', 'discip', 'dis', 'di', 'disciplined', 'calm', 'clam', 'focus', 'focu', 'foc',
        'water', 'i', "i'm", 'im', 'be', 'become', 'com', 'comfort', 'cho', 'choose',
      ]
      for (const a of words) {
        for (const b of words) {
          assert.equal(coreSpeech.wordsClose(a, b), webSpeech.wordsClose(a, b), `wordsClose("${a}","${b}") drifted`)
        }
      }
    })
  })

  describe('the rest of the copied modules', () => {
    it('validates moves identically', () => {
      const statements = [
        'I am calm',
        'I am the person who keeps their word no matter how loud the day gets and then some more words',
        '',
        '   ',
        'As an AI language model, I cannot do that.',
        '**I am** disciplined',
        42,
        null,
      ]
      for (const kind of ALL_KINDS) {
        assert.equal(coreValidate.canClose(kind), webValidate.canClose(kind), `canClose(${kind}) drifted`)
        for (const raw of statements) {
          assert.equal(
            coreValidate.validateStatement(raw, kind),
            webValidate.validateStatement(raw, kind),
            `validateStatement(${JSON.stringify(raw)}, ${kind}) drifted`,
          )
        }
      }
      for (const raw of statements) {
        if (typeof raw === 'string') assert.equal(coreValidate.isSayable(raw), webValidate.isSayable(raw))
        assert.equal(coreValidate.validateTitle(raw), webValidate.validateTitle(raw))
        assert.equal(coreValidate.validateSubtitle(raw), webValidate.validateSubtitle(raw))
        assert.equal(coreValidate.validatePrompt(raw), webValidate.validatePrompt(raw))
      }
      for (const state of [...STATES, undefined]) {
        assert.equal(coreValidate.isDownState(state), webValidate.isDownState(state))
      }
      assert.deepStrictEqual(
        plain(coreValidate.validateOptions([{ label: 'Yes', response: 'Good' }, { label: '' }])),
        plain(webValidate.validateOptions([{ label: 'Yes', response: 'Good' }, { label: '' }])),
      )
      assert.deepStrictEqual(
        plain(coreValidate.validateCompose({ template: 'I am {0}', blanks: [['calm', 'ready']] })),
        plain(webValidate.validateCompose({ template: 'I am {0}', blanks: [['calm', 'ready']] })),
      )
      assert.equal(coreValidate.restates('I am calm', 'i am calm!'), webValidate.restates('I am calm', 'i am calm!'))
    })

    it('sanitizes model output identically', () => {
      const texts = [
        '**Bold** and *italic* with `code`',
        '# Header\n\n- item 1\n- item 2',
        '"Quoted"',
        '“Smart quotes”',
        'As an AI, I think you should try this.',
        'A very long title that runs on and on and on with many many words in it so the clamp has something to do',
        'Does this ask a question?',
      ]
      for (const text of texts) {
        assert.equal(coreSanitize.stripMarkdown(text), webSanitize.stripMarkdown(text))
        assert.equal(coreSanitize.cleanReply(text), webSanitize.cleanReply(text))
        assert.equal(coreSanitize.stripAiLeakage(text), webSanitize.stripAiLeakage(text))
        assert.equal(coreSanitize.clampWords(text, 6), webSanitize.clampWords(text, 6))
        assert.equal(coreSanitize.clampTitle(text), webSanitize.clampTitle(text))
        assert.equal(coreSanitize.stripQuotes(text), webSanitize.stripQuotes(text))
        assert.equal(coreSanitize.trailingQuestion(text), webSanitize.trailingQuestion(text))
      }
      const raw: unknown = [
        { title: 'Step 1', body: 'Do this.' },
        { title: 'Step 2', inputPrompt: 'How was it?' },
        { title: 'Step 3', choices: ['a', 'b'] },
        { title: '', body: 'dropped' },
      ]
      assert.deepStrictEqual(plain(coreSanitize.validateGuidedSteps(raw)), plain(webSanitize.validateGuidedSteps(raw)))
      assert.deepStrictEqual(plain(coreSanitize.validateGuidedSteps(null)), plain(webSanitize.validateGuidedSteps(null)))
      assert.deepStrictEqual(
        plain(coreSanitize.ensureStepAsks({ title: 'Step', body: 'No question here.' })),
        plain(webSanitize.ensureStepAsks({ title: 'Step', body: 'No question here.' })),
      )
    })

    it('recommends the same segment and the same suggested actions', () => {
      for (const state of [...STATES, undefined]) {
        for (const kinds of [[], ['challenge'], ['antisabotage'], ['social'], ['vision'], ['mission'], ['win', 'identity']]) {
          for (const unlocked of [undefined, [], ['state-shift'], webXP.getUnlockedSystems(3), webXP.getUnlockedSystems(5)]) {
            assert.deepStrictEqual(
              plain(coreRecommend.recommendSegment({ state, moveKinds: kinds, unlocked })),
              plain(webRecommend.recommendSegment({ state, moveKinds: kinds, unlocked })),
              `recommendSegment drifted for ${state ?? 'none'}/${kinds.join(',')}`,
            )
          }
        }
        for (const seed of SEEDS) {
          for (const unlocked of [undefined, ['self-image'], webXP.getUnlockedSystems(2), webXP.getUnlockedSystems(5)]) {
            assert.deepStrictEqual(
              plain(coreSuggest.suggestActions({ state, unlocked, seed })),
              plain(webSuggest.suggestActions({ state, unlocked, seed })),
              `suggestActions drifted for ${state ?? 'none'}/seed ${seed}`,
            )
          }
        }
      }
      for (const system of [...SYSTEMS, 'not-a-system']) {
        for (const id of ['', 'name-the-next-action', 'identity-installation']) {
          assert.deepStrictEqual(
            plain(coreProtocols.findProtocol(system, id)),
            plain(webProtocols.findProtocol(system, id)),
            `findProtocol(${system}, ${id}) drifted`,
          )
        }
      }
    })

    it('bridges mood identically', () => {
      for (const n of [0, 1, 2, 3, 4, 5, 6, 2.5, -1]) {
        assert.equal(coreMood.isMoodLevel(n), webMood.isMoodLevel(n), `isMoodLevel(${n}) drifted`)
      }
      for (const mood of [1, 2, 3, 4, 5] as const) {
        assert.equal(coreMood.seedStateForMood(mood), webMood.seedStateForMood(mood))
        assert.deepEqual(coreMood.feelingOrderForMood(mood), webMood.feelingOrderForMood(mood))
        assert.deepStrictEqual(plain(coreMood.moodGateway(mood)), plain(webMood.moodGateway(mood)))
        for (const ago of [0, 60_000, 3 * 3_600_000, 13 * 3_600_000]) {
          const today = { value: mood, label: webMood.MOOD_LABELS[mood], at: T0 - ago }
          assert.equal(
            coreMood.moodOpenerLine(today, T0),
            webMood.moodOpenerLine(today, T0),
            `moodOpenerLine(${mood}, ${ago}ms ago) drifted`,
          )
        }
      }
      assert.deepEqual(coreMood.feelingOrderForMood(null), webMood.feelingOrderForMood(null))
    })

    it('decides auto-start, feeling labels and daily rotation identically', () => {
      const flags = [true, false]
      for (const autoStart of flags) {
        for (const alreadyStarted of flags) {
          for (const loading of flags) {
            for (const playing of flags) {
              for (const onboarded of [true, false, null]) {
                for (const available of flags) {
                  for (const hasPlan of flags) {
                    const input = { autoStart, alreadyStarted, loading, playing, onboarded, available, hasPlan }
                    assert.equal(
                      coreAutoStart.shouldAutoStartMindSession(input),
                      webAutoStart.shouldAutoStartMindSession(input),
                      `shouldAutoStartMindSession drifted for ${JSON.stringify(input)}`,
                    )
                  }
                }
              }
            }
          }
        }
      }

      for (const state of ['stressed', 'distracted', 'low_energy', 'locked_in'] as MindState[]) {
        for (const feeling of [undefined, null, '', '  ', 'Grateful', 'Drained']) {
          assert.equal(
            coreFeeling.recentFeelingLabel(state, feeling),
            webFeeling.recentFeelingLabel(state, feeling),
            `recentFeelingLabel(${state}, ${JSON.stringify(feeling)}) drifted`,
          )
          assert.equal(coreFeeling.isFallbackLabel(feeling), webFeeling.isFallbackLabel(feeling))
        }
      }

      for (const iso of ['2026-01-01T12:00:00Z', '2026-02-28T23:59:00Z', '2026-09-30T00:00:00Z', '2026-12-31T12:00:00Z']) {
        const d = new Date(iso)
        assert.equal(coreRotation.dayOfYear(d), webRotation.dayOfYear(d), `dayOfYear(${iso}) drifted`)
      }
      // No date parameter: both read the same clock microseconds apart.
      for (const len of [0, 1, 3, 7, 30]) {
        for (const salt of [0, 1, 5]) {
          assert.equal(coreRotation.dailyIndex(len, salt), webRotation.dailyIndex(len, salt), `dailyIndex(${len},${salt}) drifted`)
        }
      }
      const pool = ['a', 'b', 'c', 'd']
      for (const salt of [0, 1, 2, 3]) {
        assert.equal(coreRotation.dailyPick(pool, salt), webRotation.dailyPick(pool, salt))
      }
      assert.equal(coreRotation.dailyPick([], 0), webRotation.dailyPick([], 0))
    })

    it('serves the same content pieces and intro flows', () => {
      for (const state of ['stressed', 'distracted', 'low_energy', 'locked_in'] as MindState[]) {
        for (const offset of [0, 1, 2, 7]) {
          assert.deepStrictEqual(
            plain(coreContent.getDailyPiece(state, offset)),
            plain(webContent.getDailyPiece(state, offset)),
            `getDailyPiece(${state}, ${offset}) drifted`,
          )
        }
      }
      for (const section of ['home', 'state-shift', 'self-image', 'mission', 'discipline', 'anti-sabotage', 'social'] as const) {
        assert.deepStrictEqual(
          plain(coreContent.getPiecesBySection(section)),
          plain(webContent.getPiecesBySection(section)),
          `getPiecesBySection(${section}) drifted`,
        )
      }
      assert.deepEqual(Object.keys(coreIntros.INTRO_FLOWS), Object.keys(webIntros.INTRO_FLOWS))
      for (const state of [...STATES, undefined]) {
        assert.deepStrictEqual(plain(coreMoves.breathForState(state)), plain(webMoves.breathForState(state)))
      }
    })
  })
})

// ─────────────────────────────────────────────────────────────────────────────

describe('Mind parity fixtures: the file the native app is held to (e015c7ff)', () => {
  const FIXTURE_PATH = path.resolve(__dirname, '../../../shared/core/tests/fixtures/mindParity.json')
  const REGEN = 'Re-run `cd webapp && npx tsx scripts/gen-mind-fixtures.ts` (and `node scripts/vendor-mind.mjs`).'

  interface Fixture {
    clock: number
    composeSession: { name: string; ctx: CaseInput & { pathIndex: number | null }; expected: unknown }[]
    composeThemedSession: { system: string; name: string; ctx: CaseInput; expected: unknown }[]
    singleMovePlan: { system: string; ctx: CaseInput; expected: unknown }[]
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

  const fixture = JSON.parse(fs.readFileSync(FIXTURE_PATH, 'utf8')) as Fixture

  it('is a real spread of seeds, chapters, states and path positions', () => {
    assert.ok(fixture.composeSession.length >= 25, 'fixture lost its session spread')
    assert.ok(fixture.composeThemedSession.length >= 14, 'fixture lost its themed spread')
    assert.ok(fixture.matchSpeech.length >= 8, 'fixture lost its transcripts')
    const openings = new Set(
      fixture.composeSession.map((c) => (c.expected as { openingId?: string }).openingId),
    )
    assert.equal(openings.size, 5, 'fixture must exercise every state opening')
    const shapes = new Set(
      fixture.composeSession.map((c) => (c.expected as { blueprintId?: string }).blueprintId?.split('/')[1]),
    )
    assert.equal(shapes.size, 6, 'fixture must exercise every path body shape')
  })

  it('still matches what the WEB composer produces', () => {
    for (const c of fixture.composeSession) {
      assert.deepStrictEqual(plain(webCompose.composeSession(webContext(c.ctx))), c.expected, `${c.name}: ${REGEN}`)
    }
    for (const c of fixture.composeThemedSession) {
      assert.deepStrictEqual(
        plain(webCompose.composeThemedSession(c.system, webContext(c.ctx))),
        c.expected,
        `${c.name}: ${REGEN}`,
      )
    }
    for (const c of fixture.singleMovePlan) {
      assert.deepStrictEqual(plain(webCompose.singleMovePlan(c.system, webContext(c.ctx))), c.expected, `${c.system}: ${REGEN}`)
    }
  })

  it('still matches the WEB XP, chapter and speech maths', () => {
    for (const c of fixture.getLevelProgress) {
      assert.deepStrictEqual(plain(webXP.getLevelProgress(c.levelXp)), c.expected, `getLevelProgress(${c.levelXp}): ${REGEN}`)
    }
    for (const c of fixture.chapterFromSessions) {
      assert.equal(webXP.chapterFromSessions(c.mainSessionCount), c.expected, `chapterFromSessions: ${REGEN}`)
      assert.deepStrictEqual(plain(webXP.sessionsIntoChapter(c.mainSessionCount)), c.sessionsIntoChapter, REGEN)
      assert.deepEqual(webXP.getUnlockedSystems(c.expected), c.unlockedSystems, REGEN)
      assert.deepStrictEqual(plain(webXP.getXpToNextChapter(c.expected, 120)), c.xpToNextChapter, REGEN)
      assert.deepStrictEqual(plain(webPath.getPathSession(c.mainSessionCount)), c.pathSession, REGEN)
    }
    for (const c of fixture.mainSessionAvailable) {
      assert.equal(webXP.mainSessionAvailable(c.lastMainSessionAt, c.now), c.expected, `mainSessionAvailable: ${REGEN}`)
    }
    for (const c of fixture.matchSpeech) {
      assert.deepStrictEqual(plain(webSpeech.matchSpeech(c.target, c.spoken)), c.expected, `matchSpeech("${c.spoken}"): ${REGEN}`)
    }
  })

  it('matches what the @become/core copies produce — the same answers the native app gets', () => {
    for (const c of fixture.composeSession) {
      assert.deepStrictEqual(plain(coreCompose.composeSession(coreContext(c.ctx))), c.expected, `${c.name}: ${REGEN}`)
    }
    for (const c of fixture.composeThemedSession) {
      assert.deepStrictEqual(
        plain(coreCompose.composeThemedSession(c.system, coreContext(c.ctx))),
        c.expected,
        `${c.name}: ${REGEN}`,
      )
    }
    for (const c of fixture.getLevelProgress) {
      assert.deepStrictEqual(plain(coreXP.getLevelProgress(c.levelXp)), c.expected, REGEN)
    }
    for (const c of fixture.chapterFromSessions) {
      assert.equal(coreXP.chapterFromSessions(c.mainSessionCount), c.expected, REGEN)
    }
    for (const c of fixture.mainSessionAvailable) {
      assert.equal(coreXP.mainSessionAvailable(c.lastMainSessionAt, c.now), c.expected, REGEN)
    }
    for (const c of fixture.matchSpeech) {
      assert.deepStrictEqual(plain(coreSpeech.matchSpeech(c.target, c.spoken)), c.expected, REGEN)
    }
  })
})
