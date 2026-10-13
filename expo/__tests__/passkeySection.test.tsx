/**
 * Passkey Section (card 6acdcae0433f8772a69adf8c, NP-161).
 *
 * NP-161 replaced the web hand-off with the real on-device ceremony, run
 * through `@/lib/auth/passkey.ts` (`react-native-passkey`). A device too old
 * to run it (`passkeySupported()` false) keeps the ORIGINAL hand-off —
 * `openWebSignedIn` to the real web Settings page — which is the only case
 * left where this still defers to web.
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
    const { getByTestId, getByText } = render(<PasskeySection supported={false} />);
    await waitFor(() => {
      expect(getByTestId("settings-passkey-section")).toBeTruthy();
    });
    expect(getByText("Passkey")).toBeTruthy();
    expect(
      getByText("Sign in with Face ID, Touch ID, or a security key."),
    ).toBeTruthy();
  });

  describe("on a device that cannot run the ceremony", () => {
    it("(a69adf8d/a69adf8e) 'Add a passkey' hands off to the real web Settings page, signed in", async () => {
      const { getByTestId } = render(<PasskeySection supported={false} />);
      const addRow = getByTestId("passkey-add-button");
      expect(addRow.props.accessibilityRole).toBe("link");
      expect(addRow.props.accessibilityLabel).toBe("Add a passkey");

      fireEvent.press(addRow);

      await waitFor(() => {
        expect(mockOpenWebSignedIn).toHaveBeenCalledWith(PASSKEY_SETTINGS_PATH);
      });
      expect(PASSKEY_SETTINGS_PATH).toBe("/dashboard/settings");
    });
  });

  describe("on a device that can run the ceremony (NP-161)", () => {
    function fakeDeps(overrides: Partial<{ create: jest.Mock; get: jest.Mock }> = {}) {
      return {
        passkey: {
          isSupported: () => true,
          create:
            overrides.create ??
            jest.fn(async () => ({
              id: "cred-1",
              rawId: "cred-1",
              response: { clientDataJSON: "c", attestationObject: "a" },
            })),
          get: overrides.get ?? jest.fn(),
        },
        fetchJson: jest.fn(async (path: string) => {
          if (path.endsWith("/options")) return { challengeId: "chal-1", options: {} };
          return { ok: true };
        }),
      };
    }

    it("'Add a passkey' is a button, not a link, and never leaves the app", async () => {
      const { getByTestId } = render(
        <PasskeySection supported token="jwt" deps={fakeDeps()} />,
      );
      const addRow = getByTestId("passkey-add-button");
      expect(addRow.props.accessibilityRole).toBe("button");
      expect(addRow.props.accessibilityLabel).toBe("Add a passkey");

      fireEvent.press(addRow);

      await waitFor(() => {
        expect(getByTestId("passkey-add-status")).toBeTruthy();
      });
      expect(mockOpenWebSignedIn).not.toHaveBeenCalled();
    });

    it("confirms success inline", async () => {
      const deps = fakeDeps();
      const { getByTestId, findByText } = render(
        <PasskeySection supported token="jwt" deps={deps} />,
      );
      fireEvent.press(getByTestId("passkey-add-button"));
      expect(
        await findByText("Passkey added. You can use it to sign in next time."),
      ).toBeTruthy();
    });

    it("surfaces a native ceremony failure inline", async () => {
      const deps = fakeDeps({
        create: jest.fn(async () => {
          throw { error: "CredentialAlreadyExists", message: "exists" };
        }),
      });
      const { getByTestId, findByText } = render(
        <PasskeySection supported token="jwt" deps={deps} />,
      );
      fireEvent.press(getByTestId("passkey-add-button"));
      expect(
        await findByText("A passkey for this account already exists on this device."),
      ).toBeTruthy();
    });

    it("does nothing without a signed-in session", () => {
      const deps = fakeDeps();
      const { getByTestId } = render(<PasskeySection supported deps={deps} />);
      fireEvent.press(getByTestId("passkey-add-button"));
      expect(deps.fetchJson).not.toHaveBeenCalled();
    });
  });

  it("(a69adf8e) calls out, rather than hiding, that list/remove stay on web for now", async () => {
    const { getByText } = render(<PasskeySection supported={false} />);
    // No list/rename/remove UI is rendered — there is nothing to list,
    // because the web Settings page itself does not expose one either.
    expect(
      getByText(/Managing or removing an existing passkey/),
    ).toBeTruthy();
  });
});
