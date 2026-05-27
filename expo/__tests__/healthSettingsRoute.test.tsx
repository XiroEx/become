/* eslint-disable import/first */
import { fireEvent, render, waitFor } from "@testing-library/react-native";

// Force the opt-in store to use an in-memory inner so the route doesn't touch
// expo-secure-store at jest time. We mock the module by replacing
// secureTokenStore with an in-memory equivalent.
jest.mock("@/lib/auth/secureStoreToken", () => {
  const actual = jest.requireActual("@/lib/auth/secureStoreToken");
  let value: string | null = null;
  return {
    ...actual,
    secureTokenStore: {
      async get() {
        return value;
      },
      async set(v: string) {
        value = v;
      },
      async clear() {
        value = null;
      },
    },
  };
});

import HealthSettingsRoute from "../app/(tabs)/profile/health";

describe("HealthSettingsRoute", () => {
  it("mounts and renders the toggle row", async () => {
    const { getByTestId } = render(<HealthSettingsRoute />);
    expect(getByTestId("health-settings-route")).toBeTruthy();
    await waitFor(() => {
      expect(getByTestId("health-toggle")).toBeTruthy();
    });
  });

  it("toggle flips between off and on when pressed", async () => {
    const { getByTestId } = render(<HealthSettingsRoute />);
    const toggle = await waitFor(() => getByTestId("health-toggle"));
    expect(toggle.props.accessibilityState?.checked).toBe(false);
    fireEvent.press(toggle);
    await waitFor(() => {
      expect(getByTestId("health-toggle").props.accessibilityState?.checked).toBe(
        true,
      );
    });
  });
});
