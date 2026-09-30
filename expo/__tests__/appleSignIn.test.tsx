/* eslint-disable import/first */
/**
 * SIGN IN WITH APPLE, in the app.
 *
 * Two halves, and the second is the one that matters for this card:
 *
 *   • the FLOW (lib/auth/appleSignIn.ts) — the nonce travels to Apple, the
 *     identity token and the authorization code travel to Become, a dismissal
 *     is not an error;
 *   • the SCREEN — a member whose address Apple kept private is NOT dropped
 *     into the empty account that was just created. The session is held back
 *     and "Already a member? Link your email" is offered; the link then signs
 *     them into their EXISTING account through the same polling the magic link
 *     uses, so they end with one account.
 *
 * Plus Apple's style rules on the button itself, which are a store
 * requirement and not a matter of taste (see components/AppleSignInButton).
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

import * as AppleAuthentication from "expo-apple-authentication";
import {
  apiFetch,
  AppleLinkEmailResponseSchema,
  AppleSignInResponseSchema,
  type AppleSignInResponse,
} from "@become/api-client";
import { WEBAPP_BASE_URL } from "@/lib/config";
import LoginScreen from "../app/(auth)/login";
import AppleSignInButton, {
  APPLE_BUTTON_CORNER_RADIUS,
  APPLE_BUTTON_HEIGHT,
  appleSignInSupported,
} from "@/components/AppleSignInButton";
import {
  APPLE_LINK_EMAIL_PATH,
  APPLE_SIGN_IN_PATH,
  generateAppleNonce,
  isAppleCancellation,
  sendAppleEmailLink,
  signInWithApple,
} from "@/lib/auth/appleSignIn";
import {
  createPendingSessionStore,
  type PendingSessionStore,
} from "@/lib/auth/pendingAuthSession";
import { createMemoryTokenStore } from "@/lib/auth/secureStoreToken";
/* eslint-enable import/first */

const mockApiFetch = apiFetch as unknown as jest.Mock;
const mockIsAvailable = AppleAuthentication.isAvailableAsync as unknown as jest.Mock;
const mockSignInAsync = AppleAuthentication.signInAsync as unknown as jest.Mock;

/** An in-memory pending-session store, so nothing reaches SecureStore. */
function memoryPendingStore(): PendingSessionStore {
  return createPendingSessionStore(createMemoryTokenStore(null));
}

function session(overrides: Partial<AppleSignInResponse> = {}): AppleSignInResponse {
  return {
    token: "become-jwt-from-apple",
    user: { id: "user-1", name: "Alex Runner", email: "alex@example.test" },
    isNew: false,
    matchedBy: "email",
    canLinkEmail: false,
    ...overrides,
  } as AppleSignInResponse;
}

beforeEach(() => {
  mockReplace.mockReset();
  mockSetToken.mockReset();
  mockSetToken.mockResolvedValue(undefined);
  mockApiFetch.mockReset();
  mockIsAvailable.mockReset();
  mockIsAvailable.mockResolvedValue(true);
  mockSignInAsync.mockReset();
  mockSignInAsync.mockResolvedValue({
    user: "000123.mock-apple-user.0001",
    state: null,
    fullName: { givenName: "Alex", familyName: "Runner", nickname: null },
    email: "alex@example.test",
    realUserStatus: 2,
    identityToken: "mock.identity.token",
    authorizationCode: "mock-authorization-code",
  });
  mockAuth = baseAuth();
});

// ─── The flow ────────────────────────────────────────────────────────────────

