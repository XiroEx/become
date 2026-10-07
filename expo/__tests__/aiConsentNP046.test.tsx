/* eslint-disable import/first */
import { render, fireEvent, waitFor, act } from "@testing-library/react-native";
import { Text, View, Pressable } from "react-native";
import { useState } from "react";
import { ApiError, classifyApiError } from "@become/api-client";

const mockReplace = jest.fn();
const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    back: jest.fn(),
  }),
  useFocusEffect: (effect: () => void | (() => void)) => {
    // Run the focus effect on mount, like the screen coming into view.
    const React = jest.requireActual("react");
    React.useEffect(effect, [effect]);
  },
}));

function makeJwt(expiresAtMs: number, marker = "a"): string {
  const payload = Buffer.from(
    JSON.stringify({ userId: "u1", marker, exp: Math.floor(expiresAtMs / 1000) }),
    "utf8",
  ).toString("base64url");
  return `eyJhbGciOiJIUzI1NiJ9.${payload}.signature-${marker}`;
}

function jsonResponse(status: number, body?: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? "OK" : "Error",
    headers: new Headers({ "content-type": "application/json" }),
    json: async () => body ?? {},
    text: async () => JSON.stringify(body ?? {}),
  } as Response;
}

let mockStoredJwt: string | null = makeJwt(Date.now() + 86400000, "init");
jest.mock("@/lib/auth/secureStoreToken", () => {
  const actual = jest.requireActual("@/lib/auth/secureStoreToken");
  return {
    ...actual,
    sessionStore: {
      async get() {
        return mockStoredJwt;
      },
      async set(v: string) {
        mockStoredJwt = v;
      },
      async clear() {
        mockStoredJwt = null;
      },
    },
  };
});

import {
  AiConsentPromptHost,
  type AiConsentPromptDeps,
} from "@/components/ai/AiConsentPromptHost";
import {
  raiseAiConsentPrompt,
  hideAiConsentPrompt,
  executeWithAiConsent,
} from "@/lib/ai/aiConsentPrompt";
import { ApiErrorHandlerProvider, useApiErrorHandler } from "@/lib/errors";
import SettingsScreen from "@/app/(app)/settings";
import { AuthProvider } from "@/lib/auth/AuthProvider";

const FAKE_TOKEN = makeJwt(Date.now() + 86400000, "test");

const AI_CONSENT_REFUSAL_BODY = {
  error: "Become needs your permission before sending anything to its AI provider.",
  reason: "ai_consent_required",
  aiConsent: {
    version: "v1.0.0",
    provider: "Google Gemini",
    granted: false,
    decided: true,
    decidedAt: "2026-09-24T12:00:00.000Z",
    revokedAt: null,
    decidedVersion: "v1.0.0",
  },
};

