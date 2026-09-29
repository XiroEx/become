/* eslint-disable import/first */
import { render, waitFor } from "@testing-library/react-native";

// The settings screen renders the danger zone, which reaches for the session
// store on confirm. Swap it for an in-memory equivalent so jest never touches
// expo-secure-store.
jest.mock("@/lib/auth/secureStoreToken", () => {
  const actual = jest.requireActual("@/lib/auth/secureStoreToken");
  let value: string | null = null;
  return {
    ...actual,
    sessionStore: {
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

import HealthSettingsRoute from "../app/(app)/(tabs)/profile/health";
import { AuthProvider } from "@/lib/auth/AuthProvider";
import { HealthSyncSection } from "@/components/settings/HealthSyncSection";
import { HEALTH_SYNC_ENABLED } from "@/lib/health/enabled";
import { createMemoryHealthOptInStore } from "@/lib/health/opt-in";

/**
 * The Health sync section is OFF until NP-185 installs a real HealthKit /
 * Health Connect module. Until then the toggle synced nothing — and, before
 * this ticket, signed the member out by writing its flag over the session key.
 */
/** The screen reads the session from the one provider, so mount it. */
function renderRoute() {
  return render(
    <AuthProvider>
      <HealthSettingsRoute />
    </AuthProvider>,
  );
}

describe("HealthSettingsRoute", () => {
  it("mounts", async () => {
    const { getByTestId } = renderRoute();
    expect(getByTestId("health-settings-route")).toBeTruthy();
    await waitFor(() => {
      expect(getByTestId("danger-zone")).toBeTruthy();
    });
  });

  it("does not show the Health sync section or its toggle (NP-185)", async () => {
    const { queryByTestId, queryByText } = renderRoute();
    await waitFor(() => {
      expect(queryByTestId("danger-zone")).toBeTruthy();
    });
    expect(queryByTestId("health-sync-section")).toBeNull();
    expect(queryByTestId("health-toggle-row")).toBeNull();
    expect(queryByTestId("health-toggle")).toBeNull();
    expect(queryByText("Health sync")).toBeNull();
    expect(queryByText("Sync from Health")).toBeNull();
  });
});

describe("HealthSyncSection", () => {
  it("is gated off", () => {
    expect(HEALTH_SYNC_ENABLED).toBe(false);
  });

  it("renders nothing while the gate is off, even with a store injected", () => {
    const { queryByTestId } = render(
      <HealthSyncSection store={createMemoryHealthOptInStore(true)} />,
    );
    expect(queryByTestId("health-sync-section")).toBeNull();
    expect(queryByTestId("health-toggle")).toBeNull();
  });
});
