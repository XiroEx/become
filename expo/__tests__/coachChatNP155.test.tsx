/* eslint-disable import/first */
// NP-155 — COACH CHAT, NATIVE, FOR THE MIND COACH AND THE NUTRITION CONSULTANT.
//
// Native port of `webapp/components/ai/CoachChat.tsx:62-127`:
// `expo/components/ai/CoachChat.tsx`, entry points
// `expo/components/mind/MindCoachTeaser.tsx` and
// `expo/components/nutrition/NutritionConsultantTeaser.tsx`, thread
// persistence `expo/lib/ai/coachChatStore.ts`.
//
// Acceptance:
//  - (e015ca29) a member chats with the coach natively, closes the sheet
//    mid-reply, reopens it and sees the answer;
//  - (e015ca2a) a spend-cap refusal never shows the upgrade sheet;
//  - (e015ca2b) the nutrition consultant's first suggestion quotes the
//    calories and protein left today.

import { act, fireEvent, render, waitFor } from "@testing-library/react-native";

/** Let the (async, AsyncStorage-backed) hydration effect resolve before a
 *  test interacts with the composer — mirrors a real member, who cannot
 *  possibly type and send inside the same tick the sheet mounted. */
async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

const mockUser: { id: string; email: string } | null = {
  id: "member-1",
  email: "member@example.com",
};

jest.mock("@/lib/auth/useAuth", () => ({
  useAuth: () => ({
    user: mockUser,
    token: "test-jwt",
    loading: false,
    isAuthed: true,
    setToken: jest.fn(),
    refresh: jest.fn(),
    logout: jest.fn(),
  }),
}));

jest.mock("@/lib/entitlements/upgradeSheet", () => ({
  showUpgradeSheet: jest.fn(),
  hideUpgradeSheet: jest.fn(),
  getUpgradeSheetGate: jest.fn(() => null),
  subscribeToUpgradeSheet: jest.fn(() => () => {}),
}));

jest.mock("@/lib/ai/aiConsentPrompt", () => ({
  showAiConsentPrompt: jest.fn(),
  raiseAiConsentPrompt: jest.fn(),
  hideAiConsentPrompt: jest.fn(),
  getAiConsentPromptState: jest.fn(() => ({
    open: false,
    error: null,
    provider: "Google Gemini",
  })),
  subscribeToAiConsentPrompt: jest.fn(() => () => {}),
  executeWithAiConsent: jest.fn(),
}));

import AsyncStorage from "@react-native-async-storage/async-storage";
import { CoachChat } from "@/components/ai/CoachChat";
import { MindCoachTeaser } from "@/components/mind/MindCoachTeaser";
import { NutritionConsultantTeaser } from "@/components/nutrition/NutritionConsultantTeaser";
import {
  configureAiRunClient,
  resetAiRunStore,
  runStore,
} from "@/lib/ai/runClient";
import { showUpgradeSheet } from "@/lib/entitlements/upgradeSheet";
import { raiseAiConsentPrompt } from "@/lib/ai/aiConsentPrompt";
import {
  clearAllCoachChats,
  coachChatStorageKey,
  loadCoachChat,
  saveCoachChat,
} from "@/lib/ai/coachChatStore";
import { createMemoryAsyncStorage } from "@/lib/query/persistor";
/* eslint-enable import/first */

const mockShowUpgrade = showUpgradeSheet as unknown as jest.Mock;
const mockRaiseConsent = raiseAiConsentPrompt as unknown as jest.Mock;

