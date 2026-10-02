/* eslint-disable import/first */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { act, render, waitFor } from "@testing-library/react-native";
import type { AppStateStatus } from "react-native";

jest.mock("@become/api-client", () => {
  const actual = jest.requireActual("@become/api-client");
  return { __esModule: true, ...actual, apiFetch: jest.fn() };
});

jest.mock("@/lib/ai/runClient", () => {
  const actual = jest.requireActual("@/lib/ai/runClient");
  return { __esModule: true, ...actual, runAiTask: jest.fn() };
});

jest.mock("expo-router", () => ({
  useLocalSearchParams: () => ({}),
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
  }),
}));

const mockToken = "test-jwt-token";
jest.mock("@/lib/auth/useAuth", () => ({
  useAuth: () => ({
    user: { id: "u-1" },
    token: mockToken,
    loading: false,
    isAuthed: true,
    setToken: jest.fn(),
    refresh: jest.fn(),
    logout: jest.fn(),
  }),
}));

import {
  MIND_AI_PLAN_KEY,
  AI_PLAN_TTL,
  readMindPlanCache,
  invalidateMindSession,
  readMindSuggestionsCache,
  writeMindSuggestionsCache,
  invalidateMindSuggestions,
} from "@/lib/mind/sessionCache";
import { precomposeMindSession } from "@/lib/mind/precompose";
import { MindSessionWarmer } from "@/components/mind/MindSessionWarmer";
import { runAiTask } from "@/lib/ai/runClient";
import { apiFetch } from "@become/api-client";
import * as tokenModule from "@/lib/auth/secureStoreToken";
import { getAiConsentPromptState } from "@/lib/ai/aiConsentPrompt";
import { getUpgradeSheetGate } from "@/lib/entitlements/upgradeSheet";
import type { MindSessionPlan, SessionContext } from "@become/core";
import { conformSession, getPathSession, sessionShape } from "@become/core";
import MindRoute from "@/app/(app)/(tabs)/mind/index";
/* eslint-enable import/first */

const dummyPlan: MindSessionPlan = {
  intro: { title: "AI Today", subtitle: "Path Session 1" },
  moves: [
    { id: "sc-1", kind: "state-check", title: "Check-in", xp: 5 },
    { id: "id-1", kind: "identity", title: "Recite", statement: "I become.", xp: 10 },
  ],
  rewardXp: 15,
};

