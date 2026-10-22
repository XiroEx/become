/**
 * DEVICE DIAGNOSTICS — the Settings block that says WHY on the phone.
 *
 * Checkout, Live Activities and the locked-phone rest alert fail silently by
 * design, and a TestFlight console cannot be read. Each records its last
 * reason where it fails; this suite holds the store round-trips, the
 * recording at each failure site, and the rows the Diagnostics block renders.
 */
import * as fs from "fs";
import * as path from "path";
import { render, waitFor } from "@testing-library/react-native";
import { createMemoryAsyncStorage } from "@/lib/query/persistor";
import {
  DIAG_CHECKOUT_KEY,
  DIAG_LIVE_ACTIVITY_KEY,
  DIAG_REST_ALERT_KEY,
  readCheckoutFailure,
  readLiveActivityFailure,
  readRestAlertResult,
  recordCheckoutFailure,
  recordLiveActivityFailure,
  recordRestAlertResult,
  truncateReason,
} from "@/lib/diagnostics/deviceDiagnostics";
import {
  createRestAlertHandle,
  scheduleRestAlert,
  type RestAlertDeps,
} from "@/lib/live/restAlert";
import {
  createWorkoutLiveActivityHandle,
  startWorkoutLiveActivity,
  type WorkoutLiveActivityProps,
} from "@/lib/live/liveActivity/workoutLiveActivity";
import { DiagnosticsSection } from "@/components/settings/DiagnosticsSection";

const REPO_ROOT = path.resolve(__dirname, "../..");
const read = (rel: string): string => {
  const file = path.join(REPO_ROOT, rel);
  expect(fs.existsSync(file)).toBe(true);
  return fs.readFileSync(file, "utf8");
};

const EXERCISE_PROPS: WorkoutLiveActivityProps = {
  workoutTitle: "Upper Body",
  exerciseName: "Bench Press",
  setLabel: "Set 1 of 4",
  phase: "exercise",
  restEndsAtMs: null,
  restTotalSec: null,
};

function grantedRestDeps(
  overrides: Partial<RestAlertDeps> = {},
): { deps: RestAlertDeps; schedule: jest.Mock } {
  const schedule = jest.fn(async (_endsAtMs: number) => "notif-1");
  return {
    deps: {
      isGranted: async () => true,
      schedule,
      cancel: jest.fn(async (_id: string) => undefined),
      ...overrides,
    },
    schedule,
  };
}

describe("diagnostics store", () => {
  it("round-trips each row with its time, and reads null when empty", async () => {
    const storage = createMemoryAsyncStorage();
    await expect(readLiveActivityFailure(storage)).resolves.toBeNull();
    await expect(readRestAlertResult(storage)).resolves.toBeNull();
    await expect(readCheckoutFailure(storage)).resolves.toBeNull();

    await recordLiveActivityFailure("factory-null", 1727600000000, storage);
    await recordRestAlertResult(false, "no-permission", 1727600001000, storage);
    await recordCheckoutFailure("http-502-checkout_failed", 1727600002000, storage);

    await expect(readLiveActivityFailure(storage)).resolves.toEqual({
      reason: "factory-null",
      at: 1727600000000,
    });
    await expect(readRestAlertResult(storage)).resolves.toEqual({
      ok: false,
      reason: "no-permission",
      at: 1727600001000,
    });
    await expect(readCheckoutFailure(storage)).resolves.toEqual({
      reason: "http-502-checkout_failed",
      at: 1727600002000,
    });
  });

  it("a clean Live Activity start clears the row", async () => {
    const storage = createMemoryAsyncStorage();
    await recordLiveActivityFailure("start-threw", 1727600000000, storage);
    await recordLiveActivityFailure(null, 1727600001000, storage);
    await expect(readLiveActivityFailure(storage)).resolves.toBeNull();
  });

  it("caps a chatty reason instead of growing the row", () => {
    expect(truncateReason("open-failed: " + "x".repeat(500))).toHaveLength(160);
    expect(truncateReason("network")).toBe("network");
  });

  it("uses one key per row, and nothing outside AsyncStorage", () => {
    expect(DIAG_LIVE_ACTIVITY_KEY).toBe("become.diag.liveActivity");
    expect(DIAG_REST_ALERT_KEY).toBe("become.diag.restAlert");
    expect(DIAG_CHECKOUT_KEY).toBe("become.diag.checkout");
    const src = read("expo/lib/diagnostics/deviceDiagnostics.ts");
    expect(src).not.toMatch(/SecureStore/);
    expect(src).not.toMatch(/expo-clipboard/);
    expect(src).not.toMatch(/Clipboard/);
  });
});