describe("signInWithApple", () => {
  it("sends the nonce to Apple and the credential to Become", async () => {
    const postSignIn = jest.fn(async () => session());
    const result = await signInWithApple({ postSignIn, makeNonce: () => "nonce-1" });

    expect(result.status).toBe("signed-in");
    expect(mockSignInAsync).toHaveBeenCalledWith({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
      nonce: "nonce-1",
    });
    // The SAME nonce goes to the server, which is the only way it can check
    // that the token answers this sign-in and not a captured earlier one.
    expect(postSignIn).toHaveBeenCalledWith({
      identityToken: "mock.identity.token",
      nonce: "nonce-1",
      authorizationCode: "mock-authorization-code",
      fullName: { givenName: "Alex", familyName: "Runner", nickname: null },
    });
  });

  it("does not treat a dismissed sheet as an error", async () => {
    const cancelled = Object.assign(new Error("The user canceled the authorization attempt."), {
      code: "ERR_REQUEST_CANCELED",
    });
    mockSignInAsync.mockRejectedValue(cancelled);
    const postSignIn = jest.fn();
    const result = await signInWithApple({ postSignIn });
    expect(result.status).toBe("cancelled");
    expect(result.message).toBeUndefined();
    expect(postSignIn).not.toHaveBeenCalled();
    expect(isAppleCancellation(cancelled)).toBe(true);
    expect(isAppleCancellation(new Error("something else"))).toBe(false);
  });

  it("reports an unavailable device without opening anything", async () => {
    mockIsAvailable.mockResolvedValue(false);
    const result = await signInWithApple({ postSignIn: jest.fn() });
    expect(result.status).toBe("unavailable");
    expect(mockSignInAsync).not.toHaveBeenCalled();
  });

  it("refuses to sign anyone in without an identity token", async () => {
    mockSignInAsync.mockResolvedValue({
      user: "000123",
      state: null,
      fullName: null,
      email: null,
      realUserStatus: 1,
      identityToken: null,
      authorizationCode: "code",
    });
    const postSignIn = jest.fn();
    const result = await signInWithApple({ postSignIn });
    expect(result.status).toBe("error");
    expect(postSignIn).not.toHaveBeenCalled();
  });

  it("uses the shared client, the shared schema and the webapp base URL", async () => {
    mockApiFetch.mockResolvedValue(session());
    await signInWithApple({ makeNonce: () => "nonce-2" });
    expect(mockApiFetch).toHaveBeenCalledWith(APPLE_SIGN_IN_PATH, AppleSignInResponseSchema, {
      method: "POST",
      body: expect.objectContaining({ nonce: "nonce-2" }),
      baseUrl: WEBAPP_BASE_URL,
    });
  });

  it("mints a fresh nonce per attempt", () => {
    expect(generateAppleNonce()).not.toBe(generateAppleNonce());
    expect(generateAppleNonce().length).toBeGreaterThan(16);
  });

  it("carries the Apple session as the bearer when asking for the email link", async () => {
    mockApiFetch.mockResolvedValue({ success: true, sessionId: "s1", message: "sent" });
    await sendAppleEmailLink("apple-session-jwt", "alex@example.test");
    const [path, schema, init] = mockApiFetch.mock.calls[0];
    expect(path).toBe(APPLE_LINK_EMAIL_PATH);
    expect(schema).toBe(AppleLinkEmailResponseSchema);
    expect(init.body).toEqual({ email: "alex@example.test" });
    expect(await init.getToken()).toBe("apple-session-jwt");
  });
});

// ─── Apple's style rules ─────────────────────────────────────────────────────

describe("AppleSignInButton", () => {
  it("draws Apple's own button, at Apple's minimum size and radius", async () => {
    const { getByTestId } = render(<AppleSignInButton onPress={jest.fn()} />);
    const button = await waitFor(() => getByTestId("apple-sign-in-button"));
    expect(button.props.buttonType).toBe(
      AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN,
    );
    expect(button.props.cornerRadius).toBe(APPLE_BUTTON_CORNER_RADIUS);
    // Height ≥ 44 is both Apple's minimum for this button and our own touch
    // target floor.
    expect(APPLE_BUTTON_HEIGHT).toBeGreaterThanOrEqual(44);
    expect(button.props.style).toEqual({ width: "100%", height: APPLE_BUTTON_HEIGHT });
    // Apple forbids restyling the surface: the colour comes from buttonStyle.
    expect(button.props.style.backgroundColor).toBeUndefined();
    expect(button.props.style.borderRadius).toBeUndefined();
    expect(
      [
        AppleAuthentication.AppleAuthenticationButtonStyle.WHITE,
        AppleAuthentication.AppleAuthenticationButtonStyle.BLACK,
      ],
    ).toContain(button.props.buttonStyle);
  });

  it("says 'Sign up with Apple' when the member is creating an account", async () => {
    const { getByTestId } = render(<AppleSignInButton onPress={jest.fn()} intent="sign-up" />);
    const button = await waitFor(() => getByTestId("apple-sign-in-button"));
    expect(button.props.buttonType).toBe(
      AppleAuthentication.AppleAuthenticationButtonType.SIGN_UP,
    );
  });

  it("renders nothing where Sign in with Apple does not exist", async () => {
    const { queryByTestId } = render(
      <AppleSignInButton onPress={jest.fn()} isAvailableAsync={async () => false} />,
    );
    await waitFor(() => expect(queryByTestId("apple-sign-in-button")).toBeNull());
  });

  it("decides the platform synchronously, so no screen re-renders after mount", async () => {
    // iOS under jest-expo. The point of the assertion is the SHAPE of the
    // decision: a platform answer available on the first render, not a promise
    // every sign-in screen has to wait for.
    expect(appleSignInSupported()).toBe(true);
    const { getByTestId } = render(
      <AppleSignInButton onPress={jest.fn()} isAvailableAsync={async () => true} />,
    );
    // Present IMMEDIATELY — no waitFor.
    expect(getByTestId("apple-sign-in-button")).toBeTruthy();
  });
});

