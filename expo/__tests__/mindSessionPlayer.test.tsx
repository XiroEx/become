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

jest.mock("@become/api-client", () => {
  const actual = jest.requireActual("@become/api-client");
  return { __esModule: true, ...actual, apiFetch: jest.fn() };
});

import { apiFetch } from "@become/api-client";
import {
  breathForState,
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
 * THE MIND SESSION PLAYER, NATIVELY (NP-098).
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

describe("SessionPlayer (NP-098)", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockApiFetch.mockReset();
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

    // Moves 2-4 — win, mission and speak are NOT ported yet (NP-103 / NP-099),
    // so each plays as the web's hold-to-affirm rather than dead-ending.
    for (const move of WEB_PLAN.moves.slice(1)) {
      expect(getByTestId("mind-hold-affirm")).toBeTruthy();
      expect(getByTestId("mind-hold-affirm-line")).toHaveTextContent(
        affirmDisplayLine(move),
      );
      fireEvent(getByTestId("mind-hold-affirm-button"), "pressIn");
      await flush(HOLD_MS);
      expect(getByTestId("mind-hold-affirm-status")).toHaveTextContent(
        "Locked in.",
      );
      await flush(HOLD_DONE_HOLD_MS);
    }

    // Payoff.
    expect(getByTestId(`${P}-payoff`)).toBeTruthy();
    expect(getByTestId(`${P}-payoff-title`)).toHaveTextContent("Decided. Now go.");

    // The completion facts handed to NP-101 — the EFFECTIVE kinds, in order, and
    // the check-in recorded as the first answer.
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete.mock.calls[0]![0]).toEqual({
      moves: [
        { kind: "state-check" },
        { kind: "win" },
        { kind: "mission" },
        { kind: "speak" },
      ],
      answers: [{ q: "How I checked in today", a: "Grateful" }],
      liveState: "locked_in",
    });

    // NP-101 owns the completion WRITES: this card performs none.
    expect(
      mockApiFetch.mock.calls.filter((c) =>
        String(c[0]).startsWith("/api/mind/session"),
      ),
    ).toHaveLength(0);

    fireEvent.press(getByTestId(`${P}-payoff-done`));
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  // ── Acceptance e015c8df ──────────────────────────────────────────────────
  it("(id: e015c8df) Answering the state check as stressed re-opens the session exactly as the web does for the same plan", async () => {
    // The web's answer for this plan and this context, computed by the web's own
    // function — not a copy of what it returned once.
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
    fireEvent.press(getByTestId("mind-state-check-feeling-stressed"));
    await flush();

    // The check-in is logged with the WORD they tapped, not just the bucket.
    const post = stateRequests("POST")[0]!;
    expect((post[2] as { body: Record<string, unknown> }).body).toEqual(
      expect.objectContaining({ state: "stressed", feeling: "Stressed" }),
    );

    fireEvent.press(getByTestId("mind-state-check-continue"));

    // The session says it was rebuilt, naming the web's opening.
    expect(getByTestId(`${P}-realigned`)).toHaveTextContent(
      `Rebuilt around how you just checked in · ${expected!.opening.title}`,
    );

    // Move 2 is now the web's regulate beat: a breath, resolved from the live
    // answer ('auto' → breathForState('stressed')).
    expect(expected!.move.kind).toBe("breath");
    expect(expected!.move.protocolId).toBe("auto");
    expect(getByTestId("mind-breath-ready")).toBeTruthy();
    expect(getByTestId("mind-breath-name")).toHaveTextContent(
      breathForState("stressed").name,
    );

    // THE PATH BODY STAYS. The session is still four moves long and the beats
    // after the opening are the ones the composer chose.
    expect(getByTestId(`${P}-progress-3`)).toBeTruthy();
    expect(queryByTestId(`${P}-progress-4`)).toBeNull();
    fireEvent.press(getByTestId("mind-breath-skip"));
    for (const move of webRealigned.slice(2)) {
      expect(getByTestId("mind-hold-affirm-line")).toHaveTextContent(
        affirmDisplayLine(move),
      );
      fireEvent(getByTestId("mind-hold-affirm-button"), "pressIn");
      await flush(HOLD_MS);
      await flush(HOLD_DONE_HOLD_MS);
    }

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

    // Back re-mounts the check-in fresh (it reads the server again) rather than
    // restoring the reveal it ended on.
    fireEvent.press(getByTestId(`${P}-back`));
    await flush();
    expect(getByTestId("mind-state-check-grid")).toBeTruthy();
    expect(stateRequests("GET").length).toBe(2);

    fireEvent.press(getByTestId("mind-state-check-feeling-grateful"));
    await flush();
    fireEvent.press(getByTestId("mind-state-check-continue"));

    // A positive answer re-opens the session again — back to the composer's own
    // opening, so the second move is the win beat it chose.
    expect(getByTestId("mind-hold-affirm-line")).toHaveTextContent(
      affirmDisplayLine(WEB_PLAN.moves[1]!),
    );

    for (let i = 1; i < WEB_PLAN.moves.length; i += 1) {
      fireEvent(getByTestId("mind-hold-affirm-button"), "pressIn");
      await flush(HOLD_MS);
      await flush(HOLD_DONE_HOLD_MS);
    }

    // ONE answer for the question, carrying the latest value.
    expect(onComplete.mock.calls[0]![0]).toEqual(
      expect.objectContaining({
        answers: [{ q: "How I checked in today", a: "Grateful" }],
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
    expect(getByTestId("mind-hold-affirm-line")).toHaveTextContent(
      affirmDisplayLine(regulate.altPositive!),
    );

    fireEvent(getByTestId("mind-hold-affirm-button"), "pressIn");
    await flush(HOLD_MS);
    await flush(HOLD_DONE_HOLD_MS);

    expect(onComplete.mock.calls[0]![0]).toEqual(
      expect.objectContaining({ moves: [{ kind: "acknowledge" }] }),
    );
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
    expect(onExit).not.toHaveBeenCalled();

    fireEvent.press(getByTestId(`${P}-exit-cancel`));
    expect(queryByTestId(`${P}-exit-dialog`)).toBeNull();
    expect(onExit).not.toHaveBeenCalled();

    fireEvent.press(getByTestId(`${P}-exit`));
    fireEvent.press(getByTestId(`${P}-exit-confirm`));
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it("the Android back button steps back through the session and only then asks to leave", async () => {
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
    expect(getByTestId("mind-state-check-grid")).toBeTruthy();

    // A visible RN Modal hands the hardware back press over as onRequestClose.
    const back = (): void => {
      const press = getByTestId(P).props.onRequestClose as () => void;
      act(() => press());
    };

    // From the first move, back returns to the intro …
    back();
    expect(getByTestId(`${P}-intro`)).toBeTruthy();
    expect(onExit).not.toHaveBeenCalled();

    // … and from the intro, where there is nowhere left to step, it asks.
    back();
    expect(getByTestId(`${P}-exit-dialog`)).toBeTruthy();
    expect(onExit).not.toHaveBeenCalled();

    // A second press cancels the question rather than answering it.
    back();
    expect(queryByTestId(`${P}-exit-dialog`)).toBeNull();
    expect(onExit).not.toHaveBeenCalled();
  });

  it("without a sessionContext the plan plays exactly as composed — no realignment", async () => {
    const { getByTestId, queryByTestId } = render(
      <SessionPlayer plan={WEB_PLAN} onExit={jest.fn()} />,
    );
    fireEvent.press(getByTestId(`${P}-intro-begin`));
    await flush();
    fireEvent.press(getByTestId("mind-state-check-feeling-stressed"));
    await flush();
    fireEvent.press(getByTestId("mind-state-check-continue"));

    expect(queryByTestId(`${P}-realigned`)).toBeNull();
    expect(queryByTestId("mind-breath-ready")).toBeNull();
    expect(getByTestId("mind-hold-affirm-line")).toHaveTextContent(
      affirmDisplayLine(WEB_PLAN.moves[1]!),
    );
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

    // Nothing re-logged (no XP spam), and the session remembers their WORD.
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
    // The reveal still appears, with the per-state fallback line.
    expect(getByTestId("mind-state-check-message")).toHaveTextContent(
      "Noticing it is the first move. Let's bring the system down a notch.",
    );
  });
});
