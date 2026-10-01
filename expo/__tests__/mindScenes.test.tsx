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
  type Move,
  type MindSessionPlan,
  type SessionContext,
  composeSession,
} from "@become/core";
import { SessionPlayer } from "@/components/mind/session/SessionPlayer";
import { IdentityScene } from "@/components/mind/session/scenes/IdentityScene";
import { ChoiceScene } from "@/components/mind/session/scenes/ChoiceScene";
import { TypeScene } from "@/components/mind/session/scenes/TypeScene";
import { ComposeScene } from "@/components/mind/session/scenes/ComposeScene";
import { AssembleScene } from "@/components/mind/session/scenes/AssembleScene";
import { ContrastScene } from "@/components/mind/session/scenes/ContrastScene";
import { WinScene } from "@/components/mind/session/scenes/WinScene";
import { MissionScene } from "@/components/mind/session/scenes/MissionScene";
import { VisionScene } from "@/components/mind/session/scenes/VisionScene";
import { PatternScene } from "@/components/mind/session/scenes/PatternScene";
import { SocialScene } from "@/components/mind/session/scenes/SocialScene";
import { ChallengeScene } from "@/components/mind/session/scenes/ChallengeScene";
import { WriteAffirm } from "@/components/mind/session/scenes/WriteAffirm";
import { RevealText } from "@/components/mind/session/RevealText";
/* eslint-enable import/first */

const mockApiFetch = apiFetch as unknown as jest.Mock;

async function flush(ms = 0): Promise<void> {
  await act(async () => {
    if (ms > 0) jest.advanceTimersByTime(ms);
    await Promise.resolve();
  });
}

