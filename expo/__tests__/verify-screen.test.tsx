/* eslint-disable import/first */
import { fireEvent, render, waitFor } from "@testing-library/react-native";

const mockReplace = jest.fn();
let mockParams: { token?: string; mode?: string } = {};

jest.mock("expo-router", () => ({
  useRouter: () => ({
    replace: mockReplace,
    push: jest.fn(),
    back: jest.fn(),
  }),
  useLocalSearchParams: () => mockParams,
}));

const mockSetToken = jest.fn(async () => {});
jest.mock("@/lib/auth/useAuth", () => ({
  useAuth: () => ({
    user: null,
    token: null,
    loading: false,
    isAuthed: false,
    setToken: mockSetToken,
    refresh: jest.fn(),
    logout: jest.fn(),
  }),
}));

// Mock only apiFetch; keep schemas real so the default verify path validates.
jest.mock("@become/api-client", () => {
  const actual = jest.requireActual("@become/api-client");
  return { __esModule: true, ...actual, apiFetch: jest.fn() };
});

import { ApiError, apiFetch, VerifyLinkResponseSchema } from "@become/api-client";
import { WEBAPP_BASE_URL } from "@/lib/config";
import VerifyRoute, {
  VerifyScreen,
  friendlyVerifyErrorMessage,
} from "../app/(auth)/verify";
/* eslint-enable import/first */

const mockApiFetch = apiFetch as unknown as jest.Mock;

describe("VerifyScreen (presentational, prop-driven)", () => {
  beforeEach(() => {
    mockReplace.mockReset();
    mockSetToken.mockReset();
    mockSetToken.mockResolvedValue(undefined);
    mockApiFetch.mockReset();
    mockParams = {};
  });

  it("shows the working spinner during mount", () => {
    mockParams = { token: "real-token-1234", mode: "login" };
    const verifyFn = jest.fn(() => new Promise(() => {})) as unknown as (
      token: string,
      mode: "login" | "register",
    ) => Promise<{ token: string }>;
    const { getByTestId } = render(<VerifyScreen verifyFn={verifyFn} />);
    // NP-124: the spinner is hidden from assistive technology (an unlabelled
    // ActivityIndicator announces nothing; the text beside it says everything),
    // so the query has to ask for hidden elements to see it at all.
    expect(
      getByTestId("verify-spinner", { includeHiddenElements: true }),
    ).toBeTruthy();
    expect(getByTestId("verify-working-text")).toBeTruthy();
  });

  it("calls verifyFn with the token + mode and navigates on success", async () => {
    mockParams = { token: "real-token-1234", mode: "login" };
    const verifyFn = jest.fn(async () => ({ token: "new-jwt" }));
    const onSuccess = jest.fn();
    render(<VerifyScreen verifyFn={verifyFn} onSuccess={onSuccess} />);
    await waitFor(() => {
      expect(verifyFn).toHaveBeenCalled();
    });
    expect(verifyFn).toHaveBeenCalledWith("real-token-1234", "login");
    await waitFor(() => {
      expect(onSuccess).toHaveBeenCalledWith("new-jwt");
    });
    expect(mockReplace).toHaveBeenCalledWith("/");
  });

  it("shows an error when the token is missing", () => {
    mockParams = { mode: "login" };
    const verifyFn = jest.fn();
    const { getByTestId } = render(<VerifyScreen verifyFn={verifyFn as never} />);
    expect(getByTestId("verify-error")).toBeTruthy();
    expect(verifyFn).not.toHaveBeenCalled();
  });

  it("shows an error when the mode is invalid", () => {
    mockParams = { token: "real-token-1234", mode: "bogus" };
    const verifyFn = jest.fn();
    const { getByTestId } = render(<VerifyScreen verifyFn={verifyFn as never} />);
    expect(getByTestId("verify-error")).toBeTruthy();
    expect(verifyFn).not.toHaveBeenCalled();
  });

  it("shows an error message when verifyFn rejects", async () => {
    mockParams = { token: "real-token-1234", mode: "login" };
    const verifyFn = jest.fn(async () => {
      throw new Error("Server rejected token");
    });
    const onFailure = jest.fn();
    const { getByTestId } = render(
      <VerifyScreen verifyFn={verifyFn} onFailure={onFailure} />,
    );
    await waitFor(() => {
      expect(getByTestId("verify-error")).toBeTruthy();
    });
    // onFailure may fire 1× or 2× depending on React's strict-mode double-mount
    // in tests. The contract under test is "failure surfaces to caller" — count
    // is not part of the contract.
    expect(onFailure).toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("default verify path POSTs /api/auth/verify-link via apiFetch with baseUrl", async () => {
    mockParams = { token: "real-token-1234", mode: "login" };
    mockApiFetch.mockResolvedValue({
      token: "new-jwt",
      user: { id: "u1", email: "jon@example.com" },
    });
    render(<VerifyScreen />);
    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith(
        "/api/auth/verify-link",
        VerifyLinkResponseSchema,
        {
          method: "POST",
          body: { token: "real-token-1234" },
          baseUrl: WEBAPP_BASE_URL,
        },
      );
    });
  });
});

