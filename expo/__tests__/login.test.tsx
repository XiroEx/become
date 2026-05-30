/* eslint-disable import/first */
import { fireEvent, render, waitFor } from "@testing-library/react-native";

const mockReplace = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({
    replace: mockReplace,
    push: jest.fn(),
    back: jest.fn(),
  }),
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

// Mock only apiFetch from the shared client; keep ApiError + schemas real so
// the default send-link/check-session paths and error mapping behave for real.
jest.mock("@become/api-client", () => {
  const actual = jest.requireActual("@become/api-client");
  return { __esModule: true, ...actual, apiFetch: jest.fn() };
});

import {
  apiFetch,
  ApiError,
  SendLinkResponseSchema,
  CheckSessionResponseSchema,
} from "@become/api-client";
import { WEBAPP_BASE_URL } from "@/lib/config";
import LoginScreen, { extractErrorMessage } from "../app/login";
/* eslint-enable import/first */

const mockApiFetch = apiFetch as unknown as jest.Mock;

describe("LoginScreen", () => {
  beforeEach(() => {
    mockReplace.mockReset();
    mockSetToken.mockReset();
    mockSetToken.mockResolvedValue(undefined);
    mockApiFetch.mockReset();
  });

  it("POSTs /api/auth/send-link with the right payload + baseUrl", async () => {
    mockApiFetch.mockResolvedValue({
      success: true,
      message: "sent",
      sessionId: "sess-1",
    });
    const { getByTestId } = render(
      // Inject a pending checkSession so the polling fallback doesn't reach for
      // the mocked apiFetch — this test isolates the send-link call.
      <LoginScreen
        checkSessionFn={async () => ({ status: "pending" as const })}
        pollIntervalMs={100000}
      />,
    );
    fireEvent.changeText(getByTestId("login-email"), "Jon@Example.com");
    fireEvent.press(getByTestId("login-submit"));

    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith(
        "/api/auth/send-link",
        SendLinkResponseSchema,
        {
          method: "POST",
          body: { email: "jon@example.com", mode: "login" },
          baseUrl: WEBAPP_BASE_URL,
        },
      );
    });
    // The "Check your inbox" confirmation replaces the form.
    expect(getByTestId("login-submitted")).toBeTruthy();
  });

  it("spins up polling and, on verified, persists the token and navigates", async () => {
    const checkSessionFn = jest
      .fn()
      .mockResolvedValueOnce({ status: "pending" })
      .mockResolvedValue({ status: "verified", authToken: "jwt-123" });
    const { getByTestId } = render(
      <LoginScreen checkSessionFn={checkSessionFn} pollIntervalMs={10} />,
    );
    // Default sendLink path uses the mocked apiFetch.
    mockApiFetch.mockResolvedValue({
      success: true,
      message: "sent",
      sessionId: "sess-poll",
    });
    fireEvent.changeText(getByTestId("login-email"), "jon@example.com");
    fireEvent.press(getByTestId("login-submit"));

    await waitFor(() => expect(checkSessionFn).toHaveBeenCalledWith("sess-poll"));
    await waitFor(() => expect(mockSetToken).toHaveBeenCalledWith("jwt-123"));
    await waitFor(() =>
      expect(mockReplace).toHaveBeenCalledWith("/(tabs)/dashboard"),
    );
  });

  it("uses the default check-session apiFetch path with baseUrl", async () => {
    // status never verifies → just assert the poll request shape once.
    mockApiFetch
      .mockResolvedValueOnce({
        success: true,
        message: "sent",
        sessionId: "sess-2",
      })
      .mockResolvedValue({ status: "pending" });
    const { getByTestId } = render(<LoginScreen pollIntervalMs={10} />);
    fireEvent.changeText(getByTestId("login-email"), "jon@example.com");
    fireEvent.press(getByTestId("login-submit"));

    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith(
        "/api/auth/check-session",
        CheckSessionResponseSchema,
        {
          method: "POST",
          body: { sessionId: "sess-2" },
          baseUrl: WEBAPP_BASE_URL,
        },
      );
    });
  });

  it("clears the poller timer on unmount", async () => {
    const setSpy = jest.fn((fn: () => void, ms?: number) =>
      setTimeout(fn, ms),
    ) as unknown as typeof setTimeout;
    const clearSpy = jest.fn((id: ReturnType<typeof setTimeout>) =>
      clearTimeout(id),
    ) as unknown as typeof clearTimeout;
    mockApiFetch.mockResolvedValue({
      success: true,
      message: "sent",
      sessionId: "sess-unmount",
    });
    const { getByTestId, unmount } = render(
      <LoginScreen
        checkSessionFn={async () => ({ status: "pending" as const })}
        pollIntervalMs={100000}
        setTimeoutImpl={setSpy}
        clearTimeoutImpl={clearSpy}
      />,
    );
    fireEvent.changeText(getByTestId("login-email"), "jon@example.com");
    fireEvent.press(getByTestId("login-submit"));

    await waitFor(() => expect(setSpy).toHaveBeenCalled());
    unmount();
    expect(clearSpy).toHaveBeenCalled();
  });

  it("surfaces a 4xx/5xx error message back to the form", async () => {
    mockApiFetch.mockRejectedValue(
      new ApiError(429, { message: "A link was just sent. Try again in 12s." }),
    );
    const { getByTestId, queryByTestId, getByText } = render(<LoginScreen />);
    fireEvent.changeText(getByTestId("login-email"), "jon@example.com");
    fireEvent.press(getByTestId("login-submit"));

    await waitFor(() =>
      expect(getByText("A link was just sent. Try again in 12s.")).toBeTruthy(),
    );
    // Stays on the form (no inbox confirmation) so the user can retry.
    expect(queryByTestId("login-submitted")).toBeNull();
  });

  it("validates email before calling the API", () => {
    const { getByTestId, getByText } = render(<LoginScreen />);
    fireEvent.changeText(getByTestId("login-email"), "not-an-email");
    fireEvent.press(getByTestId("login-submit"));
    expect(getByText("Enter a valid email")).toBeTruthy();
    expect(mockApiFetch).not.toHaveBeenCalled();
  });
});

describe("extractErrorMessage", () => {
  it("returns the API body message for an ApiError carrying one", () => {
    expect(
      extractErrorMessage(new ApiError(409, { message: "Email already in use" })),
    ).toBe("Email already in use");
  });

  it("falls back to a status message for a bodyless ApiError", () => {
    expect(extractErrorMessage(new ApiError(500, null))).toMatch(/500/);
  });

  it("uses a generic message for an unknown throwable", () => {
    expect(extractErrorMessage("boom")).toMatch(/magic link/i);
  });
});
