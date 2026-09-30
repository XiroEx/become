/**
 * Generates the Mind parity fixtures FROM THE WEB MODULES (the source of truth).
 *
 *   cd webapp && npx tsx scripts/gen-mind-fixtures.ts
 *
 * Output: shared/core/tests/fixtures/mindParity.json — the same seeds, chapters,
 * states and path positions, with the plan the WEB composer produces for each.
 *
 * Three suites read that file, so the web, the vendored copy and the native app
 * are pinned to one set of answers (NP-017 / NP-062):
 *   - webapp/tests/unit/mindParity.test.ts   web modules  === fixture (and === copy)
 *   - shared/core/tests/mind.test.ts         @become/core === fixture
 *   - expo/__tests__/mind.test.ts            @become/core === fixture, natively
 *
 * Composer/XP changes land on the web first: re-run the vendor script and this
 * generator in the same commit, or the webapp CI job fails.
 */

import fs from 'node:fs'
import path from 'node:path'

import { composeSession, composeThemedSession, singleMovePlan, systemHasScene } from '@/lib/mind/composeSession'
import { getPathSession, SESSION_PATH } from '@/lib/mind/sessionPath'
import { matchSpeech } from '@/lib/mind/speechMatch'
import {
  chapterFromSessions,
  getLevelProgress,
  getUnlockedSystems,
  getXpToNextChapter,
  mainSessionAvailable,
  sessionsIntoChapter,
} from '@/lib/mindXP'
import type { MindState } from '@/lib/mindContent'
import type { SessionContext } from '@/lib/mind/moves'

/** A JSON-safe session context. `pathIndex` resolves through getPathSession(). */
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
  /** Index into SESSION_PATH (0 = session 1); null = off-path. */
  pathIndex: number | null
}

const STATES: (MindState | null)[] = [null, 'stressed', 'distracted', 'low_energy', 'locked_in']
const SEEDS = [0, 1, 2, 3, 7, 11, 42, 99, 365]
// Off-path plus positions that between them hit every body shape (reflect,
// evidence, commit, envision, defend, connect): sessions 1, 10, 21, 32, 49, 50.
// The webapp parity test walks a WIDER spread in code — the fixture is the pinned
// subset the native app is held to, so it stays readable in review.
const PATH_POSITIONS: (number | null)[] = [null, 0, 9, 20, 31, 48, 49]
const SYSTEMS = ['state-shift', 'self-image', 'vision', 'mission', 'discipline', 'anti-sabotage', 'social']

const T0 = 1_759_000_000_000 // fixed clock: 2025-09-27T20:26:40Z

/** Build the fixture contexts: a deterministic spread, not a full cross product. */
function sessionCases(): { name: string; ctx: CaseCtx }[] {
  const cases: { name: string; ctx: CaseCtx }[] = []
  let i = 0
  for (const state of STATES) {
    for (const pathIndex of PATH_POSITIONS) {
      const seed = SEEDS[i % SEEDS.length]
      const chapter = pathIndex === null ? ((i % 5) + 1) : (SESSION_PATH[pathIndex]?.chapter ?? 1)
      cases.push({
        name: `state=${state ?? 'none'} path=${pathIndex ?? 'off'} seed=${seed} chapter=${chapter}`,
        ctx: {
          chapter,
          seed,
          dayOfYear: 100 + i,
          recentState: state,
          recentFeeling: i % 3 === 0 ? 'Drained' : null,
          identityStatement: i % 2 === 0 ? 'I am the person who keeps their word.' : null,
          missionAction: i % 4 === 0 ? 'Train before the day starts.' : null,
          recentKinds: i % 5 === 0 ? ['identity', 'speak'] : null,
          moodToday: i % 6 === 0 ? { value: 2, label: 'Low', at: T0 - 3_600_000 } : null,
          now: T0,
          lastBreathAt: i % 4 === 1 ? T0 - 60_000 : null,
          pathIndex,
        },
      })
      i++
    }
  }
  return cases
}

/** Rebuild a real SessionContext from a JSON-safe case. */
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

/** JSON round-trip so `undefined` keys never make a fixture mismatch. */
function plain<T>(value: T): unknown {
  return JSON.parse(JSON.stringify(value ?? null))
}

