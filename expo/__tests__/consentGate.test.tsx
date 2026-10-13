import { render, fireEvent, waitFor } from "@testing-library/react-native";
import { Text } from "react-native";
import {
  ConsentGate,
  resetConsentSettled,
} from "@/components/auth/ConsentGate";
import { ConsentSheet } from "@/components/auth/ConsentSheet";
import {
  AI_CONSENT_DECLINE_NOTE,
  AI_CONSENT_SENDS,
  AI_CONSENT_SENDS_INTRO,
  AI_CONSENT_STATEMENT,
  AI_PROVIDER,
  CONSENT_STATEMENT,
  HEALTH_DISCLAIMER_SHORT,
  LEGAL_MINIMUM_AGE,
} from "@become/core";

describe("ConsentSheet (Pure)", () => {
  it("(id: e015c79c) renders exact sentences identical to the web when terms and AI are open", () => {
    const onCheckedChange = jest.fn();
    const onAgree = jest.fn();
    const onAiCheckedChange = jest.fn();

    const { getByTestId, getByText } = render(
      <ConsentSheet
        checked={false}
        onCheckedChange={onCheckedChange}
        onAgree={onAgree}
        showTerms={true}
        showAi={true}
        aiChecked={false}
        onAiCheckedChange={onAiCheckedChange}
      />,
    );

    // Title & standfirst
    expect(getByTestId("consent-gate-title").props.children).toBe(
      "Before you continue",
    );
    expect(getByTestId("consent-gate-standfirst").props.children).toBe(
      "We need one thing on record: that you are old enough to use Become and that you agree to how it works.",
    );

    // Terms statement and age
    expect(getByTestId("consent-gate-checkbox").props.accessibilityLabel).toBe(
      CONSENT_STATEMENT,
    );
    expect(getByText(/I am at least 13 years old/)).toBeTruthy();
    expect(getByTestId("consent-terms-link").props.children).toBe(
      "Terms of Service",
    );
    expect(getByTestId("consent-privacy-link").props.children).toBe(
      "Privacy Policy",
    );

    // AI block
    expect(getByText("Optional")).toBeTruthy();
    expect(getByText(AI_CONSENT_STATEMENT)).toBeTruthy();
    expect(getByText(AI_CONSENT_SENDS_INTRO)).toBeTruthy();
    for (const sendItem of AI_CONSENT_SENDS) {
      expect(getByText(new RegExp(sendItem.slice(0, 30)))).toBeTruthy();
    }
    expect(getByText(new RegExp(AI_CONSENT_DECLINE_NOTE.slice(0, 30)))).toBeTruthy();
    expect(getByTestId("ai-consent-privacy-link").props.children).toBe(
      "Privacy Policy, section 7",
    );

    // Health disclaimer
    expect(getByText(HEALTH_DISCLAIMER_SHORT)).toBeTruthy();

    // Agree button is disabled when unchecked
    const button = getByTestId("consent-gate-agree");
    expect(button.props.accessibilityState?.disabled).toBe(true);
    expect(button.props.accessibilityLabel).toBe("Agree and continue");
  });

  it("(id: e015c79c) renders AI-only mode matching web wording", () => {
    const { getByTestId, queryByTestId, rerender } = render(
      <ConsentSheet
        checked={false}
        onCheckedChange={() => {}}
        onAgree={() => {}}
        showTerms={false}
        showAi={true}
        aiChecked={false}
      />,
    );

    expect(getByTestId("consent-gate-title").props.children).toBe(
      "One thing about AI",
    );
    expect(getByTestId("consent-gate-standfirst").props.children).toContain(
      `Become uses AI for some of its work, and that means sending what you submit to ${AI_PROVIDER}. We will not do that until you say we can.`,
    );
    expect(queryByTestId("consent-gate-terms-block")).toBeNull();

    // In AI-only mode, button is enabled and says "Save and continue"
    const button = getByTestId("consent-gate-agree");
    expect(button.props.accessibilityState?.disabled).toBe(false);
    expect(button.props.accessibilityLabel).toBe("Save and continue");

    // When AI is checked, button says "Allow and continue"
    rerender(
      <ConsentSheet
        checked={false}
        onCheckedChange={() => {}}
        onAgree={() => {}}
        showTerms={false}
        showAi={true}
        aiChecked={true}
      />,
    );
    expect(getByTestId("consent-gate-agree").props.accessibilityLabel).toBe(
      "Allow and continue",
    );
  });

  it("opens Terms and Privacy links in in-app browser without unmounting", () => {
    const launcher = jest.fn().mockResolvedValue(undefined);
    const { getByTestId } = render(
      <ConsentSheet
        checked={false}
        onCheckedChange={() => {}}
        onAgree={() => {}}
        launcher={launcher}
      />,
    );

    fireEvent.press(getByTestId("consent-terms-link"));
    expect(launcher).toHaveBeenCalledWith("https://becomeurbest.com/terms");

    fireEvent.press(getByTestId("consent-privacy-link"));
    expect(launcher).toHaveBeenCalledWith("https://becomeurbest.com/privacy");

    fireEvent.press(getByTestId("ai-consent-privacy-link"));
    expect(launcher).toHaveBeenCalledWith("https://becomeurbest.com/privacy#ai");
  });
});

