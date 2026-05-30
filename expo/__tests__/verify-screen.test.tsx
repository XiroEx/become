/* eslint-disable import/first */
import { render, waitFor } from "@testing-library/react-native";

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

import { apiFetch, VerifyLinkResponseSchema } from "@become/api-client";
import { WEBAPP_BASE_URL } from "@/lib/config";
import VerifyRoute, { VerifyScreen } from "../app/verify";
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
    expect(getByTestId("verify-spinner")).toBeTruthy();
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
    expect(mockReplace).toHaveBeenCalledWith("/(tabs)/dashboard");
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
    expect(mockReplace).toHaveBeenCalledWith("/(tabs)/dashboard");
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
