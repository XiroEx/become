/* eslint-disable import/first */
// NP-253: the restore screen had no exit at all (a member opening the link
// from mail was stuck there), the "incomplete link" copy dropped the support
// email, and the valid-link copy/button colour disagreed with the web page.
// This pins all three against the web's actual copy and the exit's two
// destinations.
//
// NP-311: dead-link failure parity with web — pins updated failure copy and
// support email mailto link on the failed-restore state.

import { fireEvent, render, waitFor } from "@testing-library/react-native";
import { Linking } from "react-native";

const mockReplace = jest.fn();
let mockParams: { u?: string; t?: string } = {};

jest.mock("expo-router", () => ({
  useRouter: () => ({
    replace: mockReplace,
    push: jest.fn(),
    back: jest.fn(),
  }),
  useLocalSearchParams: () => mockParams,
}));

let mockIsAuthed = false;
jest.mock("@/lib/auth/useAuth", () => ({
  useAuth: () => ({
    user: null,
    token: null,
    loading: false,
    isAuthed: mockIsAuthed,
    setToken: jest.fn(),
    refresh: jest.fn(),
    logout: jest.fn(),
  }),
}));

const mockRestoreAccount = jest.fn();
jest.mock("@/lib/account/deleteAccount", () => ({
  restoreAccount: (...args: unknown[]) => mockRestoreAccount(...args),
}));

import RestoreAccountRoute from "../app/(auth)/account/restore";

describe("RestoreAccountRoute (NP-253)", () => {
  beforeEach(() => {
    mockReplace.mockReset();
    mockRestoreAccount.mockReset();
    mockParams = {};
    mockIsAuthed = false;
    jest.spyOn(Linking, "openURL").mockResolvedValue(true);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("shows the Back to Become exit above the title, on the missing-link state", () => {
    const { getByTestId } = render(<RestoreAccountRoute />);
    expect(getByTestId("restore-back-link")).toBeTruthy();
    expect(getByTestId("restore-missing")).toBeTruthy();
  });

  it("shows the Back to Become exit above the title, on the valid-link state", () => {
    mockParams = { u: "user-1", t: "mac-token" };
    const { getByTestId } = render(<RestoreAccountRoute />);
    expect(getByTestId("restore-back-link")).toBeTruthy();
    expect(getByTestId("restore-confirm")).toBeTruthy();
  });

  it("sends a signed-out device to /login", () => {
    mockIsAuthed = false;
    const { getByTestId } = render(<RestoreAccountRoute />);
    fireEvent.press(getByTestId("restore-back-link"));
    expect(mockReplace).toHaveBeenCalledWith("/login");
  });

  it("sends a signed-in device Home instead of to sign-in", () => {
    mockIsAuthed = true;
    const { getByTestId } = render(<RestoreAccountRoute />);
    fireEvent.press(getByTestId("restore-back-link"));
    expect(mockReplace).toHaveBeenCalledWith("/(tabs)/dashboard");
  });

  it("tells an incomplete link's reader to email support, with a working mailto link", () => {
    const { getByTestId, getByText } = render(<RestoreAccountRoute />);
    expect(
      getByText(
        /This link is incomplete\. Open the one in the email we sent when the deletion was/,
      ),
    ).toBeTruthy();
    const emailLink = getByTestId("restore-support-email");
    expect(emailLink.props.children).toBe("info@becomeurbest.com");

    fireEvent.press(emailLink);
    expect(Linking.openURL).toHaveBeenCalledWith(
      "mailto:info@becomeurbest.com",
    );
  });

  it("matches the web's valid-link copy and its black (not red) confirm button", () => {
    mockParams = { u: "user-1", t: "mac-token" };
    const { getByTestId, getByText } = render(<RestoreAccountRoute />);
    expect(
      getByText(
        "Pressing this cancels the deletion request on your account. Nothing has been deleted yet.",
      ),
    ).toBeTruthy();

    const button = getByTestId("restore-confirm");
    // `inverted` -> `bg-foreground`, the web's black/white button — NOT the
    // brand-red `primary` variant restore shipped with before this card.
    expect(button.props.className).toContain("bg-foreground");
    expect(button.props.className).not.toContain("bg-primary");
  });

  it("still restores on press, unchanged behaviour", async () => {
    mockParams = { u: "user-1", t: "mac-token" };
    mockRestoreAccount.mockResolvedValue({ ok: true });
    const { getByTestId } = render(<RestoreAccountRoute />);
    fireEvent.press(getByTestId("restore-confirm"));
    await waitFor(() => {
      expect(mockRestoreAccount).toHaveBeenCalledWith({
        userId: "user-1",
        token: "mac-token",
      });
    });
    expect(await waitFor(() => getByTestId("restore-done"))).toBeTruthy();
  });

  it("matches the web's dead-link failure copy and provides a working support mailto link (NP-311)", async () => {
    mockParams = { u: "user-1", t: "dead-token" };
    mockRestoreAccount.mockResolvedValue({ ok: false });
    const { getByTestId, getByText } = render(<RestoreAccountRoute />);

    fireEvent.press(getByTestId("restore-confirm"));

    await waitFor(() => {
      expect(getByTestId("restore-failed")).toBeTruthy();
    });

    expect(
      getByText(
        "This link no longer works. That happens when the deletion was already cancelled, when a newer request replaced it, or when the window to change your mind has closed and the data is gone.",
      ),
    ).toBeTruthy();

    expect(
      getByText(
        /If you think that is wrong, email/,
      ),
    ).toBeTruthy();

    const emailLink = getByTestId("restore-support-email");
    expect(emailLink.props.children).toBe("info@becomeurbest.com");

    fireEvent.press(emailLink);
    expect(Linking.openURL).toHaveBeenCalledWith(
      "mailto:info@becomeurbest.com",
    );
  });

  it("shows the dead-link failure copy and support mailto link when restoreAccount rejects (NP-311)", async () => {
    mockParams = { u: "user-1", t: "error-token" };
    mockRestoreAccount.mockRejectedValue(new Error("Network failure"));
    const { getByTestId, getByText } = render(<RestoreAccountRoute />);

    fireEvent.press(getByTestId("restore-confirm"));

    await waitFor(() => {
      expect(getByTestId("restore-failed")).toBeTruthy();
    });

    expect(
      getByText(
        "This link no longer works. That happens when the deletion was already cancelled, when a newer request replaced it, or when the window to change your mind has closed and the data is gone.",
      ),
    ).toBeTruthy();

    const emailLink = getByTestId("restore-support-email");
    fireEvent.press(emailLink);
    expect(Linking.openURL).toHaveBeenCalledWith(
      "mailto:info@becomeurbest.com",
    );
  });
});