describe("AI Consent Parity (NP-046)", () => {
  beforeEach(() => {
    mockStoredJwt = makeJwt(Date.now() + 86400000, "fresh");
    hideAiConsentPrompt();
    jest.clearAllMocks();
  });

  /**
   * Acceptance Criterion 1:
   * (id: e015c7a0) A member who declined at the gate and then starts an AI feature
   * sees the AI sheet, agrees, and the request succeeds
   */
  it("(id: e015c7a0) A member who declined at the gate and then starts an AI feature sees the AI sheet, agrees, and the request succeeds", async () => {
    const fetchCalls: { url: string; init?: RequestInit }[] = [];
    let aiCallCount = 0;

    const mockFetch = jest.fn(async (url: string, init?: RequestInit) => {
      fetchCalls.push({ url, init });

      // AI feature endpoint (e.g. /api/ai/nutrition/plate)
      if (url.includes("/api/ai/nutrition/plate")) {
        aiCallCount++;
        if (aiCallCount === 1) {
          // First attempt: member had declined at gate, so server refuses with 403 ai_consent_required
          return {
            ok: false,
            status: 403,
            json: async () => AI_CONSENT_REFUSAL_BODY,
          } as Response;
        }
        // Second attempt (retry after agreeing): succeeds!
        return {
          ok: true,
          status: 200,
          json: async () => ({ ok: true, calories: 520, description: "Grilled chicken bowl" }),
        } as Response;
      }

      // POST /api/me/ai-consent { accepted, source: "prompt" }
      if (url.includes("/api/me/ai-consent") && init?.method === "POST") {
        const body = JSON.parse(init.body as string);
        return {
          ok: true,
          status: 200,
          json: async () => ({
            granted: body.accepted,
            decided: true,
            version: "v1.0.0",
            provider: "Google Gemini",
            decidedAt: "2026-10-01T16:00:00.000Z",
          }),
        } as Response;
      }

      return {
        ok: true,
        status: 200,
        json: async () => ({}),
      } as Response;
    });

    const deps: AiConsentPromptDeps = {
      token: FAKE_TOKEN,
      baseUrl: "https://become-beta.redbtn.io",
      fetchImpl: mockFetch as any,
    };

    // Component representing an AI feature surface
    function AiFeatureScreen() {
      const handleApiError = useApiErrorHandler();
      const [result, setResult] = useState<string | null>(null);

      const runAiPlateScan = async () => {
        try {
          const res = await mockFetch("https://become-beta.redbtn.io/api/ai/nutrition/plate", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${FAKE_TOKEN}`,
            },
            body: JSON.stringify({ image: "base64data" }),
          });

          if (!res.ok) {
            const body = await res.json();
            throw new ApiError(res.status, body);
          }

          const data = await res.json();
          setResult(data.description);
        } catch (err) {
          // Caller passes onRetry so it can retry the action once on agree
          handleApiError(err, { onRetry: runAiPlateScan });
        }
      };

      return (
        <View testID="ai-feature-screen">
          <Pressable testID="scan-plate-button" onPress={runAiPlateScan}>
            <Text>Scan my plate</Text>
          </Pressable>
          {result ? <Text testID="scan-result">{result}</Text> : null}
        </View>
      );
    }

    const { getByTestId, queryByTestId, getByText } = render(
      <ApiErrorHandlerProvider
        onAiConsent={(err, opts) => raiseAiConsentPrompt(err, opts)}
      >
        <AiConsentPromptHost deps={deps} />
        <AiFeatureScreen />
      </ApiErrorHandlerProvider>,
    );

    // Initial state: consent sheet is not open
    expect(queryByTestId("ai-consent-prompt")).toBeNull();

    // 1. Member starts an AI feature by tapping "Scan my plate"
    await act(async () => {
      fireEvent.press(getByTestId("scan-plate-button"));
    });

    // 2. Request was refused (403 ai_consent_required), error handler sees ai-consent and opens AI sheet
    await waitFor(() => {
      expect(getByTestId("ai-consent-prompt")).toBeTruthy();
    });

    // Sheet displays the gate's AI copy
    expect(getByTestId("ai-consent-prompt-title").props.children).toBe("One thing about AI");
    expect(getByTestId("ai-consent-prompt-standfirst").props.children).toContain(
      "Become uses AI for some of its work, and that means sending what you submit to Google Gemini.",
    );
    expect(getByText(/I agree to share my meal photos/)).toBeTruthy();

    // The checkbox is NOT pre-ticked (App Store Guideline 5.1.2(i))
    const checkbox = getByTestId("ai-consent-checkbox");
    expect(checkbox.props.accessibilityState?.checked).toBe(false);

    // Button label starts as "Save and continue"
    const agreeButton = getByTestId("consent-gate-agree");
    expect(agreeButton.props.accessibilityLabel).toBe("Save and continue");

    // 3. Member ticks the AI consent checkbox to agree
    fireEvent.press(checkbox);
    expect(agreeButton.props.accessibilityLabel).toBe("Allow and continue");

    // 4. Member taps "Allow and continue"
    await act(async () => {
      fireEvent.press(agreeButton);
    });

    // 5. Native posts source: "prompt" with accepted: true
    await waitFor(() => {
      const consentPost = fetchCalls.find(
        (c) => c.url.includes("/api/me/ai-consent") && c.init?.method === "POST",
      );
      expect(consentPost).toBeDefined();
      expect(JSON.parse(consentPost?.init?.body as string)).toEqual({
        accepted: true,
        source: "prompt",
      });
    });

    // Sheet closes
    await waitFor(() => {
      expect(queryByTestId("ai-consent-prompt")).toBeNull();
    });

    // 6. The caller retries the action once, and the request succeeds!
    await waitFor(() => {
      expect(aiCallCount).toBe(2);
      expect(getByTestId("scan-result").props.children).toBe("Grilled chicken bowl");
    });
  });

  it("executeWithAiConsent retries action on agree and falls back on decline", async () => {
    let callCount = 0;
    const action = jest.fn(async () => {
      callCount++;
      if (callCount === 1) {
        throw new ApiError(403, AI_CONSENT_REFUSAL_BODY);
      }
      return { success: true, count: callCount };
    });

    const mockFetch = jest.fn(async (url: string, init?: RequestInit) => {
      if (url.includes("/api/me/ai-consent") && init?.method === "POST") {
        return {
          ok: true,
          status: 200,
          json: async () => ({ granted: true, decided: true }),
        } as Response;
      }
      return { ok: true, status: 200, json: async () => ({}) } as Response;
    });

    const deps: AiConsentPromptDeps = {
      token: FAKE_TOKEN,
      fetchImpl: mockFetch as any,
    };

    const { getByTestId } = render(
      <AiConsentPromptHost deps={deps} />,
    );

    // Call executeWithAiConsent
    let promiseResolved = false;
    let actionResult: any;
    act(() => {
      executeWithAiConsent(action).then((res) => {
        promiseResolved = true;
        actionResult = res;
      });
    });

    await waitFor(() => {
      expect(getByTestId("ai-consent-prompt")).toBeTruthy();
    });

    // Check AI box and agree
    fireEvent.press(getByTestId("ai-consent-checkbox"));
    await act(async () => {
      fireEvent.press(getByTestId("consent-gate-agree"));
    });

    await waitFor(() => {
      expect(promiseResolved).toBe(true);
      expect(actionResult).toEqual({ success: true, count: 2 });
    });
  });

  it("declining in the prompt posts accepted: false with source: 'prompt' and does not retry AI call", async () => {
    const fetchCalls: { url: string; init?: RequestInit }[] = [];
    let aiCallCount = 0;
    const onDecline = jest.fn();

    const mockFetch = jest.fn(async (url: string, init?: RequestInit) => {
      fetchCalls.push({ url, init });

      if (url.includes("/api/ai/nutrition/plate")) {
        aiCallCount++;
        return {
          ok: false,
          status: 403,
          json: async () => AI_CONSENT_REFUSAL_BODY,
        } as Response;
      }

      if (url.includes("/api/me/ai-consent") && init?.method === "POST") {
        return {
          ok: true,
          status: 200,
          json: async () => ({ granted: false, decided: true }),
        } as Response;
      }

      return { ok: true, status: 200, json: async () => ({}) } as Response;
    });

    const deps: AiConsentPromptDeps = {
      token: FAKE_TOKEN,
      baseUrl: "https://become-beta.redbtn.io",
      fetchImpl: mockFetch as any,
    };

    function AiFeatureScreen() {
      const handleApiError = useApiErrorHandler();

      const runAi = async () => {
        try {
          const res = await mockFetch("https://become-beta.redbtn.io/api/ai/nutrition/plate");
          if (!res.ok) throw new ApiError(res.status, await res.json());
        } catch (err) {
          handleApiError(err, {
            onRetry: runAi,
            onDecline,
          });
        }
      };

      return (
        <Pressable testID="run-ai-button" onPress={runAi}>
          <Text>Run</Text>
        </Pressable>
      );
    }

    const { getByTestId, queryByTestId } = render(
      <ApiErrorHandlerProvider
        onAiConsent={(err, opts) => raiseAiConsentPrompt(err, opts)}
      >
        <AiConsentPromptHost deps={deps} />
        <AiFeatureScreen />
      </ApiErrorHandlerProvider>,
    );

    // Run AI feature -> refused
    await act(async () => {
      fireEvent.press(getByTestId("run-ai-button"));
    });

    await waitFor(() => {
      expect(getByTestId("ai-consent-prompt")).toBeTruthy();
    });

    // Leave unticked and press "Save and continue"
    const button = getByTestId("consent-gate-agree");
    expect(button.props.accessibilityLabel).toBe("Save and continue");

    await act(async () => {
      fireEvent.press(button);
    });

    await waitFor(() => {
      const consentPost = fetchCalls.find(
        (c) => c.url.includes("/api/me/ai-consent") && c.init?.method === "POST",
      );
      expect(consentPost).toBeDefined();
      expect(JSON.parse(consentPost?.init?.body as string)).toEqual({
        accepted: false,
        source: "prompt",
      });
    });

    // Sheet closes, onDecline is called, action is NOT retried as AI
    await waitFor(() => {
      expect(queryByTestId("ai-consent-prompt")).toBeNull();
      expect(onDecline).toHaveBeenCalledTimes(1);
      expect(aiCallCount).toBe(1); // exactly 1, not retried
    });
  });

  it("dynamically displays provider name from refusal response", async () => {
    const customRefusal = {
      ...AI_CONSENT_REFUSAL_BODY,
      aiConsent: {
        ...AI_CONSENT_REFUSAL_BODY.aiConsent,
        provider: "Anthropic Claude",
      },
    };

    const deps: AiConsentPromptDeps = {
      token: FAKE_TOKEN,
      fetchImpl: jest.fn() as any,
    };

    const { getByTestId, getByText } = render(
      <AiConsentPromptHost deps={deps} />,
    );

    act(() => {
      raiseAiConsentPrompt(
        classifyApiError(new ApiError(403, customRefusal)) as any,
      );
    });

    await waitFor(() => {
      expect(getByTestId("ai-consent-prompt")).toBeTruthy();
    });

    expect(getByTestId("ai-consent-prompt-standfirst").props.children).toContain(
      "sending what you submit to Anthropic Claude.",
    );
    expect(getByText(/I agree to share my meal photos, .* with Anthropic Claude/)).toBeTruthy();
  });

  /**
   * Acceptance Criterion 2:
   * (id: e015c7a1) Turning the switch off natively makes the next AI request refuse,
   * and the web shows it off
   */
  it("(id: e015c7a1) Turning the switch off natively makes the next AI request refuse, and the web shows it off", async () => {
    // Shared simulated server state between native and web
    let serverAiConsent = {
      granted: true,
      decided: true,
      provider: "Google Gemini",
      decidedAt: "2026-09-24T12:00:00.000Z",
      revokedAt: null as string | null,
    };

    const fetchCalls: { url: string; init?: RequestInit }[] = [];

    const mockFetch = jest.fn(async (url: string, init?: RequestInit) => {
      fetchCalls.push({ url, init });

      if (url.includes("/api/auth/me")) {
        return jsonResponse(200, {
          user: { _id: "u1", name: "Alex Runner", email: "alex@example.com" },
        });
      }

      // GET /api/me/consent (read by both native Settings and web)
      if (url.includes("/api/me/consent") && (!init?.method || init.method === "GET")) {
        return jsonResponse(200, {
          current: true,
          termsVersion: "v1.2.0",
          acceptedAt: "2026-09-24T12:00:00.000Z",
          ai: { ...serverAiConsent },
        });
      }

      // DELETE /api/me/ai-consent (native turning switch off to withdraw)
      if (url.includes("/api/me/ai-consent") && init?.method === "DELETE") {
        const revokedAt = "2026-10-01T16:30:00.000Z";
        serverAiConsent = {
          ...serverAiConsent,
          granted: false,
          revokedAt,
        };
        return jsonResponse(200, { ...serverAiConsent });
      }

      // POST /api/me/ai-consent (native turning switch on)
      if (url.includes("/api/me/ai-consent") && init?.method === "POST") {
        const body = JSON.parse(init.body as string);
        serverAiConsent = {
          ...serverAiConsent,
          granted: body.accepted,
          decidedAt: "2026-10-01T16:35:00.000Z",
        };
        return jsonResponse(200, { ...serverAiConsent });
      }

      // Simulated AI route check (e.g. /api/ai/nutrition/plate)
      if (url.includes("/api/ai/nutrition/plate")) {
        if (!serverAiConsent.granted) {
          // When consent is withdrawn, the AI route refuses with 403 ai_consent_required
          return jsonResponse(403, {
            error: "Become needs your permission before sending anything to its AI provider.",
            reason: "ai_consent_required",
            aiConsent: { ...serverAiConsent },
          });
        }
        return jsonResponse(200, { ok: true });
      }

      if (url.includes("/api/notifications/preferences")) {
        return jsonResponse(200, {
          notificationsEnabled: true,
          emailEngagement: true,
          preferences: {
            workoutReminder: true,
            streakAtRisk: true,
          },
        });
      }

      if (url.includes("/api/me/account")) {
        return jsonResponse(200, { ok: true });
      }

      return jsonResponse(200, {});
    });

    globalThis.fetch = mockFetch as any;

    // Render Native Settings
    const { getByTestId, findByText, findByTestId } = render(
      <AuthProvider fetchImpl={mockFetch as any}>
        <SettingsScreen />
      </AuthProvider>,
    );
    // NP-337: Settings now defaults to the Profile tab (matching the web);
    // the AI features section lives on the Settings tab.
    fireEvent.press(getByTestId("settings-tab-settings"));

    // Initial state in native Settings:
    // AI switch is ON because serverAiConsent.granted === true
    await waitFor(() => {
      expect(getByTestId("ai-consent-toggle").props.accessibilityState?.checked).toBe(true);
    });
    expect(await findByText("Share my inputs with Google Gemini")).toBeTruthy();
    expect(await findByTestId("ai-consent-record")).toBeTruthy();

    // 1. TURNING THE SWITCH OFF NATIVELY
    await act(async () => {
      fireEvent.press(getByTestId("ai-consent-toggle"));
    });

    // Verify native called DELETE /api/me/ai-consent with Authorization header
    await waitFor(() => {
      const deleteCall = fetchCalls.find(
        (c) => c.url.includes("/api/me/ai-consent") && c.init?.method === "DELETE",
      );
      expect(deleteCall).toBeDefined();
      expect(deleteCall?.init?.headers).toBeDefined();
    });

    // Verify native UI updated switch to off
    await waitFor(() => {
      expect(getByTestId("ai-consent-toggle").props.accessibilityState?.checked).toBe(false);
    });

    // 2. NEXT AI REQUEST REFUSES
    // Making an AI request now encounters requireAiConsent failure on server
    const aiResponse = await mockFetch("https://become.redbtn.io/api/ai/nutrition/plate", {
      method: "POST",
      headers: { Authorization: `Bearer ${FAKE_TOKEN}` },
    });
    expect(aiResponse.status).toBe(403);
    const aiBody = await aiResponse.json();
    expect(aiBody.reason).toBe("ai_consent_required");
    const classified = classifyApiError(new ApiError(aiResponse.status, aiBody));
    expect(classified.kind).toBe("ai-consent");

    // 3. THE WEB SHOWS IT OFF
    // The webapp fetches GET /api/me/consent on app load & settings (webapp/app/dashboard/settings/page.tsx:413)
    const webConsentRes = await mockFetch("https://become.redbtn.io/api/me/consent", {
      headers: { Authorization: `Bearer ${FAKE_TOKEN}` },
    });
    const webConsent = await webConsentRes.json();
    // The web reads `consent.ai?.granted === true` to set `aiShareAllowed`:
    const webAiShareAllowed = webConsent.ai?.granted === true;
    expect(webAiShareAllowed).toBe(false);
    expect(webConsent.ai?.revokedAt).toBe("2026-10-01T16:30:00.000Z");
  });
});
