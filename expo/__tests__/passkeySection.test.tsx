/**
 * Passkey Section (card 6acdcae0433f8772a69adf8c) — Visual QA 2026-10-12
 * found native Settings missing the Passkey section the web shows.
 *
 * What the web actually offers, confirmed by reading
 * `webapp/components/PasskeySetupButton.tsx` and every route under
 * `webapp/app/api/auth/passkey/`, is exactly one affordance — "Add a
 * passkey" — with no list, rename or remove anywhere in the product. This
 * section mirrors that: a single "Add a passkey" row that hands the member
 * to the real web Settings page (`openWebSignedIn`), because native has no
 * WebAuthn module to run the ceremony on-device yet (NP-161, open).
 */
/* eslint-disable import/first */
import { fireEvent, render, waitFor } from "@testing-library/react-native";

const mockOpenWebSignedIn = jest.fn(async (_path: string) => "signed-in" as const);
jest.mock("@/lib/web/openWebSignedIn", () => ({
  openWebSignedIn: (path: string) => mockOpenWebSignedIn(path),
}));

import {
  PasskeySection,
  PASSKEY_SETTINGS_PATH,
} from "@/components/settings/PasskeySection";
/* eslint-enable import/first */

describe("PasskeySection", () => {
  beforeEach(() => {
    mockOpenWebSignedIn.mockClear();
  });

  it("renders a Passkey section styled like its Security neighbour", async () => {
    const { getByTestId, getByText } = render(<PasskeySection />);
    await waitFor(() => {
      expect(getByTestId("settings-passkey-section")).toBeTruthy();
    });
    expect(getByText("Passkey")).toBeTruthy();
    expect(
      getByText("Sign in with Face ID, Touch ID, or a security key."),
    ).toBeTruthy();
  });

  it("(a69adf8d/a69adf8e) 'Add a passkey' hands off to the real web Settings page, signed in", async () => {
    const { getByTestId } = render(<PasskeySection />);
    const addRow = getByTestId("passkey-add-button");
    expect(addRow.props.accessibilityRole).toBe("link");
    expect(addRow.props.accessibilityLabel).toBe("Add a passkey");

    fireEvent.press(addRow);

    await waitFor(() => {
      expect(mockOpenWebSignedIn).toHaveBeenCalledWith(PASSKEY_SETTINGS_PATH);
    });
    expect(PASSKEY_SETTINGS_PATH).toBe("/dashboard/settings");
  });

  it("(a69adf8e) calls out, rather than hiding, that list/remove stay on web for now", async () => {
    const { getByText } = render(<PasskeySection />);
    // No list/rename/remove UI is rendered — there is nothing to list,
    // because the web Settings page itself does not expose one either.
    expect(
      getByText(
        /Managing or removing an existing passkey also stays\s+on web for now/,
      ),
    ).toBeTruthy();
  });
});
