/* eslint-disable import/first */
import { act, fireEvent, render } from "@testing-library/react-native";

jest.mock("@/lib/auth/useAuth", () => ({
  useAuth: () => ({
    user: null,
    token: "test-jwt",
    loading: false,
    isAuthed: true,
    setToken: jest.fn(),
    refresh: jest.fn(),
    logout: jest.fn(),
  }),
}));

const mockRunAiTask = jest.fn();
jest.mock("@/lib/ai/runClient", () => ({
  runAiTask: (...args: unknown[]) => mockRunAiTask(...args),
}));

const mockInvalidateMindSession = jest.fn(async () => {});
const mockWarmMindSession = jest.fn(async () => {});
jest.mock("@/lib/mind/sessionCache", () => ({
  invalidateMindSession: () => mockInvalidateMindSession(),
  warmMindSession: () => mockWarmMindSession(),
  MIND_AI_PLAN_KEY: "mind-ai-plan",
}));

jest.mock("@become/api-client", () => {
  const actual = jest.requireActual("@become/api-client");
  return { __esModule: true, ...actual, apiFetch: jest.fn() };
});

import { apiFetch } from "@become/api-client";
import {
  CHAPTERS,
  composeSession,
  realignOpening,
  type MindSessionPlan,
  type SessionContext,
} from "@become/core";
import { SessionPlayer } from "@/components/mind/session/SessionPlayer";
import {
  affirmDisplayLine,
  HOLD_DONE_HOLD_MS,
  HOLD_MS,
} from "@/components/mind/session/scenes/HoldToAffirmScene";
/* eslint-enable import/first */

/**
 * THE MIND SESSION PLAYER, NATIVELY (NP-098 / NP-101).
 *
 * The plan under test is not written here: it is COMPOSED BY THE WEB'S OWN
 * composer (`composeSession`, vendored into `@become/core` by NP-062 and held to
 * the web byte-for-byte by `webapp/tests/unit/mindDrift.test.ts`), from a fixed
 * context and a fixed seed. So "a plan recorded from the web" is literally what
 * plays here, and the expectations for the realignment come from the web's
 * `realignOpening` rather than from a copy of its answer.
 */

const WEB_CONTEXT: SessionContext = {
  chapter: 2,
  unlockedSystems: ["state", "identity", "discipline", "mission", "vision"],
  recentState: "locked_in",
  recentFeeling: "Grateful",
  moodToday: null,
  missionAction: "Ship the first draft",
  identityStatement: "I am someone who keeps their word",
  recentKinds: [],
  pathFocus: null,
  dayOfYear: 120,
  seed: 4242,
  now: 1_700_000_000_000,
  lastBreathAt: null,
};

const WEB_PLAN: MindSessionPlan = composeSession(WEB_CONTEXT);

const mockApiFetch = apiFetch as unknown as jest.Mock;

const P = "mind-session-player";

/** Flush timers AND the promises they release (the check-in reads the server). */
async function flush(ms = 0): Promise<void> {
  await act(async () => {
    if (ms > 0) jest.advanceTimersByTime(ms);
    await Promise.resolve();
  });
}

function stateRequests(method: "GET" | "POST"): unknown[][] {
  return mockApiFetch.mock.calls.filter(
    (c) =>
      String(c[0]).startsWith("/api/mind/state") &&
      ((c[2] as { method?: string } | undefined)?.method ?? "GET") === method,
  );
}

