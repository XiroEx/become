/**
 * SIGN IN WITH A PASSKEY, on the login screen (NP-161).
 *
 * The ceremony itself is exercised against a fake capability in
 * `passkeyNative.test.tsx`; this file pins what the SCREEN owes the member —
 * exactly the same contract `googleSignIn.test.tsx` pins for its button: a
 * dismissal says nothing, a failure is one sentence, a success is stored
 * exactly as a magic-link session is. Also pins that the button is login-mode
 * only and hidden on a device that cannot run the ceremony.
 */
/* eslint-disable import/first */
import { fireEvent, render, waitFor } from "@testing-library/react-native";

const mockReplace = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ replace: mockReplace, push: jest.fn(), back: jest.fn(), canGoBack: () => false }),
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

import LoginScreen from "../app/(auth)/login";
import {
  createPendingSessionStore,
  type PendingSessionStore,
} from "@/lib/auth/pendingAuthSession";
import { createMemoryTokenStore } from "@/lib/auth/secureStoreToken";
/* eslint-enable import/first */

function memoryPendingStore(): PendingSessionStore {
  return createPendingSessionStore(createMemoryTokenStore(null));
}

beforeEach(() => {
  mockAuth = baseAuth();
  mockReplace.mockClear();
  mockSetToken.mockClear();
});

describe("the passkey button on the sign-in screen", () => {
  it("is hidden in register mode — a passkey authenticates, it does not sign up", () => {
    const { queryByTestId } = render(
      <LoginScreen
        initialMode="register"
        passkeySupportedFn={() => true}
        passkeySignInFn={jest.fn()}
        pendingSessionStore={memoryPendingStore()}
      />,
    );
    expect(queryByTestId("passkey-sign-in-button")).toBeNull();
  });

  it("is hidden on a device that cannot run the ceremony", () => {
    const { queryByTestId } = render(
      <LoginScreen
        passkeySupportedFn={() => false}
        passkeySignInFn={jest.fn()}
        pendingSessionStore={memoryPendingStore()}
      />,
    );
    expect(queryByTestId("passkey-sign-in-button")).toBeNull();
  });

  it("signs an existing member in and stores the session", async () => {
    const passkeySignInFn = jest.fn(async () => ({
      status: "signed-in" as const,
      token: "become-jwt-from-passkey",
    }));
    const { getByTestId } = render(
      <LoginScreen
        passkeySupportedFn={() => true}
        passkeySignInFn={passkeySignInFn}
        pendingSessionStore={memoryPendingStore()}
      />,
    );

    fireEvent.press(getByTestId("passkey-sign-in-button"));

    await waitFor(() =>
      expect(mockSetToken).toHaveBeenCalledWith("become-jwt-from-passkey"),
    );
    expect(mockReplace).toHaveBeenCalledWith("/");
  });

  it("says nothing when the member dismisses the system sheet", async () => {
    const passkeySignInFn = jest.fn(async () => ({ status: "cancelled" as const }));
    const { getByTestId, queryByTestId } = render(
      <LoginScreen
        passkeySupportedFn={() => true}
        passkeySignInFn={passkeySignInFn}
        pendingSessionStore={memoryPendingStore()}
      />,
    );

    fireEvent.press(getByTestId("passkey-sign-in-button"));

    await waitFor(() => expect(passkeySignInFn).toHaveBeenCalled());
    expect(mockSetToken).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
    expect(queryByTestId("login-email-error")).toBeNull();
  });

  it("puts a failure on the form", async () => {
    const passkeySignInFn = jest.fn(async () => ({
      status: "error" as const,
      message: "Passkey sign-in failed. Please try again.",
    }));
    const { getByTestId, findByText } = render(
      <LoginScreen
        passkeySupportedFn={() => true}
        passkeySignInFn={passkeySignInFn}
        pendingSessionStore={memoryPendingStore()}
      />,
    );

    fireEvent.press(getByTestId("passkey-sign-in-button"));

    expect(
      await findByText("Passkey sign-in failed. Please try again."),
    ).toBeTruthy();
    expect(mockSetToken).not.toHaveBeenCalled();
  });
});