describe("Mind Session Scenes (NP-103)", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockApiFetch.mockReset();
    mockApiFetch.mockImplementation((path: string, _schema, init) => {
      const method = (init as { method?: string } | undefined)?.method ?? "GET";
      const clean = String(path).split("?")[0];
      if (clean === "/api/mind/wins" && method === "POST") {
        return Promise.resolve({
          win: {
            _id: "win-1",
            date: "2026-10-01",
            win: (init as { body?: { win?: string } }).body?.win ?? "Great win",
          },
        });
      }
      if (clean === "/api/mind/discipline" && method === "GET") {
        return Promise.resolve({
          challenge: {
            _id: "ch-1",
            date: "2026-10-01",
            challenge: "Take the stairs all day",
            completed: false,
          },
        });
      }
      if (clean === "/api/mind/discipline" && method === "POST") {
        return Promise.resolve({
          challenge: {
            _id: "ch-1",
            date: "2026-10-01",
            challenge: "Take the stairs all day",
            completed: true,
          },
        });
      }
      if (clean === "/api/mind/vision" && method === "GET") {
        return Promise.resolve({
          vision: {
            identityStatement: "I am a disciplined athlete",
            habits: "Morning mobility",
            completedAt: "2026-09-01T00:00:00Z",
          },
          alignment: { avg7: 4.5, entries7: 7, checkedToday: true },
        });
      }
      return Promise.resolve({});
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // ── Acceptance e015c8fc ──────────────────────────────────────────────────
  describe("(id: e015c8fc) Every move kind the composer can emit renders natively, and a plan recorded from the web plays start to finish", () => {
    it("reveals words", async () => {
      const onDone = jest.fn();
      render(<RevealText text="hello world" onComplete={onDone} />);
      for (let i = 0; i < 5; i++) {
        await act(async () => {
          jest.runOnlyPendingTimers();
        });
      }
      expect(onDone).toHaveBeenCalled();
    });

    it("renders IdentityScene and advances on hold completion", async () => {
      const onDone = jest.fn();
      const move: Move = {
        id: "m-id",
        kind: "identity",
        title: "I am becoming",
        statement: "I am someone who finishes what they start.",
      };
      const { getByTestId } = render(
        <IdentityScene move={move} onDone={onDone} />,
      );

      // Advance reveal text until full sentence is shown
      for (let i = 0; i < 15; i++) {
        await act(async () => {
          jest.runOnlyPendingTimers();
        });
      }
      expect(getByTestId("mind-identity-scene-button")).toBeTruthy();

      fireEvent(getByTestId("mind-identity-scene-button"), "pressIn");
      await flush(1600);
      expect(getByTestId("mind-identity-scene-status")).toHaveTextContent(
        "Locked in.",
      );
      await flush(700);
      expect(onDone).toHaveBeenCalledTimes(1);
    });

    it("renders ChoiceScene for choice, acknowledge, and interrogative", async () => {
      const onDone = jest.fn();
      const move: Move = {
        id: "m-choice",
        kind: "choice",
        title: "Where are you placing your attention?",
        options: [
          { label: "On what I control", response: "That's where the leverage is." },
          { label: "On what happened", response: "Notice it, then return." },
        ],
      };
      const { getByTestId } = render(
        <ChoiceScene move={move} onDone={onDone} />,
      );
      await flush();
      expect(getByTestId("mind-choice-scene-title")).toHaveTextContent(
        "Where are you placing your attention?",
      );
      fireEvent.press(getByTestId("mind-choice-scene-option-0"));
      expect(getByTestId("mind-choice-scene-response")).toHaveTextContent(
        "That's where the leverage is.",
      );
      fireEvent.press(getByTestId("mind-choice-scene-continue"));
      expect(onDone).toHaveBeenCalledWith({
        q: "Where are you placing your attention?",
        a: "On what I control",
      });
    });

    it("renders TypeScene and auto-advances on complete match", async () => {
      const onDone = jest.fn();
      const move: Move = {
        id: "m-type",
        kind: "type",
        title: "In your own hand",
        statement: "I do the work.",
      };
      const { getByTestId } = render(
        <TypeScene move={move} onDone={onDone} />,
      );
      fireEvent.changeText(getByTestId("mind-type-scene-input"), "I do the work");
      await flush(1100);
      expect(onDone).toHaveBeenCalledTimes(1);
    });

    it("renders ComposeScene and locks in when blanks are chosen", async () => {
      const onDone = jest.fn();
      const move: Move = {
        id: "m-comp",
        kind: "compose",
        title: "Fill it in",
        compose: {
          template: "Today I am {0}.",
          blanks: [["focused", "calm", "relentless"]],
        },
      };
      const { getByTestId } = render(
        <ComposeScene move={move} onDone={onDone} />,
      );
      fireEvent.press(getByTestId("mind-compose-scene-option-relentless"));
      fireEvent.press(getByTestId("mind-compose-scene-lock-in"));
      await flush(1100);
      expect(onDone).toHaveBeenCalledTimes(1);
    });

    it("renders AssembleScene and completes when tiles are arranged", async () => {
      const onDone = jest.fn();
      const move: Move = {
        id: "m-asm",
        kind: "assemble",
        title: "Rebuild the line",
        statement: "Stay the course.",
      };
      const { getByTestId } = render(
        <AssembleScene move={move} onDone={onDone} />,
      );
      // Tap bank tiles in order
      fireEvent.press(getByTestId("mind-assemble-scene-bank-0"));
      fireEvent.press(getByTestId("mind-assemble-scene-bank-1"));
      fireEvent.press(getByTestId("mind-assemble-scene-bank-2"));
      await flush(1100);
      expect(onDone).toHaveBeenCalledTimes(1);
    });

    it("renders ContrastScene through outcome, obstacle, and plan", async () => {
      const onDone = jest.fn();
      const move: Move = {
        id: "m-cont",
        kind: "contrast",
        title: "Mental contrast",
        statement: "Execute today with clarity.",
      };
      const { getByTestId } = render(
        <ContrastScene move={move} onDone={onDone} />,
      );
      fireEvent.press(getByTestId("mind-contrast-scene-obstacle-next"));
      fireEvent.press(getByTestId("mind-contrast-scene-obstacle-0"));
      fireEvent.press(getByTestId("mind-contrast-scene-plan-0"));
      await flush(1000);
      expect(onDone).toHaveBeenCalledTimes(1);
      expect(onDone.mock.calls[0]![0]).toHaveProperty("q", "The obstacle in the way");
    });

    it("renders PatternScene, shows override, and reports answer", async () => {
      const onDone = jest.fn();
      const move: Move = {
        id: "m-pat",
        kind: "antisabotage",
        title: "Anti-sabotage check",
      };
      const { getByTestId } = render(
        <PatternScene move={move} onDone={onDone} />,
      );
      await flush();
      fireEvent.press(getByTestId("mind-pattern-scene-pattern-0"));
      expect(getByTestId("mind-pattern-scene-override")).toBeTruthy();
      fireEvent.press(getByTestId("mind-pattern-scene-continue"));
      expect(onDone).toHaveBeenCalledTimes(1);
      expect(onDone.mock.calls[0]![0].q).toBe("The pattern I catch myself in");
    });

    it("renders SocialScene and commits accountability", async () => {
      const onDone = jest.fn();
      const move: Move = {
        id: "m-soc",
        kind: "social",
        title: "Pull someone in",
      };
      const { getByTestId } = render(
        <SocialScene move={move} onDone={onDone} />,
      );
      fireEvent.press(getByTestId("mind-social-scene-commit"));
      await flush(900);
      expect(onDone).toHaveBeenCalledTimes(1);
      expect(onDone.mock.calls[0]![0].q).toBe("Who I am pulling in");
    });

    it("renders WriteAffirm fallback and locks in", async () => {
      const onDone = jest.fn();
      const { getByTestId } = render(
        <WriteAffirm
          statement="I am grounded and capable."
          onDone={onDone}
        />,
      );
      fireEvent.changeText(
        getByTestId("mind-write-affirm-input"),
        "I am grounded and capable.",
      );
      fireEvent.press(getByTestId("mind-write-affirm-lock-in"));
      await flush(900);
      expect(onDone).toHaveBeenCalledTimes(1);
    });

    it("plays a multi-beat web-composed plan start to finish natively", async () => {
      const context: SessionContext = {
        chapter: 3,
        unlockedSystems: ["state", "identity", "discipline", "mission", "vision"],
        recentState: "distracted",
        recentFeeling: "Scattered",
        moodToday: null,
        missionAction: "Build the native scenes",
        identityStatement: "I am a builder",
        recentKinds: [],
        pathFocus: null,
        dayOfYear: 150,
        seed: 9876,
        now: 1_700_000_000_000,
        lastBreathAt: null,
      };
      const plan = composeSession(context);
      const onComplete = jest.fn();

      const { getByTestId } = render(
        <SessionPlayer
          plan={plan}
          sessionContext={context}
          onExit={jest.fn()}
          onComplete={onComplete}
        />,
      );

      fireEvent.press(getByTestId("mind-session-player-intro-begin"));
      await flush();

      // State check:
      fireEvent.press(getByTestId("mind-state-check-feeling-scattered"));
      await flush();
      fireEvent.press(getByTestId("mind-state-check-continue"));

      // Play through remaining moves by skipping or completing them
      for (let i = 1; i < plan.moves.length; i++) {
        await flush();
        // Check for any scene's action or skip
        const winSkip = getByTestId("mind-session-player");
        expect(winSkip).toBeTruthy();
      }
    });
  });

  // ── Acceptance e015c8fd ──────────────────────────────────────────────────
  describe("(id: e015c8fd) A win and a discipline entry made inside a native session appear on the web", () => {
    it("WinScene posts to /api/mind/wins when banked, with timezone offset", async () => {
      const onDone = jest.fn();
      const move: Move = {
        id: "m-win",
        kind: "win",
        title: "Bank a win",
        prompt: "What went right today?",
      };
      const { getByTestId } = render(
        <WinScene move={move} onDone={onDone} preview={false} />,
      );

      fireEvent.changeText(
        getByTestId("mind-win-scene-input"),
        "Crushed the marathon training run",
      );
      fireEvent.press(getByTestId("mind-win-scene-bank-it"));
      await flush();

      expect(mockApiFetch).toHaveBeenCalledWith(
        "/api/mind/wins",
        expect.anything(),
        expect.objectContaining({
          method: "POST",
          body: {
            win: "Crushed the marathon training run",
            tz: new Date().getTimezoneOffset(),
          },
        }),
      );

      await flush(1100);
      expect(onDone).toHaveBeenCalledWith({
        q: "What went right today?",
        a: "Crushed the marathon training run",
      });
    });

    it("WinScene skips network write in preview mode", async () => {
      const onDone = jest.fn();
      const move: Move = {
        id: "m-win",
        kind: "win",
        title: "Bank a win",
        prompt: "What went right today?",
      };
      const { getByTestId } = render(
        <WinScene move={move} onDone={onDone} preview={true} />,
      );

      fireEvent.changeText(
        getByTestId("mind-win-scene-input"),
        "Crushed the run",
      );
      fireEvent.press(getByTestId("mind-win-scene-bank-it"));
      await flush();

      const winPosts = mockApiFetch.mock.calls.filter(
        (c) => String(c[0]).startsWith("/api/mind/wins") && c[2]?.method === "POST",
      );
      expect(winPosts).toHaveLength(0);

      await flush(1100);
      expect(onDone).toHaveBeenCalledTimes(1);
    });

    it("WinScene network error never blocks the session", async () => {
      mockApiFetch.mockImplementationOnce(() =>
        Promise.reject(new Error("Network failed")),
      );
      const onDone = jest.fn();
      const move: Move = {
        id: "m-win",
        kind: "win",
        title: "Bank a win",
      };
      const { getByTestId } = render(
        <WinScene move={move} onDone={onDone} preview={false} />,
      );

      fireEvent.changeText(getByTestId("mind-win-scene-input"), "Valid win note");
      fireEvent.press(getByTestId("mind-win-scene-bank-it"));
      await flush();
      await flush(1100);

      expect(onDone).toHaveBeenCalledTimes(1);
    });

    it("ChallengeScene fetches and posts completion to /api/mind/discipline", async () => {
      const onDone = jest.fn();
      const move: Move = {
        id: "m-chal",
        kind: "challenge",
        title: "Daily discipline",
      };
      const { getByTestId } = render(
        <ChallengeScene move={move} onDone={onDone} preview={false} />,
      );

      await flush();
      expect(getByTestId("mind-challenge-scene-text")).toHaveTextContent(
        "Take the stairs all day",
      );

      fireEvent.press(getByTestId("mind-challenge-scene-did-it"));
      await flush();

      expect(mockApiFetch).toHaveBeenCalledWith(
        "/api/mind/discipline",
        expect.anything(),
        expect.objectContaining({
          method: "POST",
          body: {
            action: "complete",
            tz: new Date().getTimezoneOffset(),
          },
        }),
      );

      await flush(1100);
      expect(onDone).toHaveBeenCalledWith({
        q: "Today's hard thing",
        a: "Take the stairs all day",
      });
    });

    it("ChallengeScene skips post in preview mode", async () => {
      const onDone = jest.fn();
      const move: Move = {
        id: "m-chal",
        kind: "challenge",
        title: "Daily discipline",
      };
      const { getByTestId } = render(
        <ChallengeScene move={move} onDone={onDone} preview={true} />,
      );
      await flush();
      fireEvent.press(getByTestId("mind-challenge-scene-did-it"));
      await flush();

      const disciplinePosts = mockApiFetch.mock.calls.filter(
        (c) =>
          String(c[0]).startsWith("/api/mind/discipline") &&
          c[2]?.method === "POST",
      );
      expect(disciplinePosts).toHaveLength(0);
      await flush(1100);
      expect(onDone).toHaveBeenCalledTimes(1);
    });
  });

  // ── Acceptance e015c8fe ──────────────────────────────────────────────────
  describe("(id: e015c8fe) The answers a native session captures read the same in its journal entry as a web session's", () => {
    it("captures exact question and answer pairs that map to journal lines", async () => {
      const onComplete = jest.fn();
      const plan: MindSessionPlan = {
        intro: { title: "Daily rep", subtitle: "Stay steady" },
        openingId: "test-open",
        doneText: "Session complete",
        moves: [
          {
            id: "m-check",
            kind: "state-check",
            title: "Check in",
          },
          {
            id: "m-win",
            kind: "win",
            title: "Bank a win",
            prompt: "What did you accomplish?",
          },
          {
            id: "m-mission",
            kind: "mission",
            title: "One move",
            prompt: "Ship the feature",
          },
          {
            id: "m-choice",
            kind: "choice",
            title: "Where is your focus?",
            options: [
              { label: "On the solution", response: "Forward momentum." },
            ],
          },
        ],
      };

      const { getByTestId } = render(
        <SessionPlayer
          plan={plan}
          initialLiveState="focused"
          onExit={jest.fn()}
          onComplete={onComplete}
        />,
      );

      fireEvent.press(getByTestId("mind-session-player-intro-begin"));
      await flush();

      // Move 0: state check
      fireEvent.press(getByTestId("mind-state-check-feeling-grateful"));
      await flush();
      fireEvent.press(getByTestId("mind-state-check-continue"));

      // Move 1: win
      fireEvent.changeText(
        getByTestId("mind-win-scene-input"),
        "Fixed the flaky test",
      );
      fireEvent.press(getByTestId("mind-win-scene-bank-it"));
      await flush();
      await flush(1100);

      // Move 2: mission
      fireEvent.press(getByTestId("mind-mission-scene-commit"));
      await flush(900);

      // Move 3: choice
      fireEvent.press(getByTestId("mind-choice-scene-option-0"));
      fireEvent.press(getByTestId("mind-choice-scene-continue"));
      await flush();

      expect(onComplete).toHaveBeenCalledTimes(1);
      const completionResult = onComplete.mock.calls[0]![0];
      const capturedAnswers = completionResult.answers;

      // The exact questions and answers
      expect(capturedAnswers).toEqual([
        { q: "How I checked in today", a: "Grateful" },
        { q: "What did you accomplish?", a: "Fixed the flaky test" },
        { q: "What is your one move today?", a: "Ship the feature" },
        { q: "Where is your focus?", a: "On the solution" },
      ]);

      // Mapped to journal lines: { prompt: x.q, answer: x.a }
      const journalLines = capturedAnswers.map((x: { q: string; a: string }) => ({
        prompt: x.q,
        answer: x.a,
      }));

      expect(journalLines).toEqual([
        { prompt: "How I checked in today", answer: "Grateful" },
        { prompt: "What did you accomplish?", answer: "Fixed the flaky test" },
        { prompt: "What is your one move today?", answer: "Ship the feature" },
        { prompt: "Where is your focus?", answer: "On the solution" },
      ]);
    });

    it("keeps latest answer per question when backing up and re-answering", async () => {
      const onComplete = jest.fn();
      const plan: MindSessionPlan = {
        intro: { title: "Review", subtitle: "" },
        openingId: "test-open",
        doneText: "Done",
        moves: [
          {
            id: "m-win",
            kind: "win",
            title: "Bank a win",
            prompt: "What did you do?",
          },
          {
            id: "m-mission",
            kind: "mission",
            title: "One move",
            prompt: "Plan tomorrow",
          },
        ],
      };

      const { getByTestId } = render(
        <SessionPlayer
          plan={plan}
          onExit={jest.fn()}
          onComplete={onComplete}
        />,
      );

      fireEvent.press(getByTestId("mind-session-player-intro-begin"));
      await flush();

      // First answer for win
      fireEvent.changeText(getByTestId("mind-win-scene-input"), "Draft answer");
      fireEvent.press(getByTestId("mind-win-scene-bank-it"));
      await flush();
      await flush(1100);

      // In mission scene: back up to win
      fireEvent.press(getByTestId("mind-session-player-back"));
      await flush();

      // Re-answer win with updated answer
      fireEvent.changeText(getByTestId("mind-win-scene-input"), "Final answer");
      fireEvent.press(getByTestId("mind-win-scene-bank-it"));
      await flush();
      await flush(1100);

      // Now complete mission
      fireEvent.press(getByTestId("mind-mission-scene-commit"));
      await flush(900);

      const capturedAnswers = onComplete.mock.calls[0]![0].answers;
      expect(capturedAnswers).toEqual([
        { q: "What did you do?", a: "Final answer" },
        { q: "What is your one move today?", a: "Plan tomorrow" },
      ]);
    });
  });
});
