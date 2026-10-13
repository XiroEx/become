/**
 * Passkey (card 6acdcae0433f8772a69adf8c, NP-161).
 *
 * The native twin of the web's `PasskeySetupButton`: same label, button text,
 * busy text, status line and help text. NP-161's on-device ceremony runs
 * through `@/lib/auth/passkey.ts` (`react-native-passkey`); a device too old
 * to run it (`passkeySupported()` false) keeps the hand-off to the web
 * Settings page.
 *
 * Where it is rendered (Profile > Account, under Email) and that it gets the
 * real `useAuth()` token there is `profilePasskey.test.tsx`.
 */
/* eslint-disable import/first */
import { fireEvent, render, waitFor } from "@testing-library/react-native";

const mockOpenWebSignedIn = jest.fn(async (_path: string) => "signed-in" as const);
jest.mock("@/lib/web/openWebSignedIn", () => ({
  openWebSignedIn: (path: string) => mockOpenWebSignedIn(path),
}));

import {
  PasskeySection,
  PASSKEY_HELP_TEXT,
  PASSKEY_SETTINGS_PATH,
} from "@/components/settings/PasskeySection";
/* eslint-enable import/first */

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

describe("PasskeySection", () => {
  beforeEach(() => {
    mockOpenWebSignedIn.mockClear();
  });

  it("matches the web's PasskeySetupButton: label, button text, help text", () => {
    const { getByTestId, getByText } = render(
      <PasskeySection supported token="jwt" deps={fakeDeps()} />,
    );
    expect(getByTestId("settings-passkey-section")).toBeTruthy();
    expect(getByText("Passkey")).toBeTruthy();
    expect(getByText("Add a passkey")).toBeTruthy();
    expect(getByText(PASSKEY_HELP_TEXT)).toBeTruthy();
    expect(PASSKEY_HELP_TEXT).toBe("Sign in with Face ID, Touch ID, or a security key.");
  });

  it("(a69adf8e) offers only Add a passkey: no list, rename or remove, as on web", () => {
    const { getAllByRole } = render(<PasskeySection supported token="jwt" deps={fakeDeps()} />);
    expect(getAllByRole("button").map((b) => b.props.accessibilityLabel)).toEqual([
      "Add a passkey",
    ]);
  });

  describe("on a device that cannot run the ceremony", () => {
    it("(a69adf8d/a69adf8e) 'Add a passkey' hands off to the real web Settings page, signed in", async () => {
      const { getByTestId } = render(<PasskeySection supported={false} token="jwt" />);
      const addRow = getByTestId("passkey-add-button");
      expect(addRow.props.accessibilityRole).toBe("link");
      expect(addRow.props.accessibilityLabel).toBe("Add a passkey");
      expect(addRow.props.accessibilityState?.disabled).toBe(false);

      fireEvent.press(addRow);

      await waitFor(() => {
        expect(mockOpenWebSignedIn).toHaveBeenCalledWith(PASSKEY_SETTINGS_PATH);
      });
      expect(PASSKEY_SETTINGS_PATH).toBe("/dashboard/settings");
    });
  });

  describe("on a device that can run the ceremony (NP-161)", () => {
    it("with a token, the button is ENABLED", () => {
      const { getByTestId } = render(
        <PasskeySection supported token="jwt" deps={fakeDeps()} />,
      );
      expect(getByTestId("passkey-add-button").props.accessibilityState?.disabled).toBe(false);
    });

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

    it("shows the web's busy text while the ceremony runs, then confirms success inline", async () => {
      let finish: (v: unknown) => void = () => {};
      const deps = fakeDeps({
        create: jest.fn(
          () =>
            new Promise((resolve) => {
              finish = resolve;
            }),
        ),
      });
      const { getByTestId, findByText } = render(
        <PasskeySection supported token="jwt" deps={deps} />,
      );
      fireEvent.press(getByTestId("passkey-add-button"));
      expect(await findByText("Follow your device prompt…")).toBeTruthy();
      finish({ id: "c", rawId: "c", response: { clientDataJSON: "c", attestationObject: "a" } });
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

    it("without a signed-in session it is disabled and does nothing", () => {
      const deps = fakeDeps();
      const { getByTestId } = render(<PasskeySection supported token={null} deps={deps} />);
      expect(getByTestId("passkey-add-button").props.accessibilityState?.disabled).toBe(true);
      fireEvent.press(getByTestId("passkey-add-button"));
      expect(deps.fetchJson).not.toHaveBeenCalled();
    });
  });
});
