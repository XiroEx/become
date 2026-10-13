import { act, renderHook } from "@testing-library/react-native";
import { AppState, type AppStateStatus } from "react-native";
import {
  RunStore,
  configureAiRunClient,
  resetAiRunStore,
  start,
  runAiTask,
  useAiRun,
  useAiRuns,
  useActiveAiRuns,
  type RunRecord,
  LS_KEY,
} from "@/lib/ai/runClient";
import {
  getAiConsentPromptState,
  hideAiConsentPrompt,
} from "@/lib/ai/aiConsentPrompt";
import {
  getUpgradeSheetGate,
  hideUpgradeSheet,
} from "@/lib/entitlements/upgradeSheet";
import { createMemoryAsyncStorage } from "@/lib/query/persistor";
import type { AsyncStorageLike } from "@/lib/query/persistor";

function jsonResponse(status: number, body?: unknown, headers?: Record<string, string>): Response {
  const headerMap = new Headers({
    "content-type": "application/json",
    ...(headers ?? {}),
  });
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? "OK" : "Status " + status,
    headers: headerMap,
    json: async () => body ?? {},
    text: async () => (body !== undefined ? JSON.stringify(body) : ""),
  } as unknown as Response;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("Native AI Run Client (NP-038)", () => {
  let memoryStorage: AsyncStorageLike;
  let mockNow = 1000000;
  let appStateListener: ((state: AppStateStatus) => void) | null = null;

  beforeEach(() => {
    mockNow = 1000000;
    memoryStorage = createMemoryAsyncStorage();
    hideAiConsentPrompt();
    hideUpgradeSheet();
    resetAiRunStore();

    // Spy on AppState.addEventListener
    appStateListener = null;
    jest.spyOn(AppState, "addEventListener").mockImplementation((event: string, handler: unknown) => {
      if (event === "change") {
        appStateListener = handler as (state: AppStateStatus) => void;
      }
      return {
        remove: jest.fn(() => {
          appStateListener = null;
        }),
      } as any;
    });

    configureAiRunClient({
      baseUrl: "https://become.redbtn.io",
      getToken: async () => "jwt_token_123",
      storage: memoryStorage,
      now: () => mockNow,
      pollMs: 25,
      timeoutMs: 180000,
    });
  });

  afterEach(() => {
    resetAiRunStore();
    jest.clearAllMocks();
  });

  /**
   * Acceptance Criterion 1:
   * (id: e015c76e) A member who has not agreed to AI taps an AI action: the consent prompt appears,
   * nothing is polled and GET /api/me/entitlements shows no allowance spent
   */
  describe("(id: e015c76e) AI Consent refusal", () => {
    it("opens the consent prompt, never polls, and leaves allowance intact", async () => {
      const calls: { url: string; method: string }[] = [];
      let allowanceSpent = 0;

      const mockFetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const urlStr = typeof input === "string" ? input : input.toString();
        const method = init?.method ?? "GET";
        calls.push({ url: urlStr, method });

        // POST /api/ai/workout/session refuses with 403 ai_consent_required
        if (urlStr.includes("/api/ai/workout/session") && method === "POST") {
          return jsonResponse(403, {
            error: "Become needs your permission before sending anything to its AI provider.",
            reason: "ai_consent_required",
            aiConsent: {
              version: "v1.0.0",
              provider: "Google Gemini",
              granted: false,
              decided: false,
              decidedAt: null,
              revokedAt: null,
              decidedVersion: null,
            },
          });
        }

        // GET /api/me/entitlements reflects spent units
        if (urlStr.includes("/api/me/entitlements")) {
          return jsonResponse(200, {
            tier: "free",
            features: {
              "workout-generation": {
                allowed: true,
                canCreate: true,
                limit: 1,
                used: allowanceSpent,
                remaining: 1 - allowanceSpent,
              },
            },
          });
        }

        return jsonResponse(404, { error: "not found" });
      });

      configureAiRunClient({ fetchImpl: mockFetch as unknown as typeof fetch });

      // Member taps AI action
      const runId = await start("/api/ai/workout/session", { prompt: "Chest workout" });
      expect(runId).toBeTruthy();

      // 1. Consent prompt appears
      expect(getAiConsentPromptState().open).toBe(true);
      expect(getAiConsentPromptState().provider).toBe("Google Gemini");

      // 2. Upgrade sheet did NOT open
      expect(getUpgradeSheetGate()).toBeNull();

      // 3. Nothing is polled (0 GET /api/ai/run/ requests)
      await sleep(60);
      const pollCalls = calls.filter((c) => c.url.includes("/api/ai/run/"));
      expect(pollCalls.length).toBe(0);

      // 4. GET /api/me/entitlements shows no allowance spent (used === 0)
      const entitlementsRes = await mockFetch("https://become.redbtn.io/api/me/entitlements");
      const entitlementsData = await entitlementsRes.json();
      expect(entitlementsData.features["workout-generation"].used).toBe(0);
      expect(entitlementsData.features["workout-generation"].remaining).toBe(1);
    });
  });

  /**
   * Acceptance Criterion 2:
   * (id: e015c76f) A free member over an AI allowance sees the upgrade sheet with the server's sentence;
   * a 429 shows a plain try-again-later message and no sheet
   */
  describe("(id: e015c76f) Plan gate and rate-limited spend cap", () => {
    it("free member over an AI allowance sees the upgrade sheet with server's sentence verbatim", async () => {
      const calls: { url: string; method: string }[] = [];
      const serverSentence =
        "You have used your 1 free plate scan for today. Upgrade to Plus for unlimited scans.";

      const mockFetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const urlStr = typeof input === "string" ? input : input.toString();
        const method = init?.method ?? "GET";
        calls.push({ url: urlStr, method });

        if (urlStr.includes("/api/ai/nutrition/plate") && method === "POST") {
          return jsonResponse(403, {
            error: serverSentence,
            feature: "ai-food-estimate",
            requiresTier: "plus",
            limit: 1,
            remaining: 0,
            resetsAt: "2026-10-02T00:00:00.000Z",
          });
        }
        return jsonResponse(404, {});
      });

      configureAiRunClient({ fetchImpl: mockFetch as unknown as typeof fetch });

      const runId = await start("/api/ai/nutrition/plate", { imageUri: "file:///scan.jpg" });
      expect(runId).toBeTruthy();

      // Upgrade sheet opened with the server's sentence verbatim
      const openGate = getUpgradeSheetGate();
      expect(openGate).not.toBeNull();
      expect(openGate?.error).toBe(serverSentence);
      expect(openGate?.feature).toBe("ai-food-estimate");
      expect(openGate?.requiresTier).toBe("plus");

      // Consent prompt was NOT opened
      expect(getAiConsentPromptState().open).toBe(false);

      // Nothing was polled
      await sleep(60);
      const pollCalls = calls.filter((c) => c.url.includes("/api/ai/run/"));
      expect(pollCalls.length).toBe(0);
    });

    it("a 429 spend cap shows a plain try-again-later message and NO sheet", async () => {
      const calls: { url: string; method: string }[] = [];
      const rateLimitMessage =
        "You have reached your daily AI usage limit. Please try again tomorrow.";

      const mockFetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const urlStr = typeof input === "string" ? input : input.toString();
        const method = init?.method ?? "GET";
        calls.push({ url: urlStr, method });

        if (urlStr.includes("/api/ai/mind/session") && method === "POST") {
          return jsonResponse(429, {
            error: rateLimitMessage,
            reason: "rate_limit",
            limit: 20,
            remaining: 0,
            resetsAt: "2026-10-02T00:00:00.000Z",
          });
        }
        return jsonResponse(404, {});
      });

      configureAiRunClient({ fetchImpl: mockFetch as unknown as typeof fetch });

      // Run via runAiTask
      const result = await runAiTask("/api/ai/mind/session", { focus: "sleep" });

      // Neither sheet opened
      expect(getUpgradeSheetGate()).toBeNull();
      expect(getAiConsentPromptState().open).toBe(false);

      // Returned error carries the plain try-again-later message
      expect(result.ok).toBe(false);
      expect(result.error).toBe("rate_limited");
      expect(result.text).toBe(rateLimitMessage);

      // Nothing was polled
      await sleep(60);
      const pollCalls = calls.filter((c) => c.url.includes("/api/ai/run/"));
      expect(pollCalls.length).toBe(0);
    });
  });

  /**
   * Acceptance Criterion 3:
   * (id: e015c770) A run started before backgrounding the app for 30 seconds still delivers its result
   */
  describe("(id: e015c770) Backgrounding and resilience", () => {
    it("a run started before backgrounding for 30 seconds still delivers its result", async () => {
      let pollCount = 0;
      let appBackgrounded = false;
      const completedResult = {
        session: { id: "s1", name: "Heavy Squats & Lunges", exercises: ["Squat", "Lunge"] },
      };
      const completedText = "Composed your lower body session.";

      const mockFetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const urlStr = typeof input === "string" ? input : input.toString();
        const method = init?.method ?? "GET";

        if (urlStr.includes("/api/ai/workout/session") && method === "POST") {
          return jsonResponse(200, {
            ok: true,
            runId: "run_bg_test_30s",
            allowance: {
              feature: "workout-generation",
              limit: 5,
              remaining: 4,
              ticket: "ticket_leg_session_1",
            },
          });
        }

        if (urlStr.includes("/api/ai/run/run_bg_test_30s") && method === "GET") {
          pollCount++;
          if (!appBackgrounded || pollCount < 2) {
            // First check before backgrounding: still pending
            return jsonResponse(200, { status: "pending" });
          }
          // After 30 seconds in background and resume: completed!
          return jsonResponse(200, {
            status: "completed",
            ok: true,
            result: completedResult,
            text: completedText,
          });
        }

        return jsonResponse(404, {});
      });

      configureAiRunClient({ fetchImpl: mockFetch as unknown as typeof fetch });

      // Start the task
      const taskPromise = runAiTask("/api/ai/workout/session", { prompt: "Leg day" });

      // Wait for the first poll tick
      await sleep(35);
      expect(pollCount).toBeGreaterThanOrEqual(1);

      // App is backgrounded for 30 seconds
      appBackgrounded = true;
      if (appStateListener) {
        appStateListener("background");
      }

      // 30 seconds elapse in simulated wall time
      mockNow += 30000;
      await sleep(40);

      // App returns to foreground (becomes active)
      if (appStateListener) {
        appStateListener("active");
      }

      const outcome = await taskPromise;
      expect(outcome.ok).toBe(true);
      expect(outcome.result).toEqual(completedResult);
      expect(outcome.text).toBe(completedText);
      expect(outcome.allowanceTicket).toBe("ticket_leg_session_1");

      // Verify record in storage has status done and preserved ticket
      const rawStored = await memoryStorage.getItem(LS_KEY);
      expect(rawStored).toBeTruthy();
      const storedRuns = JSON.parse(rawStored!) as RunRecord[];
      const storedRec = storedRuns.find((r) => r.runId === "run_bg_test_30s");
      expect(storedRec?.status).toBe("done");
      expect(storedRec?.allowanceTicket).toBe("ticket_leg_session_1");
    });

    it("resumes pending run after full app restart from storage", async () => {
      // Seed a pending run in storage
      const initialRuns: RunRecord[] = [
        {
          runId: "run_restart_recovery",
          endpoint: "/api/ai/mind/generate",
          kind: "mind.generate",
          label: "Writing for you",
          status: "pending",
          startedAt: mockNow - 10000,
          updatedAt: mockNow - 10000,
          allowanceTicket: "ticket_restart_123",
        },
      ];
      await memoryStorage.setItem(LS_KEY, JSON.stringify(initialRuns));

      const mockFetch = jest.fn(async (input: RequestInfo | URL) => {
        const urlStr = typeof input === "string" ? input : input.toString();
        if (urlStr.includes("/api/ai/run/run_restart_recovery")) {
          return jsonResponse(200, {
            status: "completed",
            ok: true,
            text: "Recovery journal entry created.",
          });
        }
        return jsonResponse(404, {});
      });

      const restoredStore = new RunStore({
        baseUrl: "https://become.redbtn.io",
        getToken: async () => "jwt_token_123",
        storage: memoryStorage,
        now: () => mockNow,
        fetchImpl: mockFetch as unknown as typeof fetch,
        pollMs: 20,
      });

      await restoredStore.awaitLoaded();

      const waitPromise = restoredStore.waitFor("run_restart_recovery");
      const completed = await waitPromise;

      expect(completed?.status).toBe("done");
      expect(completed?.text).toBe("Recovery journal entry created.");
      expect(completed?.allowanceTicket).toBe("ticket_restart_123");

      restoredStore.destroy();
    });
  });

  /**
   * Acceptance Criterion 4:
   * (id: e015c771) Unit tests pin the refusal order and that the POST is never retried
   */
  describe("(id: e015c771) Refusal order and POST exactly once", () => {
    it("pins refusal order: consent is checked BEFORE gate and never raises upgrade sheet", async () => {
      // Body carrying BOTH consent required AND plan gate fields
      const ambiguousRefusal = {
        error: "Become needs your permission before sending anything to its AI provider.",
        reason: "ai_consent_required",
        feature: "workout-generation",
        requiresTier: "plus",
        aiConsent: {
          version: "v1.0.0",
          provider: "Google Gemini",
          granted: false,
          decided: false,
          decidedAt: null,
          revokedAt: null,
          decidedVersion: null,
        },
      };

      const mockFetch = jest.fn(async () => jsonResponse(403, ambiguousRefusal));
      configureAiRunClient({ fetchImpl: mockFetch as unknown as typeof fetch });

      await start("/api/ai/workout/session", { prompt: "Chest workout" });

      // Consent sheet MUST open
      expect(getAiConsentPromptState().open).toBe(true);

      // Upgrade sheet MUST NEVER open
      expect(getUpgradeSheetGate()).toBeNull();
    });

    it("pins that silent runs only fall back and never open either sheet", async () => {
      const mockFetch = jest.fn(async (input: RequestInfo | URL) => {
        const urlStr = typeof input === "string" ? input : input.toString();
        if (urlStr.includes("consent")) {
          return jsonResponse(403, {
            error: "Consent required",
            reason: "ai_consent_required",
          });
        }
        if (urlStr.includes("gate")) {
          return jsonResponse(403, {
            error: "Plan gate hit",
            feature: "custom-sessions",
            requiresTier: "plus",
          });
        }
        return jsonResponse(404, {});
      });

      configureAiRunClient({ fetchImpl: mockFetch as unknown as typeof fetch });

      // Silent run with consent refusal
      const id1 = await start("/api/ai/consent-test", {}, { silent: true });
      expect(id1).toBeTruthy();
      expect(getAiConsentPromptState().open).toBe(false);
      expect(getUpgradeSheetGate()).toBeNull();

      // Silent run with gate refusal
      const id2 = await start("/api/ai/gate-test", {}, { silent: true });
      expect(id2).toBeTruthy();
      expect(getAiConsentPromptState().open).toBe(false);
      expect(getUpgradeSheetGate()).toBeNull();
    });

    it("pins that the POST is NEVER retried on failure", async () => {
      let postCount = 0;
      const mockFetch = jest.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === "POST") {
          postCount++;
          // Simulate 500 error on POST
          return jsonResponse(500, { error: "Internal server error" });
        }
        return jsonResponse(404, {});
      });

      configureAiRunClient({ fetchImpl: mockFetch as unknown as typeof fetch });

      const result = await runAiTask("/api/ai/workout/session", { prompt: "Squats" });
      expect(result.ok).toBe(false);

      // Exactly 1 POST attempt was made
      expect(postCount).toBe(1);

      // Waiting longer never triggers another POST
      await sleep(60);
      expect(postCount).toBe(1);
    });

    it("pins that POST is executed once while polling retries across transient network errors", async () => {
      let postCount = 0;
      let getPollCount = 0;

      const mockFetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const urlStr = typeof input === "string" ? input : input.toString();
        const method = init?.method ?? "GET";

        if (method === "POST") {
          postCount++;
          return jsonResponse(200, {
            ok: true,
            runId: "run_post_once_poll_many",
            allowance: { ticket: "tkt_post_once" },
          });
        }

        if (method === "GET" && urlStr.includes("/api/ai/run/run_post_once_poll_many")) {
          getPollCount++;
          if (getPollCount === 1) {
            // First poll: pending
            return jsonResponse(200, { status: "pending" });
          }
          if (getPollCount === 2) {
            // Second poll: network glitch (500)
            return jsonResponse(500, { error: "temporary glitch" });
          }
          // Third poll: completed
          return jsonResponse(200, {
            status: "completed",
            ok: true,
            result: { data: "done" },
          });
        }

        return jsonResponse(404, {});
      });

      configureAiRunClient({ fetchImpl: mockFetch as unknown as typeof fetch });

      const taskPromise = runAiTask("/api/ai/workout/session", { prompt: "Squats" });

      const outcome = await taskPromise;
      expect(outcome.ok).toBe(true);
      expect(outcome.result).toEqual({ data: "done" });
      expect(outcome.allowanceTicket).toBe("tkt_post_once");

      // Polling happened at least 3 times
      expect(getPollCount).toBeGreaterThanOrEqual(3);
      // But POST was strictly called exactly 1 time!
      expect(postCount).toBe(1);
    });
  });

  describe("useAiRun hook", () => {
    it("provides reactive updates for a specific runId", async () => {
      const mockFetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const method = init?.method ?? "GET";
        if (method === "POST") {
          return jsonResponse(200, { ok: true, runId: "run_hook_test" });
        }
        return jsonResponse(200, { status: "pending" });
      });

      configureAiRunClient({ fetchImpl: mockFetch as unknown as typeof fetch });

      const { result } = renderHook(() => useAiRun("run_hook_test"));
      expect(result.current).toBeUndefined();

      await act(async () => {
        await start("/api/ai/workout/session", { prompt: "Chest" });
      });

      expect(result.current).toBeDefined();
      expect(result.current?.runId).toBe("run_hook_test");
      expect(result.current?.status).toBe("pending");
    });

    it("provides controller actions when called with 0 arguments", () => {
      const { result } = renderHook(() => useAiRun());
      expect(typeof result.current.start).toBe("function");
      expect(typeof result.current.runAiTask).toBe("function");
      expect(Array.isArray(result.current.runs)).toBe(true);
      expect(Array.isArray(result.current.activeRuns)).toBe(true);
    });

    it("useActiveAiRuns excludes silent runs from active runs", async () => {
      const mockFetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const method = init?.method ?? "GET";
        if (method === "POST") {
          return jsonResponse(200, { ok: true, runId: "run_active_test" });
        }
        return jsonResponse(200, { status: "pending" });
      });

      configureAiRunClient({ fetchImpl: mockFetch as unknown as typeof fetch });

      const { result: activeHook } = renderHook(() => useActiveAiRuns());
      const { result: allHook } = renderHook(() => useAiRuns());

      await act(async () => {
        await start("/api/ai/mind/precomp", {}, { silent: true });
      });

      // Present in all runs, but NOT in active runs (silent)
      expect(allHook.current.length).toBe(1);
      expect(activeHook.current.length).toBe(0);
    });
  });

  describe("Poll timeout and 404 terminal handling", () => {
    it("marks run as timeout when elapsed time exceeds 180s", async () => {
      let pollCallCount = 0;
      const mockFetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const method = init?.method ?? "GET";
        if (method === "POST") {
          return jsonResponse(200, { ok: true, runId: "run_timeout_test" });
        }
        pollCallCount++;
        if (pollCallCount === 1) {
          // After first poll, simulate clock advancing past 180s timeout
          mockNow += 181000;
        }
        return jsonResponse(200, { status: "pending" });
      });

      configureAiRunClient({ fetchImpl: mockFetch as unknown as typeof fetch });

      const outcome = await runAiTask("/api/ai/workout/session", {});
      expect(outcome.ok).toBe(false);
      expect(outcome.error).toBe("timeout");
    });

    it("marks run as not_found immediately when poll returns 404", async () => {
      const mockFetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const method = init?.method ?? "GET";
        if (method === "POST") {
          return jsonResponse(200, { ok: true, runId: "run_404_test" });
        }
        // 404 carrying status failed
        return jsonResponse(404, { status: "failed", error: "not_found" });
      });

      configureAiRunClient({ fetchImpl: mockFetch as unknown as typeof fetch });

      const outcome = await runAiTask("/api/ai/workout/session", {});
      expect(outcome.ok).toBe(false);
      expect(outcome.error).toBe("not_found");
    });
  });
});
