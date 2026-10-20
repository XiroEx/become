/* eslint-disable import/first */
// NP-205 — MOVE WEB-APP MEMBERS TO THE NATIVE APP.
//
// (id: e015cb31) The native sign-in screen tells a member to use the same
// email they use on the web, so they understand why signing in natively
// surfaces the SAME account — streaks, history and all — rather than
// starting fresh. Shown on sign-in only (register creates a new account, so
// the hint does not apply there).

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

import { render } from "@testing-library/react-native";
import LoginScreen from "../app/(auth)/login";
/* eslint-enable import/first */

beforeEach(() => {
  mockReplace.mockReset();
  mockCanGoBack.mockReset();
  mockCanGoBack.mockReturnValue(false);
  mockBack.mockReset();
  mockSetToken.mockReset();
});

describe("(NP-205 / id: e015cb31) the same-email hint", () => {
  it("shows on sign-in, naming streaks and history", () => {
    const { getByTestId, getByText } = render(<LoginScreen />);
    expect(getByTestId("login-same-email-hint")).toBeTruthy();
    expect(getByText(/same email/i)).toBeTruthy();
    expect(getByText(/streaks and/)).toBeTruthy();
  });

  it("does not show on register — a new account has no 'same email' to match", () => {
    const { queryByTestId } = render(<LoginScreen initialMode="register" />);
    expect(queryByTestId("login-same-email-hint")).toBeNull();
  });
});
