/* eslint-disable import/first */
import { fireEvent, render, waitFor } from "@testing-library/react-native";

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
import { isHealthSyncEnabled } from "@/lib/health/enabled";
import { createMemoryHealthOptInStore } from "@/lib/health/opt-in";
import {
  createMemoryHealthSwitchStore,
  type HealthSwitchStore,
} from "@/lib/health/switches";

/**
 * The Health sync section is per-platform now: Health Connect is wired
 * (NP-199), HealthKit is not (NP-185). jest runs on the `ios` platform, so the
 * route below renders the iOS answer — nothing — and the section's own tests ask
 * for a platform explicitly rather than mocking `Platform`.
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

  it("shows no Health sync section on iOS, where no module is installed (NP-185)", async () => {
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

describe("HealthSyncSection — the gate", () => {
  it("is off for iOS and on for Android", () => {
    expect(isHealthSyncEnabled("ios")).toBe(false);
    expect(isHealthSyncEnabled("android")).toBe(true);
  });

  it("renders nothing on iOS, even with stores injected", () => {
    const { queryByTestId } = render(
      <HealthSyncSection
        platform="ios"
        store={createMemoryHealthOptInStore(true)}
        switches={createMemoryHealthSwitchStore({ read: true, write: true })}
      />,
    );
    expect(queryByTestId("health-sync-section")).toBeNull();
    expect(queryByTestId("health-toggle")).toBeNull();
  });
});

describe("HealthSyncSection on Android", () => {
  function renderSection(
    options: {
      optedIn?: boolean;
      switches?: HealthSwitchStore;
    } = {},
  ) {
    const switches =
      options.switches ?? createMemoryHealthSwitchStore({ read: false, write: false });
    const utils = render(
      <HealthSyncSection
        platform="android"
        store={createMemoryHealthOptInStore(options.optedIn ?? false)}
        switches={switches}
      />,
    );
    return { ...utils, switches };
  }

  it("shows the umbrella toggle, and names Health Connect", async () => {
    const { getByTestId, getByText } = renderSection();
    await waitFor(() => {
      expect(getByTestId("health-sync-section")).toBeTruthy();
    });
    expect(getByTestId("health-toggle")).toBeTruthy();
    expect(getByText(/Health Connect/)).toBeTruthy();
  });

  it("hides the direction switches until the member opts in", async () => {
    const { queryByTestId, getByTestId } = renderSection();
    await waitFor(() => {
      expect(getByTestId("health-toggle")).toBeTruthy();
    });
    expect(queryByTestId("health-read-toggle")).toBeNull();
    expect(queryByTestId("health-write-toggle")).toBeNull();

    fireEvent.press(getByTestId("health-toggle"));
    await waitFor(() => {
      expect(getByTestId("health-read-toggle")).toBeTruthy();
    });
    expect(getByTestId("health-write-toggle")).toBeTruthy();
  });

  it("hydrates each direction from its own store", async () => {
    const { getByTestId } = renderSection({
      optedIn: true,
      switches: createMemoryHealthSwitchStore({ read: true, write: false }),
    });
    await waitFor(() => {
      expect(getByTestId("health-read-toggle")).toBeTruthy();
    });
    expect(getByTestId("health-read-toggle").props.accessibilityState?.checked).toBe(
      true,
    );
    expect(getByTestId("health-write-toggle").props.accessibilityState?.checked).toBe(
      false,
    );
  });

  it.each(["read", "write"] as const)(
    "turning %s off writes through immediately",
    async (direction) => {
      const switches = createMemoryHealthSwitchStore({ read: true, write: true });
      const { getByTestId } = renderSection({ optedIn: true, switches });
      await waitFor(() => {
        expect(getByTestId(`health-${direction}-toggle`)).toBeTruthy();
      });

      fireEvent.press(getByTestId(`health-${direction}-toggle`));
      await waitFor(async () => {
        expect(await switches.get(direction)).toBe(false);
      });
      // The other direction is untouched — they are separate answers.
      const other = direction === "read" ? "write" : "read";
      expect(await switches.get(other)).toBe(true);
    },
  );

  it("tells the member when a change takes effect", async () => {
    const { getByTestId, getByText } = renderSection({ optedIn: true });
    await waitFor(() => {
      expect(getByTestId("health-next-launch-note")).toBeTruthy();
    });
    expect(getByText(/next time you open Become/i)).toBeTruthy();
  });
});