function jsonResponse(
  status: number,
  body?: unknown,
  headers?: Record<string, string>,
): Response {
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

beforeEach(async () => {
  resetAiRunStore();
  mockShowUpgrade.mockClear();
  mockRaiseConsent.mockClear();
  await AsyncStorage.clear();
  configureAiRunClient({
    baseUrl: "https://become.redbtn.io",
    getToken: async () => "test-jwt",
    storage: createMemoryAsyncStorage(),
    now: () => Date.now(),
    pollMs: 15,
    timeoutMs: 5000,
  });
});

afterEach(async () => {
  resetAiRunStore();
  await AsyncStorage.clear();
  jest.clearAllMocks();
});

describe("NP-155 coach chat thread store (member scoping)", () => {
  it("keys the thread by member AND chat — `become.chat.<memberId>.<persistKey>`", () => {
    expect(coachChatStorageKey("mind-coach", "member-1")).toBe(
      "become.chat.member-1.mind-coach",
    );
    expect(coachChatStorageKey("mind-coach", "member-2")).toBe(
      "become.chat.member-2.mind-coach",
    );
  });

  it("does not persist a thread with no signed-in member (nothing durable to key it by)", async () => {
    expect(coachChatStorageKey("mind-coach", null)).toBeNull();
    await saveCoachChat("mind-coach", null, {
      messages: [{ role: "user", text: "hi" }],
      pendingRunId: null,
    });
    expect(await loadCoachChat("mind-coach", null)).toBeNull();
  });

  it("two members never share a thread (fixes the web's chat-only key)", async () => {
    await saveCoachChat("mind-coach", "member-1", {
      messages: [{ role: "user", text: "member 1's secret" }],
      pendingRunId: null,
    });
    const forMember2 = await loadCoachChat("mind-coach", "member-2");
    expect(forMember2).toBeNull();
    const forMember1 = await loadCoachChat("mind-coach", "member-1");
    expect(forMember1?.messages[0]?.text).toBe("member 1's secret");
  });

  it("sign-out sweeps every member's coach chat thread off the device", async () => {
    await saveCoachChat("mind-coach", "member-1", {
      messages: [{ role: "user", text: "a" }],
      pendingRunId: null,
    });
    await saveCoachChat("nutrition-consultant", "member-2", {
      messages: [{ role: "user", text: "b" }],
      pendingRunId: null,
    });
    await AsyncStorage.setItem("become.cache.v1.member-1.other", "x");

    await clearAllCoachChats();

    expect(await loadCoachChat("mind-coach", "member-1")).toBeNull();
    expect(await loadCoachChat("nutrition-consultant", "member-2")).toBeNull();
    // Unrelated keys are untouched.
    expect(await AsyncStorage.getItem("become.cache.v1.member-1.other")).toBe("x");
  });
});

describe("(id: e015ca29) chats with the coach, closes mid-reply, reopens and sees the answer", () => {
  it("resumes a reply that finished while the sheet was closed", async () => {
    // The GET poll HANGS until the test releases it — deterministic
    // "mid-reply": the run is provably still pending (not racing real
    // timers against the poll interval) until we say otherwise.
    let getCallCount = 0;
    const releaseGetRef: { current: (() => void) | null } = { current: null };
    const mockFetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      const method = init?.method ?? "GET";
      if (url.includes("/api/ai/consultant") && method === "POST") {
        return jsonResponse(200, { ok: true, runId: "run-1" });
      }
      if (url.includes("/api/ai/run/run-1") && method === "GET") {
        getCallCount += 1;
        await new Promise<void>((resolve) => {
          releaseGetRef.current = resolve;
        });
        return jsonResponse(200, {
          status: "done",
          ok: true,
          text: "Here's the plan: start with the smallest honest step today.",
        });
      }
      return jsonResponse(404, {});
    });
    configureAiRunClient({ fetchImpl: mockFetch as unknown as typeof fetch });

    const first = render(
      <CoachChat
        testID="mind-coach-chat"
        visible
        onClose={() => {}}
        endpoint="/api/ai/consultant"
        domain="mindset"
        persistKey="mind-coach"
        title="Your mindset coach"
        greeting="I'm here. What's loudest right now?"
      />,
    );
    await settle();

    fireEvent.changeText(
      first.getByTestId("mind-coach-chat-input"),
      "I keep starting and quitting",
    );
    fireEvent.press(first.getByTestId("mind-coach-chat-send"));

    // The poll has fired and is hanging (deterministically pending) —
    // the member's message is on screen and the thread (message + the
    // in-flight run) is durably persisted. This is "mid-reply".
    await waitFor(() => {
      expect(getCallCount).toBeGreaterThanOrEqual(1);
    });
    expect(runStore.getRun("run-1")?.status).toBe("pending");
    await waitFor(async () => {
      const stored = await loadCoachChat("mind-coach", "member-1");
      expect(stored?.messages.map((m) => m.text)).toEqual([
        "I'm here. What's loudest right now?",
        "I keep starting and quitting",
      ]);
      expect(stored?.pendingRunId).toBe("run-1");
    });

    // Close the sheet (unmount — the hardest case: not just a `visible`
    // toggle but the component actually leaving the tree, the way a teaser
    // that only renders the chat while `open` would).
    first.unmount();

    // The run keeps going at the app level regardless of which screen is
    // mounted (NP-038) — it finishes while nothing is watching it.
    releaseGetRef.current?.();
    await waitFor(() => {
      expect(runStore.getRun("run-1")?.status).toBe("done");
    });

    // Reopen: a brand new mounted instance, same member, same persistKey.
    const second = render(
      <CoachChat
        testID="mind-coach-chat"
        visible
        onClose={() => {}}
        endpoint="/api/ai/consultant"
        domain="mindset"
        persistKey="mind-coach"
        title="Your mindset coach"
        greeting="I'm here. What's loudest right now?"
      />,
    );

    await waitFor(() => {
      expect(
        second.getByText(
          "Here's the plan: start with the smallest honest step today.",
        ),
      ).toBeTruthy();
    });
    // The member's own message survived too.
    expect(second.getByText("I keep starting and quitting")).toBeTruthy();
  });
});

