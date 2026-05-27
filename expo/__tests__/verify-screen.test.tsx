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

import VerifyScreen from "../app/verify";
/* eslint-enable import/first */

describe("VerifyScreen", () => {
  beforeEach(() => {
    mockReplace.mockReset();
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
});
