/* eslint-disable import/first */
/**
 * SIGN IN WITH GOOGLE, in the app (NP-126).
 *
 * Google refuses sign-in inside an embedded web view, so the flow runs in the
 * SYSTEM authentication session and cannot end by handing the app a token: the
 * only way back into an app is a scheme any app could claim. It ends with a
 * one-time code instead, exchanged for the session with a verifier that never
 * leaves the device.
 *
 * What this pins, in the order the flow happens:
 *
 *   • the CHALLENGE goes out and the VERIFIER does not — the URL the sheet opens
 *     carries `app=1` and a SHA-256, and nothing else;
 *   • the system authentication session is what is opened, with the return url
 *     the web redirect uses, so the sheet actually closes;
 *   • the code comes out of the return url and is exchanged WITH THE VERIFIER,
 *     at the shared client, the shared schema and the webapp base url;
 *   • a dismissal is not an error, and every refusal from the exchange (a
 *     replayed code, an expired one, a verifier that does not match — all one
 *     400) is one sentence the member can act on;
 *   • no CSPRNG, no sign-in: a guessable verifier is not a verifier.
 *
 * Plus the button and the screen: pressing it signs an existing member in and
 * stores the session exactly as a magic link does.
 */
import { fireEvent, render, waitFor } from "@testing-library/react-native";

const mockReplace = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ replace: mockReplace, push: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({}),
}));

const mockSetToken = jest.fn(async () => {});
const baseAuth = () => ({
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
});
let mockAuth: Record<string, unknown> = {};
jest.mock("@/lib/auth/useAuth", () => ({ useAuth: () => mockAuth }));

jest.mock("@become/api-client", () => {
  const actual = jest.requireActual("@become/api-client");
  return { __esModule: true, ...actual, apiFetch: jest.fn() };
});

import crypto from "crypto";
import type * as WebBrowser from "expo-web-browser";
import {
  apiFetch,
  AppAuthExchangeResponseSchema,
  type AppAuthExchangeResponse,
} from "@become/api-client";
import { WEBAPP_BASE_URL } from "@/lib/config";
import LoginScreen from "../app/(auth)/login";
import GoogleSignInButton, {
  GOOGLE_BUTTON_CORNER_RADIUS,
  GOOGLE_BUTTON_HEIGHT,
} from "@/components/GoogleSignInButton";
import {
  APP_AUTH_EXCHANGE_PATH,
  APP_AUTH_RETURN_URL,
  APP_AUTH_VERIFIER_BYTES,
  GOOGLE_AUTH_START_PATH,
  appAuthChallengeFor,
  createAppAuthVerifier,
  googleAuthStartUrl,
  paramsFromReturnUrl,
  signInWithGoogle,
} from "@/lib/auth/googleSignIn";
import { sha256Base64Url } from "@/lib/auth/sha256";
import {
  createPendingSessionStore,
  type PendingSessionStore,
} from "@/lib/auth/pendingAuthSession";
import { createMemoryTokenStore } from "@/lib/auth/secureStoreToken";
/* eslint-enable import/first */

const mockApiFetch = apiFetch as unknown as jest.Mock;

/** A CSPRNG stand-in. The real one is expo-crypto's `getRandomBytes`. */
const randomBytes = (count: number): Uint8Array =>
  new Uint8Array(crypto.randomBytes(count));

function memoryPendingStore(): PendingSessionStore {
  return createPendingSessionStore(createMemoryTokenStore(null));
}

function session(
  overrides: Partial<AppAuthExchangeResponse> = {},
): AppAuthExchangeResponse {
  return {
    token: "become-jwt-from-google",
    user: { id: "user-1", name: "Alex Runner", email: "alex@example.test" },
    ...overrides,
  } as AppAuthExchangeResponse;
}

/** Whatever the sheet came back with, as `openAuthSessionAsync` returns it. */
const returned = (url: string) => ({ type: "success" as const, url });