const SPEECH_CASES = [
  // Verbatim.
  { target: 'I am the person who keeps their word', spoken: 'I am the person who keeps their word' },
  // Fillers inserted by the recognizer / the speaker.
  { target: 'I am calm and in control of my attention', spoken: 'um like I am basically calm and in control of my attention you know' },
  // Partial interim output (prefix matching).
  { target: 'I choose discipline over comfort', spoken: 'I choose discip over comf' },
  // The prefix boundary: 3 characters is close enough, 2 is not.
  { target: 'I choose discipline over comfort', spoken: 'I cho dis ove com' },
  // Mis-hears within edit distance 1.
  { target: 'I finish what I start today', spoken: 'I finnish what I start todat' },
  // Skipped words (misses).
  { target: 'I am the person who keeps their word', spoken: 'I am the who keeps word' },
  // Out of order — the greedy alignment only moves forward.
  { target: 'discipline over comfort every single day', spoken: 'every single day comfort over discipline' },
  // Nothing close at all.
  { target: 'I am calm and in control', spoken: 'what time is dinner' },
  // Empty transcript.
  { target: 'I am calm and in control', spoken: '' },
  // Empty target.
  { target: '', spoken: 'I am calm' },
  // Apostrophes: "im" is not close to "i'm" (both too short), and the greedy
  // pointer then consumes ahead — pinned because it is real behaviour.
  { target: "I'm not who I was — I'm becoming.", spoken: "im not who i was, i'm becoming" },
]

const XP_VALUES = [0, 1, 25, 49, 50, 51, 74, 125, 150, 224, 300, 499, 500, 501, 1000, 2500, -5, 12.7]
const SESSION_COUNTS = [0, 1, 5, 9, 10, 11, 19, 20, 29, 30, 39, 40, 49, 50, 51, 120, -3]
const COOLDOWN_CASES = [
  { lastMainSessionAt: null as number | null, now: T0 },
  { lastMainSessionAt: T0, now: T0 },
  { lastMainSessionAt: T0 - 19 * 60 * 60 * 1000, now: T0 },
  { lastMainSessionAt: T0 - 20 * 60 * 60 * 1000, now: T0 },
  { lastMainSessionAt: T0 - 48 * 60 * 60 * 1000, now: T0 },
]

const cases = sessionCases()

const fixture = {
  note: 'GENERATED by webapp/scripts/gen-mind-fixtures.ts from the WEB Mind modules. Do not edit by hand.',
  clock: T0,
  composeSession: cases.map(({ name, ctx }) => ({
    name,
    ctx,
    expected: plain(composeSession(toContext(ctx))),
  })),
  composeThemedSession: SYSTEMS.flatMap((system) =>
    cases
      .filter((_, i) => i % 15 === 0)
      .map(({ name, ctx }) => ({
        system,
        name: `${system} · ${name}`,
        ctx,
        hasScene: systemHasScene(system),
        expected: plain(composeThemedSession(system, toContext(ctx))),
      })),
  ).concat([
    {
      system: 'not-a-system',
      name: 'unknown system · null plan',
      ctx: cases[0].ctx,
      hasScene: systemHasScene('not-a-system'),
      expected: plain(composeThemedSession('not-a-system', toContext(cases[0].ctx))),
    },
  ]),
  singleMovePlan: SYSTEMS.concat(['not-a-system']).map((system) => ({
    system,
    ctx: cases[3].ctx,
    expected: plain(singleMovePlan(system, toContext(cases[3].ctx))),
  })),
  getLevelProgress: XP_VALUES.map((levelXp) => ({ levelXp, expected: plain(getLevelProgress(levelXp)) })),
  chapterFromSessions: SESSION_COUNTS.map((mainSessionCount) => ({
    mainSessionCount,
    expected: chapterFromSessions(mainSessionCount),
    sessionsIntoChapter: plain(sessionsIntoChapter(mainSessionCount)),
    unlockedSystems: getUnlockedSystems(chapterFromSessions(mainSessionCount)),
    xpToNextChapter: plain(getXpToNextChapter(chapterFromSessions(mainSessionCount), 120)),
    pathSession: plain(getPathSession(mainSessionCount)),
  })),
  mainSessionAvailable: COOLDOWN_CASES.map((c) => ({
    ...c,
    expected: mainSessionAvailable(c.lastMainSessionAt, c.now),
  })),
  matchSpeech: SPEECH_CASES.map((c) => ({ ...c, expected: plain(matchSpeech(c.target, c.spoken)) })),
}

const out = path.resolve(__dirname, '../../shared/core/tests/fixtures/mindParity.json')
fs.mkdirSync(path.dirname(out), { recursive: true })
fs.writeFileSync(out, `${JSON.stringify(fixture, null, 2)}\n`, 'utf8')
console.log(
  `Wrote ${path.relative(path.resolve(__dirname, '../..'), out)}: ` +
    `${fixture.composeSession.length} sessions, ${fixture.composeThemedSession.length} themed, ` +
    `${fixture.matchSpeech.length} transcripts.`,
)