describe("VerifyRoute (default export, route wrapper)", () => {
  beforeEach(() => {
    mockReplace.mockReset();
    mockSetToken.mockReset();
    mockSetToken.mockResolvedValue(undefined);
    mockApiFetch.mockReset();
    mockParams = {};
  });

  it("persists the JWT via useAuth().setToken on a successful verify", async () => {
    mockParams = { token: "real-token-1234", mode: "login" };
    mockApiFetch.mockResolvedValue({
      token: "persisted-jwt",
      user: { id: "u1", email: "jon@example.com" },
    });
    render(<VerifyRoute />);
    await waitFor(() => {
      expect(mockSetToken).toHaveBeenCalledWith("persisted-jwt");
    });
    expect(mockReplace).toHaveBeenCalledWith("/");
  });

  it("clears any pending magic-link session on successful verify", async () => {
    mockParams = { token: "real-token-1234", mode: "register" };
    const verifyFn = jest.fn(async () => ({ token: "new-jwt" }));
    const mockClear = jest.fn(async () => {});
    const pendingStore = {
      get: jest.fn(async () => null),
      set: jest.fn(async () => {}),
      clear: mockClear,
    };
    render(
      <VerifyScreen
        verifyFn={verifyFn}
        pendingSessionStore={pendingStore}
      />,
    );
    await waitFor(() => {
      expect(verifyFn).toHaveBeenCalledWith("real-token-1234", "register");
    });
    await waitFor(() => {
      expect(mockClear).toHaveBeenCalled();
    });
    expect(mockReplace).toHaveBeenCalledWith("/");
  });

  it("does not persist a token when verify fails", async () => {
    mockParams = { token: "real-token-1234", mode: "login" };
    mockApiFetch.mockRejectedValue(new Error("invalid token"));
    const { getByTestId } = render(<VerifyRoute />);
    await waitFor(() => {
      expect(getByTestId("verify-error")).toBeTruthy();
    });
    expect(mockSetToken).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
  });
});

// Acceptance criterion (NP-252): the error state is the web's card — an icon,
// "Verification failed", a friendly message mapped from the error, and a
// "Try again" button back to sign-in — not a raw error line on a blank
// screen with no way out.
describe("VerifyScreen error card (NP-252 web parity)", () => {
  beforeEach(() => {
    mockReplace.mockReset();
    mockSetToken.mockReset();
    mockSetToken.mockResolvedValue(undefined);
    mockApiFetch.mockReset();
    mockParams = {};
  });

  it("no token: shows the web's 'No verification token provided.' message", () => {
    mockParams = { mode: "login" };
    const { getByTestId } = render(<VerifyScreen verifyFn={jest.fn() as never} />);
    expect(getByTestId("verify-error-title").props.children).toBe(
      "Verification failed",
    );
    expect(getByTestId("verify-error-message").props.children).toBe(
      "No verification token provided.",
    );
  });

  it("missing/invalid mode: shows the web's 'expired or invalid' message", () => {
    mockParams = { token: "real-token-1234", mode: "bogus" };
    const { getByTestId } = render(<VerifyScreen verifyFn={jest.fn() as never} />);
    expect(getByTestId("verify-error-message").props.children).toBe(
      "This link has expired or is invalid. Please request a new one.",
    );
  });

  it("a server refusal renders the server's message verbatim, not 'API error 400'", async () => {
    mockParams = { token: "real-token-1234", mode: "login" };
    const verifyFn = jest.fn(async () => {
      throw new ApiError(400, {
        message: "This link has expired or is invalid. Please request a new one.",
      });
    });
    const { getByTestId } = render(<VerifyScreen verifyFn={verifyFn} />);
    await waitFor(() => {
      expect(getByTestId("verify-error-message").props.children).toBe(
        "This link has expired or is invalid. Please request a new one.",
      );
    });
  });

  it("an unclassifiable failure falls back to the web's generic line", async () => {
    mockParams = { token: "real-token-1234", mode: "login" };
    const verifyFn = jest.fn(async () => {
      throw new Error();
    });
    const { getByTestId } = render(<VerifyScreen verifyFn={verifyFn} />);
    await waitFor(() => {
      expect(getByTestId("verify-error-message").props.children).toBe(
        "Something went wrong. Please try again.",
      );
    });
  });

  it("'Try again' routes back to sign-in — there is always a way back", () => {
    mockParams = { mode: "login" };
    const { getByTestId } = render(<VerifyScreen verifyFn={jest.fn() as never} />);
    fireEvent.press(getByTestId("verify-retry"));
    expect(mockReplace).toHaveBeenCalledWith("/login");
  });
});

describe("friendlyVerifyErrorMessage (pure mapping)", () => {
  it("maps the native-only local-validation sentinels onto the web's copy", () => {
    expect(friendlyVerifyErrorMessage("no-token")).toBe(
      "No verification token provided.",
    );
    expect(friendlyVerifyErrorMessage("bad-mode")).toBe(
      "This link has expired or is invalid. Please request a new one.",
    );
  });

  it("passes a server ApiError's message through verbatim", () => {
    const err = new ApiError(400, {
      message: "This link has expired or is invalid. Please request a new one.",
    });
    expect(friendlyVerifyErrorMessage(err)).toBe(
      "This link has expired or is invalid. Please request a new one.",
    );
  });

  it("falls back to the web's generic line for anything else", () => {
    expect(friendlyVerifyErrorMessage(new Error("boom"))).toBe(
      "Something went wrong. Please try again.",
    );
    expect(friendlyVerifyErrorMessage(null)).toBe(
      "Something went wrong. Please try again.",
    );
  });
});