// ─── The screen ──────────────────────────────────────────────────────────────

describe("the Apple button on the sign-in screen", () => {
  it("is offered alongside the magic link, and signs a known member straight in", async () => {
    const appleSignInFn = jest.fn(async () => ({
      status: "signed-in" as const,
      session: session({ canLinkEmail: false }),
    }));
    const { getByTestId } = render(
      <LoginScreen
        appleSignInFn={appleSignInFn}
        pendingSessionStore={memoryPendingStore()}
        pollIntervalMs={100000}
      />,
    );

    fireEvent.press(await waitFor(() => getByTestId("apple-sign-in-button")));

    await waitFor(() => expect(mockSetToken).toHaveBeenCalledWith("become-jwt-from-apple"));
    expect(mockReplace).toHaveBeenCalledWith("/");
    // No "check your inbox" detour: a member whose address Apple shared is
    // already in the right account.
    expect(() => getByTestId("apple-link-offer")).toThrow();
  });

  it("holds the session back for a Hide My Email account and offers the link", async () => {
    const appleSignInFn = jest.fn(async () => ({
      status: "signed-in" as const,
      session: session({
        token: "apple-session-jwt",
        user: { id: "relay-user", name: "Member", email: "zq7x8@privaterelay.appleid.com" },
        isNew: true,
        matchedBy: "created" as const,
        canLinkEmail: true,
      }),
    }));
    const appleLinkFn = jest.fn(async () => ({
      success: true,
      sessionId: "link-session-1",
      message: "Check your inbox.",
    }));
    // The merged session the server hands back once the link is tapped — it
    // belongs to the member's EXISTING account.
    const checkSessionFn = jest
      .fn()
      .mockResolvedValueOnce({ status: "pending" })
      .mockResolvedValue({ status: "verified", authToken: "existing-account-jwt" });

    const { getByTestId, queryByTestId } = render(
      <LoginScreen
        appleSignInFn={appleSignInFn}
        appleLinkFn={appleLinkFn}
        checkSessionFn={checkSessionFn}
        pendingSessionStore={memoryPendingStore()}
        pollIntervalMs={10}
      />,
    );

    fireEvent.press(await waitFor(() => getByTestId("apple-sign-in-button")));

    // THE POINT: not signed in yet, and asked whether they are already a
    // member. Storing the token here is what would strand them in the empty
    // account with their real one alongside it.
    await waitFor(() => expect(getByTestId("apple-link-offer")).toBeTruthy());
    expect(mockSetToken).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();

    fireEvent.changeText(getByTestId("apple-link-email"), "Alex@Example.test");
    fireEvent.press(getByTestId("apple-link-submit"));

    // The link is asked for with the Apple session that just opened.
    await waitFor(() =>
      expect(appleLinkFn).toHaveBeenCalledWith("apple-session-jwt", "alex@example.test"),
    );
    // …and the screen becomes the ordinary "check your inbox", polling the
    // session the link will verify.
    await waitFor(() => expect(getByTestId("login-submitted")).toBeTruthy());
    expect(queryByTestId("apple-link-offer")).toBeNull();
    await waitFor(() => expect(checkSessionFn).toHaveBeenCalledWith("link-session-1"));

    // ONE account: the session stored is the existing one, not the Apple row's.
    await waitFor(() => expect(mockSetToken).toHaveBeenCalledWith("existing-account-jwt"));
    expect(mockSetToken).not.toHaveBeenCalledWith("apple-session-jwt");
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith("/"));
  });

  it("lets a genuinely new member continue into the account Apple made", async () => {
    const appleSignInFn = jest.fn(async () => ({
      status: "signed-in" as const,
      session: session({ token: "apple-session-jwt", canLinkEmail: true }),
    }));
    const { getByTestId } = render(
      <LoginScreen
        appleSignInFn={appleSignInFn}
        pendingSessionStore={memoryPendingStore()}
        pollIntervalMs={100000}
      />,
    );

    fireEvent.press(await waitFor(() => getByTestId("apple-sign-in-button")));
    await waitFor(() => expect(getByTestId("apple-link-offer")).toBeTruthy());
    fireEvent.press(getByTestId("apple-link-skip"));

    await waitFor(() => expect(mockSetToken).toHaveBeenCalledWith("apple-session-jwt"));
    expect(mockReplace).toHaveBeenCalledWith("/");
  });

  it("refuses to send the link to something that is not an address", async () => {
    const appleSignInFn = jest.fn(async () => ({
      status: "signed-in" as const,
      session: session({ canLinkEmail: true }),
    }));
    const appleLinkFn = jest.fn();
    const { getByTestId, getByText } = render(
      <LoginScreen
        appleSignInFn={appleSignInFn}
        appleLinkFn={appleLinkFn}
        pendingSessionStore={memoryPendingStore()}
        pollIntervalMs={100000}
      />,
    );
    fireEvent.press(await waitFor(() => getByTestId("apple-sign-in-button")));
    await waitFor(() => expect(getByTestId("apple-link-offer")).toBeTruthy());

    fireEvent.changeText(getByTestId("apple-link-email"), "not-an-email");
    fireEvent.press(getByTestId("apple-link-submit"));

    expect(appleLinkFn).not.toHaveBeenCalled();
    expect(getByText("Enter the email address your account uses")).toBeTruthy();
  });

  it("says nothing when the member dismisses Apple's sheet", async () => {
    const appleSignInFn = jest.fn(async () => ({ status: "cancelled" as const }));
    const { getByTestId, queryByTestId } = render(
      <LoginScreen
        appleSignInFn={appleSignInFn}
        pendingSessionStore={memoryPendingStore()}
        pollIntervalMs={100000}
      />,
    );
    fireEvent.press(await waitFor(() => getByTestId("apple-sign-in-button")));

    await waitFor(() => expect(appleSignInFn).toHaveBeenCalled());
    expect(mockSetToken).not.toHaveBeenCalled();
    expect(queryByTestId("apple-link-offer")).toBeNull();
    // The form is still there, with nothing shouting at them.
    expect(getByTestId("login-email")).toBeTruthy();
  });

  it("surfaces a failed sign-in on the form", async () => {
    const appleSignInFn = jest.fn(async () => ({
      status: "error" as const,
      message: "Apple couldn't complete the sign-in. Please try again.",
    }));
    const { getByTestId, getByText } = render(
      <LoginScreen
        appleSignInFn={appleSignInFn}
        pendingSessionStore={memoryPendingStore()}
        pollIntervalMs={100000}
      />,
    );
    fireEvent.press(await waitFor(() => getByTestId("apple-sign-in-button")));
    await waitFor(() =>
      expect(getByText("Apple couldn't complete the sign-in. Please try again.")).toBeTruthy(),
    );
    expect(mockSetToken).not.toHaveBeenCalled();
  });

  it("is not drawn on a device without Sign in with Apple", async () => {
    const { queryByTestId, getByTestId } = render(
      <LoginScreen
        appleAvailableAsync={async () => false}
        pendingSessionStore={memoryPendingStore()}
        pollIntervalMs={100000}
      />,
    );
    // The email form is untouched; only Apple's button is absent.
    expect(getByTestId("login-email")).toBeTruthy();
    await waitFor(() => expect(queryByTestId("apple-sign-in-button")).toBeNull());
  });
});
