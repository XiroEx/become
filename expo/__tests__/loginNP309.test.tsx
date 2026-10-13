// NP-309 — Android sign-in visual/behaviour pass against web's AuthForm:
//
//   1. the keyboard no longer hides "Sign in with review code" (scroll-into-
//      view wiring — exercised structurally here; the actual native scroll
//      is a jsdom-unreachable measurement, see the keyboard-avoiding test);
//   2. the email field's keyboard Go/Done key submits, like web's Enter;
//   3. hardware back on "Create account" flips to sign-in instead of exiting;
//   4. the round header back button (card-NP-251-acceptance.test.tsx) is
//      hidden with no history instead of drawn-but-inert;
//   5. footer link spacing — already fixed by NP-303's LegalLinks pass,
//      which this screen already renders (legalLinks.test.tsx covers it);
//   6. smaller copy gaps: no "Email" label (placeholder only, like web),
//      "OR" reads uppercase, the review-code field has no extra label and is
//      secure-ish/no-autofill, and its disclosure is underlined.
/* eslint-disable import/first */
import { act, fireEvent, render } from "@testing-library/react-native";

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

import { apiFetch } from "@become/api-client";
import { WEBAPP_BASE_URL } from "@/lib/config";
import LoginScreen from "../app/(auth)/login";
/* eslint-enable import/first */

const mockApiFetch = apiFetch as unknown as jest.Mock;

/** Minimal fake matching lib/android/backHandler's BackHandlerLike contract. */
function makeFakeBackHandler() {
  const listeners: (() => boolean)[] = [];
  return {
    fire: (): boolean | undefined => listeners.map((l) => l()).pop(),
    backHandler: {
      addEventListener: (
        _type: "hardwareBackPress",
        handler: () => boolean,
      ) => {
        listeners.push(handler);
        return {
          remove: () => {
            const i = listeners.indexOf(handler);
            if (i >= 0) listeners.splice(i, 1);
          },
        };
      },
    },
  };
}

beforeEach(() => {
  mockReplace.mockReset();
  mockCanGoBack.mockReset();
  mockCanGoBack.mockReturnValue(false);
  mockBack.mockReset();
  mockSetToken.mockReset();
  mockApiFetch.mockReset();
});

describe("(NP-309) the email field submits on the keyboard's Go key", () => {
  it("calls send-link when submitEditing fires on the email field", async () => {
    mockApiFetch.mockResolvedValue({
      success: true,
      message: "sent",
      sessionId: "sess-go",
    });
    const { getByTestId } = render(<LoginScreen pollIntervalMs={100000} />);
    fireEvent.changeText(getByTestId("login-email"), "jon@example.com");
    fireEvent(getByTestId("login-email"), "submitEditing");

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(mockApiFetch).toHaveBeenCalledWith(
      "/api/auth/send-link",
      expect.anything(),
      {
        method: "POST",
        body: { email: "jon@example.com", mode: "login" },
        baseUrl: WEBAPP_BASE_URL,
      },
    );
  });

  it("has no visible 'Email' label above the field — placeholder only, like web", () => {
    const { queryByTestId, getByTestId } = render(<LoginScreen />);
    expect(queryByTestId("login-email-label")).toBeNull();
    expect(getByTestId("login-email").props.accessibilityLabel).toBe("Email");
  });
});

describe("(NP-309) hardware back on 'Create account' flips to sign-in", () => {
  it("intercepts back and flips mode instead of exiting, when registering", () => {
    const fake = makeFakeBackHandler();
    const { getByTestId } = render(
      <LoginScreen initialMode="register" backHandler={fake.backHandler} />,
    );
    expect(getByTestId("login-heading")).toHaveTextContent("Create account");

    let intercepted: boolean | undefined;
    act(() => {
      intercepted = fake.fire();
    });

    expect(intercepted).toBe(true);
    expect(getByTestId("login-heading")).toHaveTextContent("Sign in");
  });

  it("does not subscribe a back handler on the sign-in screen", () => {
    const fake = makeFakeBackHandler();
    render(<LoginScreen backHandler={fake.backHandler} />);
    // Nothing to intercept: default back behaviour (exit/pop) applies.
    expect(fake.fire()).toBeUndefined();
  });
});

describe("(NP-309) smaller copy gaps against web's AuthForm", () => {
  it("the divider reads uppercase, like web's 'OR'", () => {
    const { getByTestId } = render(<LoginScreen />);
    expect(getByTestId("login-or-divider").props.className).toContain(
      "uppercase",
    );
  });

  it("the review-code disclosure is underlined, like web's", () => {
    const { getByTestId } = render(<LoginScreen />);
    expect(
      getByTestId("login-review-code-disclosure-text").props.className,
    ).toContain("underline");
  });

  it("the review-code field has no extra label, and is secure-ish with autofill off", () => {
    const { getByTestId, queryByTestId } = render(<LoginScreen />);
    fireEvent.press(getByTestId("login-review-code-disclosure"));
    expect(queryByTestId("login-review-code-input-label")).toBeNull();
    const input = getByTestId("login-review-code-input");
    expect(input.props.accessibilityLabel).toBe("Review code");
    expect(input.props.secureTextEntry).toBe(true);
    expect(input.props.autoComplete).toBe("off");
    expect(input.props.importantForAutofill).toBe("no");
  });
});