describe("SessionPlayer (NP-098 / NP-101)", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockApiFetch.mockReset();
    mockRunAiTask.mockReset();
    mockRunAiTask.mockResolvedValue({
      ok: true,
      text: "You stayed grounded and focused on what matters.",
    });
    mockInvalidateMindSession.mockClear();
    mockWarmMindSession.mockClear();

    mockApiFetch.mockImplementation((path: string, _schema, init) => {
      const method = (init as { method?: string } | undefined)?.method ?? "GET";
      const clean = String(path).split("?")[0];
      if (clean === "/api/mind/state" && method === "GET") {
        // No check-in in the last four hours → the full 20-feeling grid.
        return Promise.resolve({ logs: [], todayMood: null });
      }
      if (clean === "/api/mind/state" && method === "POST") {
        return Promise.resolve({
          log: {
            _id: "log-1",
            state: (init as { body?: { state?: string } }).body?.state ?? "stressed",
            timestamp: new Date(WEB_CONTEXT.now ?? 0).toISOString(),
          },
          recommendation: { message: "Noted. Let's work with that." },
        });
      }
      if (clean === "/api/mind/session" && method === "POST") {
        return Promise.resolve({
          completions: 1,
          counted: true,
          trainingMode: false,
          xpAwarded: 20,
          levelXp: 120,
          level: 2,
          previousLevel: 1,
          leveledUp: false,
          levelProgress: { level: 2, pct: 20, intoLevel: 20, span: 100, xpToNext: 80 },
          chapter: 1,
          previousChapter: 1,
          chapterAdvanced: false,
          newlyUnlocked: [],
          unlockedSystems: ["state", "identity", "discipline", "mission"],
          currentChapter: CHAPTERS[0],
          mainSessionCount: 1,
          sessionsIntoChapter: { done: 1, needed: 10, toNext: 9 },
          nextMainSessionAt: Date.now() + 20 * 3600 * 1000,
          xpBank: 20,
          streak: 1,
          featureUnlocks: [],
        });
      }
      if (clean === "/api/mind/journal" && method === "POST") {
        return Promise.resolve({ saved: true, id: "journal-1" });
      }
      return Promise.resolve({});
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("the web's composer produced the plan these tests play", () => {
    expect(WEB_PLAN.moves.map((m) => m.kind)).toEqual([
      "state-check",
      "win",
      "mission",
      "speak",
    ]);
    expect(WEB_PLAN.openingId).toBe("open-pour-it-in");
    expect(WEB_PLAN.doneText).toBe("Decided. Now go.");
  });

  // ── Acceptance e015c8de ──────────────────────────────────────────────────
  it("(id: e015c8de) A plan recorded from the web plays natively from intro to payoff, with not-yet-ported kinds shown as hold-to-affirm", async () => {
    const onExit = jest.fn();
    const onComplete = jest.fn();
    const { getByTestId, queryByTestId } = render(
      <SessionPlayer
        plan={WEB_PLAN}
        sessionContext={WEB_CONTEXT}
        onExit={onExit}
        onComplete={onComplete}
      />,
    );

    // Intro: the plan's own words, and one progress segment per move.
    expect(getByTestId(`${P}-intro-title`)).toHaveTextContent("Pour it in");
    expect(getByTestId(`${P}-progress-3`)).toBeTruthy();
    expect(queryByTestId(`${P}-progress-4`)).toBeNull();

    fireEvent.press(getByTestId(`${P}-intro-begin`));

    // Move 1 — the state check. It reads the recent check-in first.
    await flush();
    expect(stateRequests("GET").length).toBe(1);
    expect(getByTestId("mind-state-check-grid")).toBeTruthy();
    fireEvent.press(getByTestId("mind-state-check-feeling-grateful"));
    await flush();
    expect(getByTestId("mind-state-check-message")).toHaveTextContent(
      "Noted. Let's work with that.",
    );
    fireEvent.press(getByTestId("mind-state-check-continue"));

    // Moves 2-4 — win and mission are ported (NP-103); speak is not yet (NP-100)
    // and plays as the web's hold-to-affirm.
    expect(getByTestId("mind-win-scene")).toBeTruthy();
    expect(getByTestId("mind-win-scene-title")).toHaveTextContent(
      WEB_PLAN.moves[1]!.title,
    );
    fireEvent.changeText(
      getByTestId("mind-win-scene-input"),
      "Kept my word on the project",
    );
    fireEvent.press(getByTestId("mind-win-scene-bank-it"));
    await flush();
    await flush(1100);

    expect(getByTestId("mind-mission-scene")).toBeTruthy();
    fireEvent.press(getByTestId("mind-mission-scene-commit"));
    await flush(900);

    expect(getByTestId("mind-hold-affirm")).toBeTruthy();
    expect(getByTestId("mind-hold-affirm-line")).toHaveTextContent(
      affirmDisplayLine(WEB_PLAN.moves[3]!),
    );
    fireEvent(getByTestId("mind-hold-affirm-button"), "pressIn");
    await flush(HOLD_MS);
    expect(getByTestId("mind-hold-affirm-status")).toHaveTextContent(
      "Locked in.",
    );
    await flush(HOLD_DONE_HOLD_MS);

    // Payoff.
    expect(getByTestId(`${P}-payoff`)).toBeTruthy();
    expect(getByTestId(`${P}-payoff-title`)).toHaveTextContent("Decided. Now go.");

    // The completion facts handed to onComplete — the EFFECTIVE kinds, in order, and
    // the check-in recorded as the first answer.
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete.mock.calls[0]![0]).toEqual({
      moves: [
        { kind: "state-check" },
        { kind: "win" },
        { kind: "mission" },
        { kind: "speak" },
      ],
      answers: [
        { q: "How I checked in today", a: "Grateful" },
        {
          q: WEB_PLAN.moves[1]!.prompt ?? WEB_PLAN.moves[1]!.title,
          a: "Kept my word on the project",
        },
        { q: "What is your one move today?", a: "Ship the first draft" },
      ],
      liveState: "locked_in",
    });

    // NP-101 performs the completion write to /api/mind/session and journal
    expect(
      mockApiFetch.mock.calls.filter((c) =>
        String(c[0]).startsWith("/api/mind/session"),
      ),
    ).toHaveLength(1);
    expect(
      mockApiFetch.mock.calls.filter((c) =>
        String(c[0]).startsWith("/api/mind/journal"),
      ),
    ).toHaveLength(1);

    await flush(5000);
    fireEvent.press(getByTestId(`${P}-payoff-done`));
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  // ── Acceptance e015c8df ──────────────────────────────────────────────────
  it("(id: e015c8df) Answering the state check as stressed re-opens the session exactly as the web does for the same plan", async () => {
    const expected = realignOpening("open-pour-it-in", "stressed", WEB_CONTEXT);
    expect(expected).not.toBeNull();
    const webRealigned = [
      WEB_PLAN.moves[0]!,
      expected!.move,
      ...WEB_PLAN.moves.slice(2),
    ];

    const onComplete = jest.fn();
    const { getByTestId, queryByTestId } = render(
      <SessionPlayer
        plan={WEB_PLAN}
        sessionContext={WEB_CONTEXT}
        onExit={jest.fn()}
        onComplete={onComplete}
      />,
    );

    fireEvent.press(getByTestId(`${P}-intro-begin`));
    await flush();

    // Check in as stressed.
    fireEvent.press(getByTestId("mind-state-check-feeling-stressed"));
    await flush();
    fireEvent.press(getByTestId("mind-state-check-continue"));

    // Move 2 — realigned from win to breath.
    expect(getByTestId("mind-breath-ready")).toBeTruthy();
    expect(queryByTestId("mind-win-scene")).toBeNull();
    fireEvent.press(getByTestId("mind-breath-skip"));

    // Move 3 — mission
    expect(getByTestId("mind-mission-scene")).toBeTruthy();
    fireEvent.press(getByTestId("mind-mission-scene-commit"));
    await flush(900);

    // Move 4 — speak fallback
    expect(getByTestId("mind-hold-affirm-line")).toHaveTextContent(
      affirmDisplayLine(webRealigned[3]!),
    );
    fireEvent(getByTestId("mind-hold-affirm-button"), "pressIn");
    await flush(HOLD_MS);
    await flush(HOLD_DONE_HOLD_MS);

    // What played is exactly the web's realigned chain.
    expect(onComplete.mock.calls[0]![0]).toEqual(
      expect.objectContaining({
        moves: webRealigned.map((m) => ({ kind: m.kind })),
        liveState: "stressed",
      }),
    );
    expect(webRealigned.map((m) => m.kind)).toEqual([
      "state-check",
      "breath",
      "mission",
      "speak",
    ]);
  });

  it("re-answering the check-in after a Back keeps the LATEST answer, and re-opens again", async () => {
    const onComplete = jest.fn();
    const { getByTestId } = render(
      <SessionPlayer
        plan={WEB_PLAN}
        sessionContext={WEB_CONTEXT}
        onExit={jest.fn()}
        onComplete={onComplete}
      />,
    );

    fireEvent.press(getByTestId(`${P}-intro-begin`));
    await flush();
    fireEvent.press(getByTestId("mind-state-check-feeling-stressed"));
    await flush();
    fireEvent.press(getByTestId("mind-state-check-continue"));
    expect(getByTestId("mind-breath-ready")).toBeTruthy();

    fireEvent.press(getByTestId(`${P}-back`));
    await flush();
    expect(getByTestId("mind-state-check-grid")).toBeTruthy();
    expect(stateRequests("GET").length).toBe(2);

    fireEvent.press(getByTestId("mind-state-check-feeling-grateful"));
    await flush();
    fireEvent.press(getByTestId("mind-state-check-continue"));

    expect(getByTestId("mind-win-scene")).toBeTruthy();
    fireEvent.press(getByTestId("mind-win-scene-skip"));

    expect(getByTestId("mind-mission-scene")).toBeTruthy();
    fireEvent.press(getByTestId("mind-mission-scene-commit"));
    await flush(900);

    expect(getByTestId("mind-hold-affirm")).toBeTruthy();
    fireEvent(getByTestId("mind-hold-affirm-button"), "pressIn");
    await flush(HOLD_MS);
    await flush(HOLD_DONE_HOLD_MS);

    expect(onComplete.mock.calls[0]![0]).toEqual(
      expect.objectContaining({
        answers: [
          { q: "How I checked in today", a: "Grateful" },
          { q: "What is your one move today?", a: "Ship the first draft" },
        ],
        moves: WEB_PLAN.moves.map((m) => ({ kind: m.kind })),
      }),
    );
  });

  it("a locked-in check-in plays the amplify alternative instead of the breath, and reports it", async () => {
    const regulate = realignOpening("open-pour-it-in", "stressed", WEB_CONTEXT)!
      .move;
    expect(regulate.altPositive?.kind).toBe("acknowledge");
    const plan: MindSessionPlan = { ...WEB_PLAN, moves: [regulate] };

    const onComplete = jest.fn();
    const { getByTestId, queryByTestId } = render(
      <SessionPlayer
        plan={plan}
        initialLiveState="locked_in"
        onExit={jest.fn()}
        onComplete={onComplete}
      />,
    );
    fireEvent.press(getByTestId(`${P}-intro-begin`));
    await flush();

    // No forced breathing when they came in on.
    expect(queryByTestId("mind-breath-ready")).toBeNull();
    expect(getByTestId("mind-choice-scene")).toBeTruthy();

    fireEvent.press(getByTestId("mind-choice-scene-option-0"));
    fireEvent.press(getByTestId("mind-choice-scene-continue"));
    await flush();

    expect(onComplete.mock.calls[0]![0]).toEqual(
      expect.objectContaining({ moves: [{ kind: "acknowledge" }] }),
    );

    // Completion POST also reports the effective kind (acknowledge, not breath)
    const sessionCall = mockApiFetch.mock.calls.find((c) =>
      String(c[0]).startsWith("/api/mind/session"),
    );
    expect(sessionCall?.[2]?.body?.moves).toEqual([{ kind: "acknowledge" }]);
  });

  it("exiting mid-session is confirmed, never silent", async () => {
    const onExit = jest.fn();
    const { getByTestId, queryByTestId } = render(
      <SessionPlayer
        plan={WEB_PLAN}
        sessionContext={WEB_CONTEXT}
        onExit={onExit}
      />,
    );
    fireEvent.press(getByTestId(`${P}-intro-begin`));
    await flush();

    fireEvent.press(getByTestId(`${P}-exit`));
    expect(getByTestId(`${P}-exit-dialog`)).toBeTruthy();

    fireEvent.press(getByTestId(`${P}-exit-cancel`));
    expect(queryByTestId(`${P}-exit-dialog`)).toBeNull();
    expect(onExit).not.toHaveBeenCalled();

    fireEvent.press(getByTestId(`${P}-exit`));
    fireEvent.press(getByTestId(`${P}-exit-confirm`));
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it("the Android back button steps back through the session and only then asks to leave", async () => {
    const { getByTestId, queryByTestId } = render(
      <SessionPlayer plan={WEB_PLAN} sessionContext={WEB_CONTEXT} onExit={jest.fn()} />,
    );
    fireEvent.press(getByTestId(`${P}-intro-begin`));
    await flush();
    expect(getByTestId("mind-state-check-grid")).toBeTruthy();

    fireEvent(getByTestId(P), "requestClose");
    expect(getByTestId(`${P}-intro`)).toBeTruthy();
    expect(queryByTestId(`${P}-exit-dialog`)).toBeNull();

    fireEvent(getByTestId(P), "requestClose");
    expect(getByTestId(`${P}-exit-dialog`)).toBeTruthy();
  });

  it("without a sessionContext the plan plays exactly as composed — no realignment", async () => {
    const onComplete = jest.fn();
    const { getByTestId } = render(
      <SessionPlayer plan={WEB_PLAN} onExit={jest.fn()} onComplete={onComplete} />,
    );
    fireEvent.press(getByTestId(`${P}-intro-begin`));
    await flush();
    fireEvent.press(getByTestId("mind-state-check-feeling-stressed"));
    await flush();
    fireEvent.press(getByTestId("mind-state-check-continue"));

    expect(getByTestId("mind-win-scene")).toBeTruthy();
  });

  it("a recent check-in opens with Welcome back and logs nothing", async () => {
    mockApiFetch.mockImplementation((path: string, _schema, init) => {
      const method = (init as { method?: string } | undefined)?.method ?? "GET";
      if (String(path).startsWith("/api/mind/state") && method === "GET") {
        return Promise.resolve({
          logs: [
            {
              _id: "log-recent",
              state: "distracted",
              feeling: "Scattered",
              timestamp: new Date(Date.now() - 60_000).toISOString(),
            },
          ],
          todayMood: null,
        });
      }
      return Promise.resolve({});
    });

    const onComplete = jest.fn();
    const { getByTestId } = render(
      <SessionPlayer
        plan={{ ...WEB_PLAN, moves: [WEB_PLAN.moves[0]!] }}
        onExit={jest.fn()}
        onComplete={onComplete}
      />,
    );
    fireEvent.press(getByTestId(`${P}-intro-begin`));
    await flush();

    expect(getByTestId("mind-state-check-opener")).toBeTruthy();
    fireEvent.press(getByTestId("mind-state-check-resume"));
    await flush();

    expect(stateRequests("POST")).toHaveLength(0);
    expect(onComplete.mock.calls[0]![0]).toEqual(
      expect.objectContaining({
        answers: [{ q: "How I checked in today", a: "Scattered" }],
        liveState: "distracted",
      }),
    );
  });

  it("preview never logs the check-in", async () => {
    const { getByTestId } = render(
      <SessionPlayer plan={WEB_PLAN} onExit={jest.fn()} preview />,
    );
    fireEvent.press(getByTestId(`${P}-intro-begin`));
    await flush();
    fireEvent.press(getByTestId("mind-state-check-feeling-stressed"));
    await flush();
    expect(stateRequests("POST")).toHaveLength(0);
    expect(getByTestId("mind-state-check-message")).toHaveTextContent(
      "Noticing it is the first move. Let's bring the system down a notch.",
    );
  });

  // ══════════════════════════════════════════════════════════════════════════
  // NP-101 Acceptance Criteria
  // ══════════════════════════════════════════════════════════════════════════

  // ── Acceptance e015c8f0 ──────────────────────────────────────────────────
  it("(id: e015c8f0) A session completed natively raises the web's level, chapter progress and Mind streak by the same amounts as a web session", async () => {
    const onExit = jest.fn();
    const serverCompletionResult = {
      completions: 1,
      counted: true,
      trainingMode: false,
      xpAwarded: 20,
      levelXp: 120,
      level: 2,
      previousLevel: 1,
      leveledUp: true,
      levelProgress: {
        level: 2,
        pct: 20,
        intoLevel: 20,
        span: 100,
        xpToNext: 80,
      },
      chapter: 2,
      previousChapter: 1,
      chapterAdvanced: true,
      newlyUnlocked: ["mission"],
      unlockedSystems: ["state", "identity", "discipline", "mission"],
      currentChapter: CHAPTERS[1],
      mainSessionCount: 11,
      sessionsIntoChapter: { done: 1, needed: 10, toNext: 9 },
      nextMainSessionAt: Date.now() + 20 * 3600 * 1000,
      xpBank: 120,
      streak: 3,
      featureUnlocks: ["coach"],
    };

    mockApiFetch.mockImplementation((path: string, _schema, init) => {
      const method = (init as { method?: string } | undefined)?.method ?? "GET";
      const clean = String(path).split("?")[0];
      if (clean === "/api/mind/session" && method === "POST") {
        return Promise.resolve(serverCompletionResult);
      }
      if (clean === "/api/mind/journal" && method === "POST") {
        return Promise.resolve({ saved: true, id: "j-1" });
      }
      return Promise.resolve({});
    });

    const shortPlan: MindSessionPlan = {
      ...WEB_PLAN,
      moves: [WEB_PLAN.moves[1]!], // win move only
    };

    const { getByTestId } = render(
      <SessionPlayer
        plan={shortPlan}
        sessionContext={WEB_CONTEXT}
        onExit={onExit}
        tz={120}
      />,
    );

    fireEvent.press(getByTestId(`${P}-intro-begin`));
    await flush();

    // Complete the win scene
    fireEvent.changeText(
      getByTestId("mind-win-scene-input"),
      "Completed daily workout and stayed hydrated",
    );
    fireEvent.press(getByTestId("mind-win-scene-bank-it"));
    await flush();
    await flush(1100);

    // Verify POST /api/mind/session was sent with effective moves and timezone
    const sessionCall = mockApiFetch.mock.calls.find((c) =>
      String(c[0]).startsWith("/api/mind/session"),
    );
    expect(sessionCall).toBeTruthy();
    expect(sessionCall?.[2]?.body).toEqual({
      moves: [{ kind: "win" }],
      tz: 120,
    });

    // Verify journal write was posted
    const journalCall = mockApiFetch.mock.calls.find((c) =>
      String(c[0]).startsWith("/api/mind/journal"),
    );
    expect(journalCall).toBeTruthy();
    expect(journalCall?.[2]?.body?.system).toBe("session");
    expect(journalCall?.[2]?.body?.lines).toEqual([
      {
        prompt: shortPlan.moves[0]!.prompt ?? shortPlan.moves[0]!.title,
        answer: "Completed daily workout and stayed hydrated",
      },
    ]);

    // Verify cached AI plan dropped and warmed (NP-102)
    expect(mockInvalidateMindSession).toHaveBeenCalledTimes(1);
    expect(mockWarmMindSession).toHaveBeenCalledTimes(1);

    // Advance to payoff Phase 2 (score/XP/level/streak)
    await flush(2500);

    // Server numbers displayed natively:
    expect(getByTestId(`${P}-payoff-title`)).toHaveTextContent("Level up.");
    expect(getByTestId(`${P}-payoff-subtitle`)).toHaveTextContent(
      "You climbed to Level 2.",
    );
    expect(getByTestId(`${P}-payoff-xp`)).toHaveTextContent("+20 XP");
    expect(getByTestId(`${P}-payoff-level-label`)).toHaveTextContent("Level 2");
    expect(getByTestId(`${P}-payoff-level-xp-next`)).toHaveTextContent(
      "80 XP to next",
    );
    expect(getByTestId(`${P}-payoff-streak`)).toHaveTextContent("3-day streak");
    expect(
      getByTestId(`${P}-payoff-feature-unlock-coach`),
    ).toHaveTextContent("Your coach is unlocked — talk it through any time.");

    // Advance to payoff Phase 3 (buttons)
    await flush(3000);

    // Chapter advanced -> "New chapter unlocked" button
    const unlockBtn = getByTestId(`${P}-payoff-chapter-unlock`);
    expect(unlockBtn).toHaveTextContent("New chapter unlocked");

    fireEvent.press(unlockBtn);
    await flush();

    // Stage === levelup
    expect(getByTestId(`${P}-levelup`)).toBeTruthy();
    expect(getByTestId(`${P}-levelup-title`)).toHaveTextContent(
      CHAPTERS[1].name,
    );
    expect(getByTestId(`${P}-levelup-theme`)).toHaveTextContent(
      CHAPTERS[1].theme,
    );
    expect(getByTestId(`${P}-levelup-tool-mission`)).toHaveTextContent("Mission");

    fireEvent.press(getByTestId(`${P}-levelup-enter`));
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  // ── Acceptance e015c8f1 ──────────────────────────────────────────────────
  it("(id: e015c8f1) A second session inside 20 hours grants 5 XP and does not advance completedMainSessions", async () => {
    const onExit = jest.fn();
    const cooldownResult = {
      completions: 2,
      counted: false,
      trainingMode: true,
      xpAwarded: 5,
      levelXp: 125,
      level: 2,
      previousLevel: 2,
      leveledUp: false,
      levelProgress: {
        level: 2,
        pct: 25,
        intoLevel: 25,
        span: 100,
        xpToNext: 75,
      },
      chapter: 2,
      previousChapter: 2,
      chapterAdvanced: false,
      newlyUnlocked: [],
      unlockedSystems: ["state", "identity", "discipline", "mission"],
      currentChapter: CHAPTERS[1],
      mainSessionCount: 11, // Does NOT advance!
      sessionsIntoChapter: { done: 1, needed: 10, toNext: 9 },
      nextMainSessionAt: Date.now() + 15 * 3600 * 1000,
      xpBank: 125,
      streak: 3,
      featureUnlocks: [],
    };

    mockApiFetch.mockImplementation((path: string, _schema, init) => {
      const method = (init as { method?: string } | undefined)?.method ?? "GET";
      const clean = String(path).split("?")[0];
      if (clean === "/api/mind/session" && method === "POST") {
        return Promise.resolve(cooldownResult);
      }
      return Promise.resolve({});
    });

    const shortPlan: MindSessionPlan = {
      ...WEB_PLAN,
      moves: [WEB_PLAN.moves[1]!],
    };

    const { getByTestId, queryByTestId } = render(
      <SessionPlayer
        plan={shortPlan}
        sessionContext={WEB_CONTEXT}
        onExit={onExit}
      />,
    );

    fireEvent.press(getByTestId(`${P}-intro-begin`));
    await flush();

    fireEvent.changeText(getByTestId("mind-win-scene-input"), "Quick midday review");
    fireEvent.press(getByTestId("mind-win-scene-bank-it"));
    await flush();
    await flush(1100);

    // Payoff shows cooldown state with 5 XP
    await flush(2500);

    expect(getByTestId(`${P}-payoff-title`)).toHaveTextContent("Another rep in.");
    expect(getByTestId(`${P}-payoff-xp`)).toHaveTextContent("+5 XP");
    expect(getByTestId(`${P}-payoff-cooldown-note`)).toHaveTextContent(
      "You're in cooldown — this rep leveled you up but didn't count toward your chapter.",
    );

    // In cooldown: chapter did NOT advance, so no chapter unlock button
    await flush(3000);
    expect(queryByTestId(`${P}-payoff-chapter-unlock`)).toBeNull();

    // Standard "Done for now" button appears
    const doneBtn = getByTestId(`${P}-payoff-done`);
    expect(doneBtn).toBeTruthy();
    fireEvent.press(doneBtn);
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  // ── Acceptance e015c8f2 ──────────────────────────────────────────────────
  it("(id: e015c8f2) The reflection appears after a session when the member has agreed to AI, and the payoff still shows when the reflection or the completion fails", async () => {
    // Sub-case 1: Agreed to AI -> reflection is shown
    mockRunAiTask.mockResolvedValueOnce({
      ok: true,
      text: "You turned tension into focus today. Trust that move.",
    });

    const shortPlan: MindSessionPlan = {
      ...WEB_PLAN,
      moves: [WEB_PLAN.moves[1]!],
    };

    const { getByTestId, unmount } = render(
      <SessionPlayer plan={shortPlan} onExit={jest.fn()} />,
    );

    fireEvent.press(getByTestId(`${P}-intro-begin`));
    await flush();
    fireEvent.changeText(getByTestId("mind-win-scene-input"), "Tackled the tough call");
    fireEvent.press(getByTestId("mind-win-scene-bank-it"));
    await flush();
    await flush(1100);

    // Advance to phase 3 to reveal reflection
    await flush(4000);

    expect(getByTestId(`${P}-payoff-reflection`)).toBeTruthy();
    expect(getByTestId(`${P}-payoff-reflection-text`)).toHaveTextContent(
      "You turned tension into focus today. Trust that move.",
    );
    unmount();

    // Sub-case 2: Member declined AI or reflection fails -> reflection hidden, payoff still shows
    mockRunAiTask.mockResolvedValueOnce({
      ok: false,
      error: "ai_consent",
    });

    const { getByTestId: getByTestId2, queryByTestId: queryByTestId2, unmount: unmount2 } =
      render(<SessionPlayer plan={shortPlan} onExit={jest.fn()} />);

    fireEvent.press(getByTestId2(`${P}-intro-begin`));
    await flush();
    fireEvent.changeText(getByTestId2("mind-win-scene-input"), "Tackled the tough call");
    fireEvent.press(getByTestId2("mind-win-scene-bank-it"));
    await flush();
    await flush(1100);

    await flush(4000);

    // Reflection is hidden
    expect(queryByTestId2(`${P}-payoff-reflection`)).toBeNull();
    // But payoff still works: title and done button are present
    expect(getByTestId2(`${P}-payoff-title`)).toBeTruthy();
    expect(getByTestId2(`${P}-payoff-done`)).toBeTruthy();
    unmount2();

    // Sub-case 3: Completion POST fails (e.g. 403 gate or server error) -> payoff shows without numbers
    mockApiFetch.mockImplementation((path: string, _schema, init) => {
      const method = (init as { method?: string } | undefined)?.method ?? "GET";
      const clean = String(path).split("?")[0];
      if (clean === "/api/mind/session" && method === "POST") {
        return Promise.reject(new Error("403 Forbidden: EntitlementRequired"));
      }
      return Promise.resolve({});
    });

    const { getByTestId: getByTestId3, queryByTestId: queryByTestId3 } = render(
      <SessionPlayer plan={shortPlan} onExit={jest.fn()} />,
    );

    fireEvent.press(getByTestId3(`${P}-intro-begin`));
    await flush();
    fireEvent.changeText(getByTestId3("mind-win-scene-input"), "Showed up anyway");
    fireEvent.press(getByTestId3("mind-win-scene-bank-it"));
    await flush();
    await flush(1100);

    await flush(4000);

    // Payoff displays fallback honest close without server numbers
    expect(getByTestId3(`${P}-payoff`)).toBeTruthy();
    expect(getByTestId3(`${P}-payoff-title`)).toHaveTextContent(
      shortPlan.doneText ?? "You showed up.",
    );
    expect(getByTestId3(`${P}-payoff-subtitle`)).toHaveTextContent(
      "That's how it's built — one rep at a time.",
    );
    expect(getByTestId3(`${P}-payoff-recap`)).toBeTruthy();

    // No numbers:
    expect(queryByTestId3(`${P}-payoff-xp`)).toBeNull();
    expect(queryByTestId3(`${P}-payoff-level`)).toBeNull();
    expect(queryByTestId3(`${P}-payoff-streak`)).toBeNull();

    // Done button is still available to exit gracefully:
    expect(getByTestId3(`${P}-payoff-done`)).toBeTruthy();
  });
});