describe("Native Mind Precompose & Cache (NP-102)", () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();
    jest.spyOn(tokenModule.sessionStore, "get").mockResolvedValue(mockToken);
    // Deterministic session shapes: precompose() seeds its SessionContext with
    // a random value by default, which rotates slot kinds (resolveSlot) and
    // library picks (choice/acknowledge/interrogate pools) run to run. A mock
    // AI plan that conforms under one seed can fail validation under another
    // (e.g. an `identity` move landing on a `choice` slot is dropped, and a
    // plan that fills zero slots is rejected as null) — so unrelated PRs went
    // red at random. Every test below pins the seed explicitly via the
    // `seed` option; the global stub below is a belt-and-suspenders guard so
    // any future unseeded call in this file is still deterministic.
    jest.spyOn(Math, "random").mockReturnValue(0.424242);
  });

  afterEach(() => {
    jest.spyOn(Math, "random").mockRestore?.();
  });

  /** Fixed seeds covering every session shape the random seed used to hit. */
  const SEED_BY_SHAPE = {
    reflect: 7,
    evidence: 8,
    commit: 4,
    envision: 11,
    defend: 31,
    connect: 49,
  } as const;

  /**
   * Deterministic fixture ctx for a path shape: the NEXT path session with
   * that body (via getPathSession) + the chapter's real unlocked systems, so
   * the blueprint id is `<opening>/<shape>` on every run. mainSessionCount
   * values below are the first path index carrying each shape (see
   * SESSION_PATH in @become/core).
   */
  const SHAPE_CTX: Record<keyof typeof SEED_BY_SHAPE, SessionContext> = {
    reflect: {
      chapter: 1,
      unlockedSystems: ["state-shift"],
      recentState: "stressed",
      dayOfYear: 100,
      seed: SEED_BY_SHAPE.reflect,
      now: 1_700_000_000_000,
      pathFocus: getPathSession(0),
      recentKinds: [],
    },
    evidence: {
      chapter: 5,
      unlockedSystems: ["state-shift", "self-image", "mission", "vision", "discipline", "anti-sabotage", "social"],
      recentState: "distracted",
      dayOfYear: 100,
      seed: SEED_BY_SHAPE.evidence,
      now: 1_700_000_000_000,
      pathFocus: getPathSession(49),
      recentKinds: [],
    },
    commit: {
      chapter: 1,
      unlockedSystems: ["state-shift"],
      recentState: "low_energy",
      dayOfYear: 100,
      seed: SEED_BY_SHAPE.commit,
      now: 1_700_000_000_000,
      pathFocus: getPathSession(4),
      recentKinds: [],
    },
    envision: {
      chapter: 2,
      unlockedSystems: ["state-shift", "self-image", "mission", "vision"],
      recentState: "locked_in",
      dayOfYear: 100,
      seed: SEED_BY_SHAPE.envision,
      now: 1_700_000_000_000,
      pathFocus: getPathSession(10),
      recentKinds: [],
    },
    defend: {
      chapter: 4,
      unlockedSystems: ["state-shift", "self-image", "mission", "vision", "discipline", "anti-sabotage"],
      recentState: "stressed",
      dayOfYear: 100,
      seed: SEED_BY_SHAPE.defend,
      now: 1_700_000_000_000,
      pathFocus: getPathSession(30),
      recentKinds: [],
    },
    connect: {
      chapter: 5,
      unlockedSystems: ["state-shift", "self-image", "mission", "vision", "discipline", "anti-sabotage", "social"],
      recentState: "locked_in",
      dayOfYear: 100,
      seed: SEED_BY_SHAPE.connect,
      now: 1_700_000_000_000,
      pathFocus: getPathSession(40),
      recentKinds: [],
    },
  };

  describe("Acceptance Criteria (e015c8f6): Opening the app twice within 8 hours dispatches at most one composition", () => {
    it("dispatches at most one composition within 8 hours and stamps cooldown before dispatch", async () => {
      let dispatchCount = 0;
      let stampedDuringRun: string | null = null;

      (apiFetch as jest.Mock).mockImplementation(async (endpoint: string) => {
        if (endpoint.includes("/api/mind/progress")) {
          return { chapter: 1, xp: 0, unlockedSystems: ["state-shift"], mainSessionCount: 0 };
        }
        if (endpoint.includes("/api/mind/session")) {
          return { streak: 1, mainSessionAvailable: true };
        }
        if (endpoint.includes("/api/mind/state")) {
          return { logs: [] };
        }
        if (endpoint.includes("/api/mind/mission")) {
          return { mission: { dailyAction: "Action" } };
        }
        return {};
      });

      (runAiTask as jest.Mock).mockImplementation(async (_endpoint, _body, opts) => {
        dispatchCount++;
        // Check that cooldown timestamp was already stamped before or during dispatch
        stampedDuringRun = await AsyncStorage.getItem(MIND_AI_PLAN_KEY);
        expect(opts?.silent).toBe(true);
        return {
          ok: true,
          result: {
            intro: { title: "AI Composed", subtitle: "Subtitle" },
            moves: [
              {
                kind: "choice",
                title: "How do you feel?",
                subtitle: "Choose one",
                options: [
                  { label: "Ready", response: "Good" },
                  { label: "Tired", response: "Rest" },
                ],
              },
              { kind: "identity", title: "I am becoming", statement: "I show up daily." },
            ],
          },
        };
      });

      // First open: should dispatch (fixed seed → deterministic session shape)
      const plan1 = await precomposeMindSession({ seed: SEED_BY_SHAPE.reflect });
      expect(dispatchCount).toBe(1);
      expect(stampedDuringRun).not.toBeNull();
      expect(plan1).not.toBeNull();

      // Second open within 8 hours: should NOT dispatch again
      const plan2 = await precomposeMindSession({ seed: SEED_BY_SHAPE.reflect });
      expect(dispatchCount).toBe(1); // Still 1!
      expect(plan2).toEqual(plan1);

      // Fast forward 8 hours and 1 millisecond
      const now = Date.now();
      const expiredCache = { plan: dummyPlan, ts: now - (AI_PLAN_TTL + 1000) };
      await AsyncStorage.setItem(MIND_AI_PLAN_KEY, JSON.stringify(expiredCache));

      // After 8h, a new open can dispatch again
      await precomposeMindSession({ seed: SEED_BY_SHAPE.reflect });
      expect(dispatchCount).toBe(2);
    });
  });

  describe("Acceptance Criteria (e015c8f7): Logging food natively makes the next Mind open compose a fresh session", () => {
    it("invalidates cache on food log so next composition runs fresh", async () => {
      let dispatchCount = 0;

      (apiFetch as jest.Mock).mockImplementation(async (endpoint: string) => {
        if (endpoint.includes("/api/mind/progress")) {
          return { chapter: 1, xp: 0, unlockedSystems: ["state-shift"], mainSessionCount: 0 };
        }
        if (endpoint.includes("/api/mind/session")) {
          return { streak: 1, mainSessionAvailable: true };
        }
        if (endpoint.includes("/api/mind/state")) {
          return { logs: [] };
        }
        if (endpoint.includes("/api/mind/mission")) {
          return { mission: { dailyAction: "Action" } };
        }
        return {};
      });

      (runAiTask as jest.Mock).mockImplementation(async () => {
        dispatchCount++;
        return {
          ok: true,
          result: {
            intro: { title: "AI Plan 1", subtitle: "Daily Focus" },
            moves: [
              {
                kind: "choice",
                title: "How do you feel?",
                subtitle: "Choose one",
                options: [
                  { label: "Ready", response: "Good" },
                  { label: "Tired", response: "Rest" },
                ],
              },
              {
                kind: "identity",
                title: "Move 1",
                statement: "I show up daily.",
              },
            ],
          },
        };
      });

      // 1. App open / precompose caches plan
      await precomposeMindSession({ seed: SEED_BY_SHAPE.reflect });
      expect(dispatchCount).toBe(1);

      // Cache is populated
      const cacheBefore = await readMindPlanCache();
      expect(cacheBefore?.plan).not.toBeNull();

      // 2. Member logs food (which calls invalidateMindSession())
      await invalidateMindSession();

      // Cache is now cleared
      const cacheAfter = await readMindPlanCache();
      expect(cacheAfter).toBeNull();

      // 3. Next Mind open or precompose composes fresh
      await precomposeMindSession({ seed: SEED_BY_SHAPE.reflect });
      expect(dispatchCount).toBe(2);
    });
  });

  describe("Acceptance Criteria (e015c8f8): With AI declined, Mind home shows deterministic session and no prompt appears on app open", () => {
    it("silently falls back to deterministic session without raising consent prompt when AI is declined", async () => {
      (apiFetch as jest.Mock).mockImplementation(async (endpoint: string) => {
        if (endpoint.includes("/api/mind/progress")) {
          return { chapter: 1, xp: 0, unlockedSystems: ["state-shift"], mainSessionCount: 0 };
        }
        if (endpoint.includes("/api/mind/session")) {
          return { streak: 1, mainSessionAvailable: true };
        }
        if (endpoint.includes("/api/mind/state")) {
          return { logs: [] };
        }
        if (endpoint.includes("/api/mind/mission")) {
          return { mission: { dailyAction: "Action" } };
        }
        return {};
      });

      // Simulate AI consent required / declined
      (runAiTask as jest.Mock).mockImplementation(async (_endpoint, _body, opts) => {
        expect(opts?.silent).toBe(true);
        // Silent run must not show consent prompt or upgrade sheet
        return {
          ok: false,
          error: "ai_consent",
          unavailable: false,
        };
      });

      // Precompose runs silently on app open
      const plan = await precomposeMindSession({ seed: SEED_BY_SHAPE.reflect });
      // Returns null on failure / refusal
      expect(plan).toBeNull();

      // Verify no consent prompt or upgrade sheet was raised
      expect(getAiConsentPromptState().open).toBe(false);
      expect(getUpgradeSheetGate()).toBeNull();

      // Cooldown timestamp is still recorded so it doesn't spin
      const cache = await readMindPlanCache();
      expect(cache).not.toBeNull();
      expect(cache?.plan).toBeNull();
      expect(typeof cache?.ts).toBe("number");
    });
  });

  describe("MindSessionWarmer (Foreground / AppState)", () => {
    it("triggers precompose on launch and on AppState active transition", async () => {
      const mockPrecompose = jest.fn().mockResolvedValue(null);
      let listener: ((status: AppStateStatus) => void) | null = null;
      const subscribe = (l: (status: AppStateStatus) => void) => {
        listener = l;
        return () => {
          listener = null;
        };
      };

      jest.useFakeTimers();
      render(
        <MindSessionWarmer
          subscribeToAppState={subscribe}
          precompose={mockPrecompose}
          initialDelayMs={500}
        />,
      );

      // Fast-forward initial launch delay
      act(() => {
        jest.advanceTimersByTime(500);
      });
      expect(mockPrecompose).toHaveBeenCalledTimes(1);

      // Transition to background, then foreground
      act(() => {
        listener?.("background");
      });
      expect(mockPrecompose).toHaveBeenCalledTimes(1);

      act(() => {
        listener?.("active");
      });
      expect(mockPrecompose).toHaveBeenCalledTimes(2);

      jest.useRealTimers();
    });
  });

  describe("Conform module (pure vendored logic)", () => {
    it("conforms AI moves onto blueprint slots and drops overlapping beats", () => {
      const ctx: SessionContext = {
        chapter: 1,
        unlockedSystems: ["state-shift"],
        recentState: "stressed",
        dayOfYear: 100,
        seed: SEED_BY_SHAPE.reflect,
        now: 1_700_000_000_000,
      };

      const rawPlan = {
        intro: { title: "Custom Intro", subtitle: "Custom Subtitle" },
        moves: [
          { kind: "identity", title: "Move 1", statement: "Be disciplined today." },
          { kind: "identity", title: "Move 2", statement: "Be disciplined today." }, // duplicate/overlap
        ],
      };

      const conformed = conformSession(rawPlan, ctx);
      expect(conformed).not.toBeNull();
      expect(conformed?.intro.title).toBe("Custom Intro");
      expect(conformed?.moves[0]?.kind).toBe("state-check"); // always unshifts state-check
    });

    it("returns null if model fills none of the slots (fails loudly)", () => {
      const ctx: SessionContext = {
        chapter: 1,
        unlockedSystems: ["state-shift"],
        recentState: "stressed",
        dayOfYear: 100,
        seed: SEED_BY_SHAPE.reflect,
        now: 1_700_000_000_000,
      };

      // Completely empty / invalid moves
      const rawPlan = {
        moves: [],
      };

      const conformed = conformSession(rawPlan, ctx);
      expect(conformed).toBeNull();
    });

    // One deterministic test per session shape the random seed used to hit.
    // Each pins an explicit seed fixture and asserts the shape id + a conformed
    // plan, so a future shape/validator change fails loudly on a named shape
    // instead of flaking at random. Fixture ctxs come from SHAPE_CTX above, so
    // the blueprint id is `<opening>/<shape>` on every run.
    const SHAPE_CASES = [
      {
        shape: "reflect" as const,
        ctx: SHAPE_CTX.reflect,
        moves: [
          {
            kind: "choice",
            title: "What is pulling you off course?",
            subtitle: "Pick one",
            options: [
              { label: "Comfort", response: "Choose the harder right." },
              { label: "Fear", response: "Move toward it." },
            ],
          },
          { kind: "identity", title: "I am becoming", statement: "I show up daily." },
        ],
      },
      {
        shape: "evidence" as const,
        ctx: SHAPE_CTX.evidence,
        moves: [
          { kind: "win", title: "Name one thing you did", prompt: "What did you finish today?" },
          { kind: "identity", title: "I am becoming", statement: "I show up daily." },
        ],
      },
      {
        shape: "commit" as const,
        ctx: SHAPE_CTX.commit,
        moves: [
          { kind: "mission", title: "Name one move for today", prompt: "What is the single next action?" },
          { kind: "identity", title: "I am becoming", statement: "I show up daily." },
        ],
      },
      {
        shape: "envision" as const,
        ctx: SHAPE_CTX.envision,
        moves: [
          { kind: "win", title: "Bank what you already did", prompt: "What is already working?" },
          { kind: "vision", title: "See the scene", statement: "I see the future I am building." },
          { kind: "identity", title: "I am becoming", statement: "I show up daily." },
        ],
      },
      {
        shape: "defend" as const,
        ctx: SHAPE_CTX.defend,
        moves: [
          {
            kind: "acknowledge",
            title: "Where is the pressure sitting right now?",
            subtitle: "Nothing to fix yet.",
            options: [
              { label: "In my chest", response: "It settles faster than it feels like it will." },
              { label: "In my head", response: "Naming it is most of the way to closing it." },
            ],
          },
          { kind: "antisabotage", title: "Name the pattern", prompt: "When does it run you?" },
          { kind: "identity", title: "I am becoming", statement: "I show up daily." },
        ],
      },
      {
        shape: "connect" as const,
        ctx: SHAPE_CTX.connect,
        moves: [
          { kind: "win", title: "Bank what you already did", prompt: "What is already working?" },
          { kind: "social", title: "Bring someone in", prompt: "Who can hold you to this?" },
          { kind: "identity", title: "I am becoming", statement: "I show up daily." },
        ],
      },
    ];

    it.each(SHAPE_CASES)("conforms a deterministic $shape-shape session", ({ shape, ctx, moves }) => {
      // The blueprint id is derived from the fixture ctx (opening + path body),
      // so assert against the shape computed from that same ctx — not a
      // hardcoded string. The point is determinism: same ctx → same shape,
      // every run.
      const expectedId = sessionShape(ctx).id;
      expect(expectedId).toContain(`/${shape}`);
      const conformed = conformSession({ moves }, ctx);
      expect(conformed).not.toBeNull();
      expect(conformed?.blueprintId).toBe(expectedId);
      expect(conformed?.moves[0]?.kind).toBe("state-check");
    });
  });

  describe("Suggestions Cache", () => {
    it("reads, writes, and invalidates suggestions correctly", async () => {
      const suggestions = [
        { system: "state-shift", id: "box-breath", title: "Box Breath", blurb: "Calm", reason: "Focus", idx: 0 },
        { system: "vision", id: "future-self", title: "Future Self", blurb: "Vision", reason: "Clarity", idx: 0 },
        { system: "discipline", id: "cold-start", title: "Cold Start", blurb: "Power", reason: "Action", idx: 0 },
      ];

      await writeMindSuggestionsCache(suggestions);
      const read = await readMindSuggestionsCache();
      expect(read).toEqual(suggestions);

      await invalidateMindSuggestions();
      const readAfter = await readMindSuggestionsCache();
      expect(readAfter).toBeNull();
    });
  });

  describe("Deterministic precompose seeds (NP-213)", () => {
    const seedApiFetch = () => {
      (apiFetch as jest.Mock).mockImplementation(async (endpoint: string) => {
        if (endpoint.includes("/api/mind/progress")) {
          return { chapter: 1, xp: 0, unlockedSystems: ["state-shift"], mainSessionCount: 0 };
        }
        if (endpoint.includes("/api/mind/session")) {
          return { streak: 1, mainSessionAvailable: true };
        }
        if (endpoint.includes("/api/mind/state")) {
          return { logs: [] };
        }
        if (endpoint.includes("/api/mind/mission")) {
          return { mission: { dailyAction: "Action" } };
        }
        return {};
      });
    };

    const seedAiResult = () => ({
      ok: true,
      result: {
        intro: { title: "AI Composed", subtitle: "Subtitle" },
        moves: [
          {
            kind: "choice",
            title: "How do you feel?",
            subtitle: "Choose one",
            options: [
              { label: "Ready", response: "Good" },
              { label: "Tired", response: "Rest" },
            ],
          },
          { kind: "identity", title: "I am becoming", statement: "I show up daily." },
        ],
      },
    });

    it("uses the explicit seed when provided", async () => {
      seedApiFetch();
      const seen: unknown[] = [];
      (runAiTask as jest.Mock).mockImplementation(async (_endpoint: string, body: unknown) => {
        seen.push(body);
        return seedAiResult();
      });

      const plan = await precomposeMindSession({ force: true, seed: SEED_BY_SHAPE.reflect });
      expect(plan).not.toBeNull();
      const sent = (seen[0] as { context: { seed: number } }).context;
      expect(sent.seed).toBe(SEED_BY_SHAPE.reflect);
    });

    it.each(Object.entries(SEED_BY_SHAPE))(
      "precomposes a conformed plan for the %s shape seed",
      async (_shape, seed) => {
        seedApiFetch();
        (runAiTask as jest.Mock).mockImplementation(async () => seedAiResult());

        const plan = await precomposeMindSession({ force: true, seed });
        expect(plan).not.toBeNull();
        expect(plan?.moves[0]?.kind).toBe("state-check");
      },
    );
  });

  describe("MindRoute Screen Integration (NP-102)", () => {
    it("renders cached AI plan if ready and adopts it", async () => {
      const cachedPlan: MindSessionPlan = {
        intro: { title: "Cached AI Power Session", subtitle: "Pre-composed for you" },
        moves: [
          { id: "sc-1", kind: "state-check", title: "Check", xp: 5 },
          { id: "id-1", kind: "identity", title: "Identity", statement: "I am ready.", xp: 10 },
        ],
        rewardXp: 15,
      };

      await AsyncStorage.setItem(
        MIND_AI_PLAN_KEY,
        JSON.stringify({ plan: cachedPlan, ts: Date.now() }),
      );

      (apiFetch as jest.Mock).mockImplementation(async (endpoint: string) => {
        if (endpoint.includes("/api/mind/identity")) {
          return { profile: { onboardingCompleted: true } };
        }
        if (endpoint.includes("/api/mind/progress")) {
          return { chapter: 1, xp: 0, unlockedSystems: ["state-shift"], mainSessionCount: 0 };
        }
        if (endpoint.includes("/api/mind/session")) {
          return { streak: 1, mainSessionAvailable: true };
        }
        if (endpoint.includes("/api/mind/state")) {
          return { logs: [] };
        }
        if (endpoint.includes("/api/mind/mission")) {
          return { mission: { dailyAction: "Action" } };
        }
        if (endpoint.includes("/api/progress")) {
          return { points: [] };
        }
        return {};
      });

      const { getByTestId } = render(<MindRoute />);

      await waitFor(() => {
        expect(getByTestId("mind-session-title")).toHaveTextContent("Cached AI Power Session");
      });
    });

    it("with AI declined, Mind home renders deterministic session and raises no prompt", async () => {
      await AsyncStorage.clear();

      (apiFetch as jest.Mock).mockImplementation(async (endpoint: string) => {
        if (endpoint.includes("/api/mind/identity")) {
          return { profile: { onboardingCompleted: true } };
        }
        if (endpoint.includes("/api/mind/progress")) {
          return { chapter: 1, xp: 0, unlockedSystems: ["state-shift"], mainSessionCount: 0 };
        }
        if (endpoint.includes("/api/mind/session")) {
          return { streak: 1, mainSessionAvailable: true };
        }
        if (endpoint.includes("/api/mind/state")) {
          return { logs: [] };
        }
        if (endpoint.includes("/api/mind/mission")) {
          return { mission: { dailyAction: "Action" } };
        }
        if (endpoint.includes("/api/progress")) {
          return { points: [] };
        }
        return {};
      });

      // AI run refuses with ai_consent
      (runAiTask as jest.Mock).mockResolvedValue({
        ok: false,
        error: "ai_consent",
      });

      const { getByTestId } = render(<MindRoute />);

      // Should render deterministic session
      await waitFor(() => {
        expect(getByTestId("mind-session-card")).toBeTruthy();
        expect(getByTestId("mind-session-title")).toBeTruthy();
      });

      // No consent prompt or upgrade sheet
      expect(getAiConsentPromptState().open).toBe(false);
      expect(getUpgradeSheetGate()).toBeNull();
    });
  });
});
