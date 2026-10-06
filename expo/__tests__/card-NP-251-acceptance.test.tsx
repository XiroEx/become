/* eslint-disable import/first */
// NP-251 — SIGN IN AND REGISTER: WEB HEADER, TITLES AND WELCOME COPY, LEGAL
// LINE AND FOOTER LINKS, "CHECK YOUR EMAIL" CARD.
//
// Full visual pass (native vs web) on `expo/app/(auth)/login.tsx`, matching
// webapp/components/AuthScreen.tsx + AuthForm.tsx: the round back button and
// brand header, the card's heading/welcome copy per mode, the unconditional
// legal line (underlined Terms/Privacy links) and footer links, the primary
// button's black "Continue with email" label on both modes, the review-code
// disclosure sitting above the mode toggle, and the green "Check your email"
// sent-state card with its pulsing waiting dot and underlined
// "Use a different email" link. The native Apple button is left untouched
// (NP-161 tracks its own absence from the web separately).

const mockReplace = jest.fn();
const mockCanGoBack = jest.fn(() => false);
const mockBack = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({
    replace: mockReplace,
    push: jest.fn(),
    back: mockBack,
    canGoBack: mockCanGoBack,
  }),
  useLocalSearchParams: () => ({}),
}));

const mockSetToken = jest.fn(async () => {});
jest.mock("@/lib/auth/useAuth", () => ({
  useAuth: () => ({
    user: null,
    token: null,
    status: "signed-out",
    loading: false,
    isAuthed: false,
    signedOutReason: null,
    setToken: mockSetToken,
    refresh: jest.fn(),
    signOut: jest.fn(),
    logout: jest.fn(),
  }),
}));

jest.mock("@become/api-client", () => {
  const actual = jest.requireActual("@become/api-client");
  return { __esModule: true, ...actual, apiFetch: jest.fn() };
});

import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import { apiFetch } from "@become/api-client";
import { createMemoryTokenStore } from "@/lib/auth/secureStoreToken";
import { createPendingSessionStore } from "@/lib/auth/pendingAuthSession";
import LoginScreen from "../app/(auth)/login";
/* eslint-enable import/first */

const mockApiFetch = apiFetch as unknown as jest.Mock;

beforeEach(() => {
  mockReplace.mockReset();
  mockCanGoBack.mockReset();
  mockCanGoBack.mockReturnValue(false);
  mockBack.mockReset();
  mockSetToken.mockReset();
  mockApiFetch.mockReset();
});

describe("(NP-251) the web header: round back button, brand and tagline", () => {
  it("draws a round back button beside BECOME and its tagline", () => {
    const { getByTestId, getByText } = render(<LoginScreen />);
    const back = getByTestId("login-back-button");
    expect(back.props.accessibilityRole).toBe("button");
    expect(back.props.accessibilityLabel).toBe("Back");
    expect(getByText("BECOME")).toBeTruthy();
    expect(getByText("Transform your body and mind.")).toBeTruthy();
  });

  it("does nothing when there is no history, and goes back when there is", () => {
    const { getByTestId, rerender } = render(<LoginScreen />);
    fireEvent.press(getByTestId("login-back-button"));
    expect(mockBack).not.toHaveBeenCalled();

    mockCanGoBack.mockReturnValue(true);
    rerender(<LoginScreen />);
    fireEvent.press(getByTestId("login-back-button"));
    expect(mockBack).toHaveBeenCalledTimes(1);
  });
});

describe("(NP-251) the card's title and welcome copy, per mode", () => {
  it("sign-in: 'Sign in' and the welcome-back line", () => {
    const { getByTestId, getByText } = render(<LoginScreen />);
    expect(getByTestId("login-heading")).toHaveTextContent("Sign in");
    expect(
      getByText("Welcome back. Sign in to pick up where you left off."),
    ).toBeTruthy();
  });

  it("register: 'Create account' and the start-your-transformation line", () => {
    const { getByTestId, getByText } = render(
      <LoginScreen initialMode="register" />,
    );
    expect(getByTestId("login-heading")).toHaveTextContent("Create account");
    expect(
      getByText(
        "Start your transformation. Create a free account to get going.",
      ),
    ).toBeTruthy();
  });
});

describe("(NP-251) the legal line and footer links, on both modes", () => {
  it("sign-in shows the underlined consent line and all five footer links", () => {
    const { getByTestId, getByText } = render(<LoginScreen />);
    expect(
      getByText(/By continuing you agree to the/),
    ).toBeTruthy();
    const terms = getByTestId("login-terms-link");
    const privacy = getByTestId("login-privacy-link");
    expect(terms.props.accessibilityRole).toBe("link");
    expect(privacy.props.accessibilityRole).toBe("link");

    for (const label of ["Terms", "Privacy", "Health data", "Support", "Delete account"]) {
      expect(getByText(label)).toBeTruthy();
    }
  });

  it("register shows the same legal line and footer links", () => {
    const { getByTestId, getByText } = render(
      <LoginScreen initialMode="register" />,
    );
    expect(getByText(/By continuing you agree to the/)).toBeTruthy();
    expect(getByTestId("login-terms-link")).toBeTruthy();
    for (const label of ["Terms", "Privacy", "Health data", "Support", "Delete account"]) {
      expect(getByText(label)).toBeTruthy();
    }
  });

  it("the register consent checkbox's Terms/Privacy words are their own underlined links", () => {
    const { getByTestId } = render(<LoginScreen initialMode="register" />);
    expect(getByTestId("consent-terms-link").props.accessibilityRole).toBe(
      "link",
    );
    expect(getByTestId("consent-privacy-link").props.accessibilityRole).toBe(
      "link",
    );
  });

  it("opens the Terms page through the launcher, not the Privacy one", async () => {
    const launcher = jest.fn(async (_url: string) => undefined);
    const { getByTestId } = render(<LoginScreen launcher={launcher} />);
    fireEvent.press(getByTestId("login-terms-link"));
    await waitFor(() => expect(launcher).toHaveBeenCalledTimes(1));
    expect(launcher.mock.calls[0]?.[0]).toMatch(/\/terms$/);
  });
});