describe("recording at the failure sites", () => {
  it("a Live Activity that cannot start persists factory-null", async () => {
    const storage = createMemoryAsyncStorage();
    const handle = createWorkoutLiveActivityHandle();
    startWorkoutLiveActivity(handle, EXERCISE_PROPS, null, storage);
    expect(handle.lastFailure).toBe("factory-null");
    await expect(readLiveActivityFailure(storage)).resolves.toMatchObject({
      reason: "factory-null",
    });
  });

  it("a clean Live Activity start clears a stale persisted failure", async () => {
    const storage = createMemoryAsyncStorage();
    await recordLiveActivityFailure("start-threw", 1727600000000, storage);
    const handle = createWorkoutLiveActivityHandle();
    startWorkoutLiveActivity(
      handle,
      EXERCISE_PROPS,
      {
        start: () => ({
          update: async () => undefined,
          end: async () => undefined,
        }),
      },
      storage,
    );
    expect(handle.lastFailure ?? null).toBeNull();
    await expect(readLiveActivityFailure(storage)).resolves.toBeNull();
  });

  it("a scheduled rest alert records its success", async () => {
    const storage = createMemoryAsyncStorage();
    const { deps } = grantedRestDeps({ diagnosticsStorage: storage });
    const id = await scheduleRestAlert(
      createRestAlertHandle(),
      Date.now() + 90_000,
      deps,
    );
    expect(id).toBe("notif-1");
    await expect(readRestAlertResult(storage)).resolves.toMatchObject({
      ok: true,
      reason: "scheduled",
    });
  });

  it("a rest without permission records no-permission (in-app timer only)", async () => {
    const storage = createMemoryAsyncStorage();
    const scheduled = jest.fn(async () => "notif-1");
    const { deps } = grantedRestDeps({
      isGranted: async () => false,
      schedule: scheduled,
      diagnosticsStorage: storage,
    });
    const id = await scheduleRestAlert(
      createRestAlertHandle(),
      Date.now() + 90_000,
      deps,
    );
    expect(id).toBeNull();
    expect(scheduled).not.toHaveBeenCalled();
    await expect(readRestAlertResult(storage)).resolves.toMatchObject({
      ok: false,
      reason: "no-permission",
    });
  });

  it("a throwing rest schedule records the message and still resolves null", async () => {
    const storage = createMemoryAsyncStorage();
    const { deps } = grantedRestDeps({
      schedule: jest.fn(async () => {
        throw new Error("no native module");
      }),
      diagnosticsStorage: storage,
    });
    const id = await scheduleRestAlert(
      createRestAlertHandle(),
      Date.now() + 90_000,
      deps,
    );
    expect(id).toBeNull();
    await expect(readRestAlertResult(storage)).resolves.toMatchObject({
      ok: false,
      reason: "no native module",
    });
  });
});

describe("the Diagnostics block", () => {
  it("lists every row, muted and small, from live reads", async () => {
    const storage = createMemoryAsyncStorage();
    await recordLiveActivityFailure("start-threw", 1727600000000, storage);
    await recordRestAlertResult(false, "no-permission", 1727600001000, storage);
    await recordCheckoutFailure("network", 1727600002000, storage);

    const screen = render(
      <DiagnosticsSection
        deps={{
          getNotificationPermission: async () => "granted",
          isLiveActivitiesEnabled: async () => "unknown",
          storage,
        }}
      />,
    );

    await waitFor(() =>
      expect(screen.getByTestId("diagnostics-section")).toBeTruthy(),
    );
    expect(screen.getByTestId("diagnostics-notifications")).toHaveTextContent(
      "Notifications: granted",
    );
    expect(screen.getByTestId("diagnostics-live-activities")).toHaveTextContent(
      "Live Activities: unknown",
    );
    expect(
      screen.getByTestId("diagnostics-live-activity-failure"),
    ).toHaveTextContent(/Live Activity last failure: start-threw/);
    expect(screen.getByTestId("diagnostics-rest-alert")).toHaveTextContent(
      /Rest alert last schedule: no-permission/,
    );
    expect(screen.getByTestId("diagnostics-checkout")).toHaveTextContent(
      /Checkout last failure: network/,
    );
    screen.unmount();
  });

  it("reads none everywhere when nothing has failed yet", async () => {
    const storage = createMemoryAsyncStorage();
    const screen = render(
      <DiagnosticsSection
        deps={{
          getNotificationPermission: async () => "undetermined",
          isLiveActivitiesEnabled: async () => "unknown",
          storage,
        }}
      />,
    );

    await waitFor(() =>
      expect(
        screen.getByTestId("diagnostics-live-activity-failure"),
      ).toHaveTextContent("Live Activity last failure: none"),
    );
    expect(screen.getByTestId("diagnostics-rest-alert")).toHaveTextContent(
      "Rest alert last schedule: none",
    );
    expect(screen.getByTestId("diagnostics-checkout")).toHaveTextContent(
      "Checkout last failure: none",
    );
    screen.unmount();
  });

  it("mounts at the bottom of Settings, next to the app version, with no clipboard import", () => {
    const settings = read("expo/app/(app)/settings.tsx");
    expect(settings).toMatch(
      /import \{ DiagnosticsSection \} from ["']@\/components\/settings\/DiagnosticsSection["']/,
    );
    expect(settings).toMatch(/<DiagnosticsSection \/>/);
    // Below the version, not above the account: this is the last block.
    expect(settings.indexOf("<DiagnosticsSection />")).toBeGreaterThan(
      settings.indexOf('testID="app-version"'),
    );
    const section = read("expo/components/settings/DiagnosticsSection.tsx");
    expect(section).not.toMatch(/expo-clipboard/);
    expect(section).not.toMatch(/Clipboard/);
  });

  it("threads the machine reason from billing to all three callers", () => {
    // startCheckout and the browser handover carry it…
    const billing = read("expo/lib/entitlements/billing.ts");
    expect(billing).toMatch(/reason\?: string/);
    expect(billing).toMatch(/open-failed:/);
    expect(billing).not.toMatch(/from\s+["']expo-web-browser["']/);
    expect(billing).not.toMatch(/WebBrowser\./);
    // …UpgradeSheet renders it under the friendly sentence…
    const sheet = read("expo/components/entitlements/UpgradeSheet.tsx");
    expect(sheet).toContain("checkout-error-reason");
    expect(sheet).toMatch(/Reason: \$/);
    // …and all three callers thread it through.
    for (const rel of [
      "expo/components/entitlements/UpgradeSheet.tsx",
      "expo/app/(app)/plan.tsx",
      "expo/components/onboarding/TrialOfferModal.tsx",
    ]) {
      const src = read(rel);
      expect(src).toMatch(/reason=\{checkoutReason\}/);
      expect(src).not.toMatch(/from\s+["']expo-web-browser["']/);
      expect(src).not.toMatch(/WebBrowser\./);
    }
  });
});