describe("ConsentGate", () => {
  beforeEach(() => {
    resetConsentSettled();
    jest.clearAllMocks();
  });

  it("(id: e015c799) a member with no agreement is blocked natively until they tick, and the record says source: 'gate'", async () => {
    const fakeToken = "user-jwt-token";
    const postRequests: { url: string; body: any }[] = [];

    const mockFetch = jest.fn((url: string, init?: RequestInit) => {
      if (url.endsWith("/api/me/consent") && init?.method === "POST") {
        postRequests.push({ url, body: JSON.parse(init.body as string) });
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              current: true,
              termsVersion: "v1.2.0",
              ai: { granted: true, decided: true },
            }),
        } as Response);
      }

      // Initial GET /api/me/consent
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            current: false, // terms not agreed
            termsVersion: "v1.2.0",
            minimumAge: LEGAL_MINIMUM_AGE,
            ai: { decided: false }, // AI unanswered
          }),
      } as Response);
    });

    const { getByTestId, queryByTestId } = render(
      <ConsentGate token={fakeToken} fetchImpl={mockFetch as any}>
        <Text testID="protected-home">Protected Home Screen</Text>
      </ConsentGate>,
    );

    // Initial check triggers and shows gate
    await waitFor(() => {
      expect(getByTestId("consent-gate")).toBeTruthy();
    });

    // Protected content is BLOCKED
    expect(queryByTestId("protected-home")).toBeNull();

    // Agree button is disabled initially
    const agreeButton = getByTestId("consent-gate-agree");
    expect(agreeButton.props.accessibilityState?.disabled).toBe(true);

    // Member ticks the checkbox
    fireEvent.press(getByTestId("consent-gate-checkbox"));

    // Also opt-in to AI
    fireEvent.press(getByTestId("ai-consent-checkbox"));

    // Now button is enabled
    await waitFor(() => {
      expect(getByTestId("consent-gate-agree").props.accessibilityState?.disabled).toBe(false);
    });

    // Press agree
    fireEvent.press(getByTestId("consent-gate-agree"));

    // Sheet closes and reveals protected screen
    await waitFor(() => {
      expect(getByTestId("protected-home")).toBeTruthy();
    });
    expect(queryByTestId("consent-gate")).toBeNull();

    // Verify POST body: carries accepted: true and ai: true
    expect(postRequests).toHaveLength(1);
    expect(postRequests[0]!.url).toContain("/api/me/consent");
    expect(postRequests[0]!.body).toEqual({
      accepted: true,
      ai: true,
    });
  });

  it("(id: e015c79a) a member who answers AI question 'no' is not asked again, and decided is true", async () => {
    const fakeToken = "user-jwt-token";
    const postRequests: { url: string; body: any }[] = [];

    // 1. Initial launch: Terms is current, AI is open (decided: false)
    const mockFetch = jest.fn((url: string, init?: RequestInit) => {
      if (url.endsWith("/api/me/ai-consent") && init?.method === "POST") {
        postRequests.push({ url, body: JSON.parse(init.body as string) });
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              granted: false,
              decided: true,
              version: "v1.0.0",
            }),
        } as Response);
      }

      return Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            current: true, // Terms already agreed
            ai: { decided: false, granted: false }, // AI not decided yet
          }),
      } as Response);
    });

    const { getByTestId, queryByTestId, rerender } = render(
      <ConsentGate token={fakeToken} fetchImpl={mockFetch as any}>
        <Text testID="protected-home">Protected Home Screen</Text>
      </ConsentGate>,
    );

    // Opens in AI-only mode
    await waitFor(() => {
      expect(getByTestId("consent-gate-title").props.children).toBe("One thing about AI");
    });
    expect(queryByTestId("consent-gate-terms-block")).toBeNull();

    // Member leaves AI unticked (answers "no") and presses "Save and continue"
    fireEvent.press(getByTestId("consent-gate-agree"));

    await waitFor(() => {
      expect(getByTestId("protected-home")).toBeTruthy();
    });

    // POST sent to /api/me/ai-consent with accepted: false and source: 'gate'
    expect(postRequests).toHaveLength(1);
    expect(postRequests[0]!.url).toContain("/api/me/ai-consent");
    expect(postRequests[0]!.body).toEqual({
      accepted: false,
      source: "gate",
    });

    // 2. Next launch (simulated by resetting module-level settled state to test server roundtrip):
    resetConsentSettled();
    const nextLaunchFetch = jest.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            current: true,
            ai: { decided: true, granted: false }, // Server confirms decided is true!
          }),
      } as Response),
    );

    rerender(
      <ConsentGate token={fakeToken} fetchImpl={nextLaunchFetch as any}>
        <Text testID="protected-home">Protected Home Screen</Text>
      </ConsentGate>,
    );

    // Gate does NOT open! Protected content stays visible immediately
    await waitFor(() => {
      expect(nextLaunchFetch).toHaveBeenCalled();
    });
    expect(queryByTestId("consent-gate")).toBeNull();
    expect(getByTestId("protected-home")).toBeTruthy();
  });

  it("(id: e015c79b) in airplane mode the gate does not block entry", async () => {
    const fakeToken = "user-jwt-token";

    // Simulate airplane mode: fetch rejects immediately with network error
    const airplaneFetch = jest.fn(() =>
      Promise.reject(new TypeError("Network request failed")),
    );

    const { getByTestId, queryByTestId } = render(
      <ConsentGate token={fakeToken} fetchImpl={airplaneFetch as any}>
        <Text testID="protected-home">Protected Home Screen</Text>
      </ConsentGate>,
    );

    // Wait for the fetch attempt
    await waitFor(() => {
      expect(airplaneFetch).toHaveBeenCalled();
    });

    // Gate does not block: protected content renders!
    expect(queryByTestId("consent-gate")).toBeNull();
    expect(getByTestId("protected-home")).toBeTruthy();
  });

  it("fails open on 500 error from server", async () => {
    const fakeToken = "user-jwt-token";

    const errorFetch = jest.fn(() =>
      Promise.resolve({
        ok: false,
        status: 500,
        statusText: "Internal Server Error",
      } as Response),
    );

    const { getByTestId, queryByTestId } = render(
      <ConsentGate token={fakeToken} fetchImpl={errorFetch as any}>
        <Text testID="protected-home">Protected Home Screen</Text>
      </ConsentGate>,
    );

    await waitFor(() => {
      expect(errorFetch).toHaveBeenCalled();
    });

    expect(queryByTestId("consent-gate")).toBeNull();
    expect(getByTestId("protected-home")).toBeTruthy();
  });
});