describe("(NP-251) the primary button and the social buttons", () => {
  it("'Continue with email' on sign-in, inverted (black) variant", () => {
    const { getByTestId } = render(<LoginScreen />);
    const button = getByTestId("login-submit");
    expect(button.props.accessibilityLabel).toBe("Continue with email");
  });

  it("'Continue with email' on register too — the copy no longer names the mode", () => {
    const { getByTestId } = render(<LoginScreen initialMode="register" />);
    const button = getByTestId("login-submit");
    expect(button.props.accessibilityLabel).toBe("Continue with email");
  });

  it("the Google button reads 'Continue with Google' on both modes", () => {
    const signIn = render(<LoginScreen />);
    expect(
      signIn.getByTestId("google-sign-in-button").props.accessibilityLabel,
    ).toBe("Continue with Google");
    signIn.unmount();

    const register = render(<LoginScreen initialMode="register" />);
    expect(
      register.getByTestId("google-sign-in-button").props.accessibilityLabel,
    ).toBe("Continue with Google");
  });

  it("the review-code disclosure sits above the mode toggle", () => {
    const { getByTestId, toJSON } = render(<LoginScreen />);
    // Both are rendered; what NP-251 pins is the ORDER (swapped from the old
    // layout, where the toggle came first) — read off the serialised tree,
    // which lists nodes in render order and has no circular refs.
    const serialised = JSON.stringify(toJSON());
    const disclosureAt = serialised.indexOf("login-review-code-disclosure");
    const toggleAt = serialised.indexOf("login-mode-toggle");
    expect(disclosureAt).toBeGreaterThan(-1);
    expect(toggleAt).toBeGreaterThan(-1);
    expect(disclosureAt).toBeLessThan(toggleAt);
    expect(getByTestId("login-review-code-disclosure")).toBeTruthy();
    expect(getByTestId("login-mode-toggle")).toBeTruthy();
  });
});

describe("(NP-251) the sent state: the green 'Check your email' card", () => {
  async function submit(mode?: "login" | "register") {
    mockApiFetch.mockResolvedValue({
      success: true,
      message: "sent",
      sessionId: "sess-np251",
    });
    const utils = render(
      <LoginScreen
        initialMode={mode}
        checkSessionFn={async () => ({ status: "pending" as const })}
        pollIntervalMs={100000}
        pendingSessionStore={createPendingSessionStore(createMemoryTokenStore())}
      />,
    );
    fireEvent.changeText(utils.getByTestId("login-email"), "jon@example.com");
    if (mode === "register") {
      fireEvent.press(utils.getByTestId("consent-checkbox"));
    }
    fireEvent.press(utils.getByTestId("login-submit"));
    await waitFor(() => expect(utils.getByTestId("login-submitted")).toBeTruthy());
    return utils;
  }

  it("shows the mail icon card, the email, the expiry note and the waiting dot", async () => {
    const { getByTestId, getByText } = await submit();
    expect(getByTestId("login-sent-card")).toBeTruthy();
    expect(getByText("Check your email")).toBeTruthy();
    expect(getByText("We sent a verification link to")).toBeTruthy();
    expect(getByTestId("login-sent-email")).toHaveTextContent(
      "jon@example.com",
    );
    expect(
      getByText(
        "Click the link in the email to sign in. The link expires in 15 minutes.",
      ),
    ).toBeTruthy();
    expect(getByTestId("login-waiting-dot")).toBeTruthy();
    expect(getByText("Waiting for verification...")).toBeTruthy();
  });

  it("register's expiry note says 'complete your registration'", async () => {
    const { getByText } = await submit("register");
    expect(
      getByText(
        "Click the link in the email to complete your registration. The link expires in 15 minutes.",
      ),
    ).toBeTruthy();
  });

  it("'Use a different email' is an underlined link, not an outlined button", async () => {
    const { getByTestId } = await submit();
    const link = getByTestId("login-change-email");
    expect(link.props.accessibilityRole).toBe("button");
    expect(link.props.accessibilityLabel).toBe("Use a different email");
  });

  it("the mode toggle, legal line and footer links still show under the sent card", async () => {
    const { getByTestId, getByText } = await submit();
    expect(getByTestId("login-mode-toggle")).toBeTruthy();
    expect(getByText(/By continuing you agree to the/)).toBeTruthy();
    expect(getByText("Health data")).toBeTruthy();
  });

  it("switching mode from the sent state tears the pending session down first", async () => {
    const { getByTestId, queryByTestId, getByText } = await submit();
    await act(async () => {
      fireEvent.press(getByTestId("login-mode-toggle"));
      // handleToggleMode awaits handleChangeEmail's SecureStore round trip
      // before flipping `mode` — give that microtask queue room to drain.
      await Promise.resolve();
      await Promise.resolve();
    });
    await waitFor(
      () => expect(queryByTestId("login-submitted")).toBeNull(),
      { timeout: 8000 },
    );
    expect(getByTestId("login-heading")).toHaveTextContent("Create account");
    expect(getByText("Create account")).toBeTruthy();
  });
});