describe("(id: e015ca2a) a spend-cap refusal never shows the upgrade sheet", () => {
  it("shows the server's plain try-again-later line as the coach's answer, and never the upgrade sheet", async () => {
    const mockFetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      const method = init?.method ?? "GET";
      if (url.includes("/api/ai/consultant") && method === "POST") {
        return jsonResponse(
          429,
          {
            error: "You've sent a lot of messages — try again in a bit.",
            reason: "rate_limit",
            limit: 20,
            remaining: 0,
            resetsAt: "2026-10-06T00:00:00.000Z",
          },
        );
      }
      return jsonResponse(404, {});
    });
    configureAiRunClient({ fetchImpl: mockFetch as unknown as typeof fetch });

    const { getByTestId, getByText } = render(
      <CoachChat
        testID="mind-coach-chat"
        visible
        onClose={() => {}}
        endpoint="/api/ai/consultant"
        domain="mindset"
        persistKey="mind-coach"
        title="Your mindset coach"
        greeting="I'm here. What's loudest right now?"
      />,
    );
    await settle();

    fireEvent.changeText(getByTestId("mind-coach-chat-input"), "one more please");
    fireEvent.press(getByTestId("mind-coach-chat-send"));

    await waitFor(() => {
      expect(
        getByText("You've sent a lot of messages — try again in a bit."),
      ).toBeTruthy();
    });

    expect(mockShowUpgrade).not.toHaveBeenCalled();
    expect(mockRaiseConsent).not.toHaveBeenCalled();
  });

  it("a consent refusal opens the consent prompt instead", async () => {
    const mockFetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      const method = init?.method ?? "GET";
      if (url.includes("/api/ai/consultant") && method === "POST") {
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
      return jsonResponse(404, {});
    });
    configureAiRunClient({ fetchImpl: mockFetch as unknown as typeof fetch });

    const { getByTestId } = render(
      <CoachChat
        testID="mind-coach-chat"
        visible
        onClose={() => {}}
        endpoint="/api/ai/consultant"
        domain="mindset"
        persistKey="mind-coach"
        title="Your mindset coach"
        greeting="I'm here. What's loudest right now?"
      />,
    );
    await settle();

    fireEvent.changeText(getByTestId("mind-coach-chat-input"), "hello");
    fireEvent.press(getByTestId("mind-coach-chat-send"));

    await waitFor(() => {
      expect(mockRaiseConsent).toHaveBeenCalledTimes(1);
    });
    expect(mockShowUpgrade).not.toHaveBeenCalled();
  });
});

describe("(id: e015ca2b) the nutrition consultant's first suggestion quotes calories and protein left today", () => {
  it("leads with a prompt built from the remaining calories and protein", async () => {
    const { getByTestId, getByText } = render(
      <NutritionConsultantTeaser
        remaining={{ calories: 450, protein: 32 }}
      />,
    );

    fireEvent.press(getByTestId("nutrition-consultant-teaser"));

    await waitFor(() => {
      expect(
        getByText(
          "What should I eat to hit my remaining 450 cal and 32g protein today?",
        ),
      ).toBeTruthy();
    });
  });

  it("drops the macros prompt once today's budget is essentially spent", async () => {
    const { getByTestId, queryByText } = render(
      <NutritionConsultantTeaser remaining={{ calories: 10, protein: 1 }} />,
    );

    fireEvent.press(getByTestId("nutrition-consultant-teaser"));

    await waitFor(() => {
      expect(queryByText("Plan my dinner around 40g protein")).toBeTruthy();
    });
    expect(
      queryByText(/What should I eat to hit my remaining/),
    ).toBeNull();
  });
});

describe("Mind coach entry point", () => {
  it("opens the shared CoachChat against /api/ai/consultant (domain mindset)", async () => {
    const { getByTestId } = render(<MindCoachTeaser />);
    fireEvent.press(getByTestId("mind-coach-teaser"));
    await waitFor(() => {
      expect(getByTestId("mind-coach-chat-title").props.children).toBe(
        "Your mindset coach",
      );
    });
  });
});