/** A sheet the member closed. */
const dismissed = (type: "cancel" | "dismiss") =>
  ({ type }) as unknown as WebBrowser.WebBrowserAuthSessionResult;

beforeEach(() => {
  mockReplace.mockReset();
  mockSetToken.mockReset();
  mockSetToken.mockResolvedValue(undefined);
  mockApiFetch.mockReset();
  mockAuth = baseAuth();
});

// ─── The pieces ──────────────────────────────────────────────────────────────

describe("the verifier and the challenge", () => {
  it("is 32 bytes of base64url from the platform CSPRNG", () => {
    const verifier = createAppAuthVerifier(randomBytes);
    expect(verifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(APP_AUTH_VERIFIER_BYTES).toBe(32);
  });

  it("is fresh every time — a reused verifier is a reusable code", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 20; i += 1) seen.add(createAppAuthVerifier(randomBytes));
    expect(seen.size).toBe(20);
  });

  it("refuses to invent one without real randomness", () => {
    expect(() => createAppAuthVerifier(() => new Uint8Array(0))).toThrow();
    expect(() =>
      createAppAuthVerifier(() => new Uint8Array(8)),
    ).toThrow();
  });

  it("is hashed to the challenge the server checks", () => {
    const verifier = createAppAuthVerifier(randomBytes);
    expect(appAuthChallengeFor(verifier)).toBe(sha256Base64Url(verifier));
    expect(appAuthChallengeFor(verifier)).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });
});

describe("the url the sheet opens", () => {
  it("carries app=1 and the challenge, and never the verifier", () => {
    const verifier = createAppAuthVerifier(randomBytes);
    const challenge = appAuthChallengeFor(verifier);
    const url = googleAuthStartUrl(challenge);
    expect(url.startsWith(`${WEBAPP_BASE_URL}${GOOGLE_AUTH_START_PATH}?`)).toBe(true);
    const query = new URLSearchParams(url.slice(url.indexOf("?") + 1));
    expect(query.get("app")).toBe("1");
    expect(query.get("challenge")).toBe(challenge);
    expect(url).not.toContain(verifier);
  });

  it("takes a base url, so a dev backend is one argument away", () => {
    expect(googleAuthStartUrl("c", "https://become-beta.redbtn.io/")).toBe(
      `https://become-beta.redbtn.io${GOOGLE_AUTH_START_PATH}?app=1&challenge=c`,
    );
  });
});

describe("reading the return url", () => {
  it("finds the code the web redirect put there", () => {
    expect(paramsFromReturnUrl(`${APP_AUTH_RETURN_URL}?code=abc123`)).toEqual({
      code: "abc123",
    });
    // Escaped, because base64url needs no escaping but the server escapes anyway.
    expect(paramsFromReturnUrl(`${APP_AUTH_RETURN_URL}?code=a%20b`)).toEqual({
      code: "a b",
    });
    expect(
      paramsFromReturnUrl(`${APP_AUTH_RETURN_URL}?error=google_email`),
    ).toEqual({ error: "google_email" });
  });

  it("takes the first value and ignores the rest", () => {
    expect(
      paramsFromReturnUrl(`${APP_AUTH_RETURN_URL}?state=x&code=first&code=second`),
    ).toEqual({ code: "first" });
  });

  it("finds nothing in a url with nothing in it", () => {
    expect(paramsFromReturnUrl(APP_AUTH_RETURN_URL)).toEqual({});
    expect(paramsFromReturnUrl("")).toEqual({});
    expect(paramsFromReturnUrl(`${APP_AUTH_RETURN_URL}?code=`)).toEqual({});
  });
});

// ─── The flow ────────────────────────────────────────────────────────────────

