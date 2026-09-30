/**
 * Native Mind parity (NP-062, acceptance e015c7ff).
 *
 * The session path, the deterministic composer, the move builders, the XP and
 * chapter maths and the speech matcher are pure web modules. Native cannot import
 * them (separate `@/` roots), so they are copied into `@become/core`
 * (`shared/core/src`) by `node scripts/vendor-mind.mjs` and reach this app through
 * the Metro link (`"@become/core": "file:../shared/core"` + watchFolders).
 *
 * `shared/core/tests/fixtures/mindParity.json` is GENERATED FROM THE WEB MODULES
 * (`cd webapp && npx tsx scripts/gen-mind-fixtures.ts`), so asserting the native
 * import against it is asserting that the same seed and context compose the same
 * session natively and on the web. The webapp CI job holds the other two ends:
 * webapp/tests/unit/mindDrift.test.ts (the copy is verbatim) and
 * webapp/tests/unit/mindParity.test.ts (the copy and the web agree, and the web
 * still produces this fixture).
 */

import fs from "fs";
import path from "path";

import {
  chapterFromSessions,
  composeSession,
  composeThemedSession,
  getPathSession,
  getUnlockedSystems,
  getXpToNextChapter,
  getLevelProgress,
  mainSessionAvailable,
  matchSpeech,
  normalizeWords,
  sessionsIntoChapter,
  singleMovePlan,
  wordsClose,
  type MindState,
  type SessionContext,
} from "@become/core";
// The subpath export the package publishes, resolved the same way the app would.
import { composeSession as composeSessionFromSubpath } from "@become/core/mind/composeSession";

interface CaseCtx {
  chapter: number;
  seed: number;
  dayOfYear: number;
  recentState: MindState | null;
  recentFeeling?: string | null;
  identityStatement?: string | null;
  missionAction?: string | null;
  recentKinds?: string[] | null;
  moodToday?: { value: 1 | 2 | 3 | 4 | 5; label: string; at: number } | null;
  now?: number;
  lastBreathAt?: number | null;
  pathIndex: number | null;
}

interface Fixture {
  clock: number;
  composeSession: { name: string; ctx: CaseCtx; expected: unknown }[];
  composeThemedSession: {
    system: string;
    name: string;
    ctx: CaseCtx;
    hasScene: boolean;
    expected: unknown;
  }[];
  singleMovePlan: { system: string; ctx: CaseCtx; expected: unknown }[];
  getLevelProgress: { levelXp: number; expected: unknown }[];
  chapterFromSessions: {
    mainSessionCount: number;
    expected: number;
    sessionsIntoChapter: unknown;
    unlockedSystems: string[];
    xpToNextChapter: unknown;
    pathSession: unknown;
  }[];
  mainSessionAvailable: {
    lastMainSessionAt: number | null;
    now: number;
    expected: boolean;
  }[];
  matchSpeech: { target: string; spoken: string; expected: unknown }[];
}

const FIXTURE_PATH = path.resolve(
  __dirname,
  "../../shared/core/tests/fixtures/mindParity.json",
);

const FIXTURE = JSON.parse(fs.readFileSync(FIXTURE_PATH, "utf8")) as Fixture;

const REGEN =
  "The web changed: re-run `node scripts/vendor-mind.mjs` and `cd webapp && npx tsx scripts/gen-mind-fixtures.ts`.";

/** Rebuild a context the way the web does, through the COPIES' own helpers. */
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
  };
}

/** JSON round-trip so an absent key and an explicit `undefined` compare equal. */
function plain(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value ?? null));
}

describe("native Mind parity with the web (e015c7ff)", () => {
  it("reads a real fixture spread of seeds, chapters, states and path positions", () => {
    expect(FIXTURE.composeSession.length).toBeGreaterThanOrEqual(25);
    expect(FIXTURE.composeThemedSession.length).toBeGreaterThanOrEqual(14);
    expect(FIXTURE.matchSpeech.length).toBeGreaterThanOrEqual(8);

    const seeds = new Set(FIXTURE.composeSession.map((c) => c.ctx.seed));
    const states = new Set(FIXTURE.composeSession.map((c) => c.ctx.recentState));
    const positions = new Set(FIXTURE.composeSession.map((c) => c.ctx.pathIndex));
    expect(seeds.size).toBeGreaterThanOrEqual(5);
    expect(states.size).toBe(5);
    expect(positions.size).toBeGreaterThanOrEqual(5);
  });

  it("composes the same session as the web for the same seed and context", () => {
    for (const c of FIXTURE.composeSession) {
      expect(plain(composeSession(toContext(c.ctx)))).toEqual(c.expected);
    }
  });

  it("composes the same session through the published subpath export", () => {
    for (const c of FIXTURE.composeSession.slice(0, 5)) {
      expect(plain(composeSessionFromSubpath(toContext(c.ctx)))).toEqual(
        c.expected,
      );
    }
  });

  it("replays the same plan for the same seed and context", () => {
    for (const c of FIXTURE.composeSession.slice(0, 5)) {
      expect(composeSession(toContext(c.ctx))).toEqual(
        composeSession(toContext(c.ctx)),
      );
    }
  });

  it("composes the same themed and single-move plans as the web", () => {
    for (const c of FIXTURE.composeThemedSession) {
      expect(plain(composeThemedSession(c.system, toContext(c.ctx)))).toEqual(
        c.expected,
      );
    }
    for (const c of FIXTURE.singleMovePlan) {
      expect(plain(singleMovePlan(c.system, toContext(c.ctx)))).toEqual(
        c.expected,
      );
    }
  });

  it("computes the same XP, level and chapter maths as the web", () => {
    for (const c of FIXTURE.getLevelProgress) {
      expect(plain(getLevelProgress(c.levelXp))).toEqual(c.expected);
    }
    for (const c of FIXTURE.chapterFromSessions) {
      expect(chapterFromSessions(c.mainSessionCount)).toBe(c.expected);
      expect(plain(sessionsIntoChapter(c.mainSessionCount))).toEqual(
        c.sessionsIntoChapter,
      );
      expect(getUnlockedSystems(c.expected)).toEqual(c.unlockedSystems);
      expect(plain(getXpToNextChapter(c.expected, 120))).toEqual(
        c.xpToNextChapter,
      );
      expect(plain(getPathSession(c.mainSessionCount))).toEqual(c.pathSession);
    }
  });

  it("gates the main session on the same 20h cooldown as the web", () => {
    for (const c of FIXTURE.mainSessionAvailable) {
      expect(mainSessionAvailable(c.lastMainSessionAt, c.now)).toBe(c.expected);
    }
  });

  it("matches spoken transcripts — fillers and misses — the way the web does", () => {
    for (const c of FIXTURE.matchSpeech) {
      expect(plain(matchSpeech(c.target, c.spoken))).toEqual(c.expected);
    }
    expect(normalizeWords("Hello, WORLD! It's me.")).toEqual([
      "hello",
      "world",
      "it's",
      "me",
    ]);
    expect(wordsClose("discipline", "discip")).toBe(true);
    expect(wordsClose("discipline", "di")).toBe(false);
  });

  it("fails loudly if the fixture is ever hand-edited away from the web", () => {
    // The fixture is generated; a stale copy is exactly what this suite exists to
    // catch, so make the remediation discoverable from the failure itself.
    expect(REGEN).toContain("gen-mind-fixtures");
    const first = FIXTURE.composeSession[0];
    expect(first).toBeDefined();
    expect(plain(composeSession(toContext(first!.ctx)))).toEqual(first!.expected);
  });
});