describe("signInWithGoogle", () => {
  it("opens the SYSTEM auth session and exchanges the code with the verifier", async () => {
    const openAuthSession = jest.fn(async () => returned(`${APP_AUTH_RETURN_URL}?code=one-time`));
    const exchange = jest.fn(async () => session());

    const result = await signInWithGoogle({ openAuthSession, exchange, randomBytes });

    expect(result.status).toBe("signed-in");
    expect(result.session?.token).toBe("become-jwt-from-google");

    const [url, returnUrl] = openAuthSession.mock.calls[0] as unknown as [string, string];
    // The return url is what CLOSES ASWebAuthenticationSession / the Custom Tab.
    expect(returnUrl).toBe(APP_AUTH_RETURN_URL);

    const challenge = new URLSearchParams(url.slice(url.indexOf("?") + 1)).get(
      "challenge",
    );
    const [code, verifier] = exchange.mock.calls[0] as unknown as [string, string];
    expect(code).toBe("one-time");
    // THE BINDING: what was sent to the server at the start is the hash of what
    // is being presented now.
    expect(appAuthChallengeFor(verifier)).toBe(challenge);
    expect(url).not.toContain(verifier);
  });

  it("uses the shared client, the shared schema and the webapp base url", async () => {
    mockApiFetch.mockResolvedValue(session());
    const openAuthSession = jest.fn(async () => returned(`${APP_AUTH_RETURN_URL}?code=c1`));

    await signInWithGoogle({ openAuthSession, randomBytes });

    expect(mockApiFetch).toHaveBeenCalledTimes(1);
    const [path, schema, init] = mockApiFetch.mock.calls[0];
    expect(path).toBe(APP_AUTH_EXCHANGE_PATH);
    expect(schema).toBe(AppAuthExchangeResponseSchema);
    expect(init.method).toBe("POST");
    expect(init.baseUrl).toBe(WEBAPP_BASE_URL);
    expect(init.body.code).toBe("c1");
    expect(init.body.verifier).toMatch(/^[A-Za-z0-9_-]{43}$/);
    // No bearer: there is no session yet, and this call is what makes one.
    expect(init.getToken).toBeUndefined();
  });

  it("says nothing when the member closes the sheet", async () => {
    for (const type of ["cancel", "dismiss"] as const) {
      const result = await signInWithGoogle({
        // `type` is a string enum in expo-web-browser's types; the VALUES are
        // these two strings, which is what arrives at runtime.
        openAuthSession: async () => dismissed(type),
        randomBytes,
      });
      expect(result).toEqual({ status: "cancelled" });
    }
  });

  it("reports a session that ended without a code", async () => {
    const result = await signInWithGoogle({
      openAuthSession: async () => returned(APP_AUTH_RETURN_URL),
      randomBytes,
    });
    expect(result.status).toBe("error");
    expect(result.message).toMatch(/didn't finish/);
  });

  it("says what happened when Google shared no address", async () => {
    const result = await signInWithGoogle({
      openAuthSession: async () => returned(`${APP_AUTH_RETURN_URL}?error=google_email`),
      randomBytes,
    });
    expect(result.status).toBe("error");
    expect(result.message).toMatch(/email address/);
  });

  it("turns every refusal from the exchange into one sentence", async () => {
    // A replayed code, an expired one and a wrong verifier are all 400
    // `invalid_code` — deliberately indistinguishable — so there is one message.
    const result = await signInWithGoogle({
      openAuthSession: async () => returned(`${APP_AUTH_RETURN_URL}?code=spent`),
      exchange: async () => {
        throw new Error("400");
      },
      randomBytes,
    });
    expect(result.status).toBe("error");
    expect(result.message).toMatch(/couldn't finish signing you in/i);
  });

  it("does not open anything when the device has no secure randomness", async () => {
    const openAuthSession = jest.fn();
    const result = await signInWithGoogle({
      openAuthSession,
      randomBytes: () => {
        throw new Error("no native module");
      },
    });
    expect(result.status).toBe("error");
    expect(openAuthSession).not.toHaveBeenCalled();
  });

  it("survives a browser that throws instead of opening", async () => {
    const result = await signInWithGoogle({
      openAuthSession: async () => {
        throw new Error("no browser");
      },
      randomBytes,
    });
    expect(result.status).toBe("error");
    expect(result.message).toMatch(/Couldn't open Google sign-in/);
  });
});

// ─── The button ──────────────────────────────────────────────────────────────

describe("GoogleSignInButton", () => {
  it("says what it does, at the same size as the Apple button", () => {
    const { getByTestId } = render(<GoogleSignInButton onPress={jest.fn()} />);
    const button = getByTestId("google-sign-in-button");
    expect(button.props.accessibilityRole).toBe("button");
    expect(button.props.accessibilityLabel).toBe("Continue with Google");
    expect(GOOGLE_BUTTON_HEIGHT).toBeGreaterThanOrEqual(44);
    expect(GOOGLE_BUTTON_CORNER_RADIUS).toBe(12);
    const style = button.props.style;
    // A MINIMUM, never a fixed height: the label has to be able to grow at the
    // largest Dynamic Type size (accessibility.test.tsx checks exactly this).
    expect(style.minHeight).toBe(GOOGLE_BUTTON_HEIGHT);
    expect(style.height).toBeUndefined();
    // The 44-point rule, as NUMBERS: a className is never resolved in jest.
    expect(style.minHeight).toBeGreaterThanOrEqual(44);
    expect(style.minWidth).toBe(44);
  });

  it("draws Google's own mark", () => {
    const { getByTestId } = render(<GoogleSignInButton onPress={jest.fn()} />);
    expect(getByTestId("google-mark")).toBeTruthy();
  });

  it("says 'Sign up with Google' when the member is creating an account", () => {
    const { getByTestId } = render(
      <GoogleSignInButton onPress={jest.fn()} intent="sign-up" />,
    );
    expect(
      getByTestId("google-sign-in-button").props.accessibilityLabel,
    ).toBe("Sign up with Google");
  });

  it("does nothing while a sign-in is already running", () => {
    const onPress = jest.fn();
    const { getByTestId } = render(
      <GoogleSignInButton onPress={onPress} disabled />,
    );
    fireEvent.press(getByTestId("google-sign-in-button"));
    expect(onPress).not.toHaveBeenCalled();
  });
});

// ─── The screen ──────────────────────────────────────────────────────────────

describe("the Google button on the sign-in screen", () => {
  it("signs an existing member in and stores the session", async () => {
    const googleSignInFn = jest.fn(async () => ({
      status: "signed-in" as const,
      session: session(),
    }));
    const { getByTestId } = render(
      <LoginScreen
        googleSignInFn={googleSignInFn}
        pendingSessionStore={memoryPendingStore()}
        pollIntervalMs={100000}
      />,
    );

    fireEvent.press(getByTestId("google-sign-in-button"));

    await waitFor(() => expect(mockSetToken).toHaveBeenCalledWith("become-jwt-from-google"));
    expect(mockReplace).toHaveBeenCalledWith("/");
  });

  it("says nothing when the member closes the sheet", async () => {
    const googleSignInFn = jest.fn(async () => ({ status: "cancelled" as const }));
    const { getByTestId, queryByTestId } = render(
      <LoginScreen
        googleSignInFn={googleSignInFn}
        pendingSessionStore={memoryPendingStore()}
        pollIntervalMs={100000}
      />,
    );

    fireEvent.press(getByTestId("google-sign-in-button"));

    await waitFor(() => expect(googleSignInFn).toHaveBeenCalled());
    expect(mockSetToken).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
    expect(queryByTestId("login-email-error")).toBeNull();
  });

  it("puts a failure on the form", async () => {
    const googleSignInFn = jest.fn(async () => ({
      status: "error" as const,
      message: "Google sign-in didn't finish. Please try again.",
    }));
    const { getByTestId, findByText } = render(
      <LoginScreen
        googleSignInFn={googleSignInFn}
        pendingSessionStore={memoryPendingStore()}
        pollIntervalMs={100000}
      />,
    );

    fireEvent.press(getByTestId("google-sign-in-button"));

    expect(
      await findByText("Google sign-in didn't finish. Please try again."),
    ).toBeTruthy();
    expect(mockSetToken).not.toHaveBeenCalled();
  });
});
