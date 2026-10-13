import {
  NOTIFICATION_TOGGLES,
  NOTIFICATION_PREF_DEFAULTS,
  applyNotificationPrefDefaults,
  buildNotifPrefPatch,
  nativeNotifStatusDescription,
  resolveNativeNotifAction,
  resolveNativeNotifStatus,
  visibleNotificationToggles,
} from "../lib/settings/notificationPreferences";
import { shouldShowDeniedRepromptAt } from "../lib/push/reprompt";

describe("notificationPreferences (NP-068 rules)", () => {
  it("carries the web's ten keys in the web's order", () => {
    expect(NOTIFICATION_TOGGLES.map((t) => t.key)).toEqual([
      "dailyGlance",
      "checkInReminder",
      "mindReminder",
      "goalNudge",
      "superStreakAtRisk",
      "streakAtRisk",
      "workoutReminder",
      "mealReminder",
      "reEngagement",
      "chatMessage",
    ]);
  });

  it("defaults every type ON except dailyGlance (e015c821: same keys and defaults as the web)", () => {
    expect(NOTIFICATION_PREF_DEFAULTS.dailyGlance).toBe(false);
    for (const toggle of NOTIFICATION_TOGGLES) {
      if (toggle.key === "dailyGlance") continue;
      expect(NOTIFICATION_PREF_DEFAULTS[toggle.key]).toBe(true);
    }
  });

  it("merges stored switches over defaults so a native change reads back the same on the web", () => {
    // Untouched member: server sends {} → web defaults.
    expect(applyNotificationPrefDefaults({})).toEqual(NOTIFICATION_PREF_DEFAULTS);
    expect(applyNotificationPrefDefaults(undefined)).toEqual(NOTIFICATION_PREF_DEFAULTS);
    // A native flip of one switch survives the merge; the rest keep defaults.
    expect(
      applyNotificationPrefDefaults({ workoutReminder: false, dailyGlance: true }),
    ).toEqual({ ...NOTIFICATION_PREF_DEFAULTS, workoutReminder: false, dailyGlance: true });
  });

  it("hides chatMessage while NP-032 keeps chat out, keeps it behind the flag", () => {
    const visible = visibleNotificationToggles();
    expect(visible.find((t) => t.key === "chatMessage")).toBeUndefined();
    expect(visible).toHaveLength(9);
    const withChat = visibleNotificationToggles({ communityEnabled: true });
    expect(withChat.find((t) => t.key === "chatMessage")).toBeDefined();
    expect(withChat).toHaveLength(10);
  });

  it("builds a flat PATCH body — the shape the server reads per key", () => {
    expect(buildNotifPrefPatch("workoutReminder", false)).toEqual({
      workoutReminder: false,
    });
    expect(buildNotifPrefPatch("emailEngagement" as never, true)).toEqual({
      emailEngagement: true,
    });
  });

  it("resolves the web's status vocabulary from the OS permission", () => {
    expect(
      resolveNativeNotifStatus({
        permission: "granted",
        notificationsEnabled: true,
        deviceRegistered: true,
      }),
    ).toBe("Active");
    expect(
      resolveNativeNotifStatus({
        permission: "granted",
        notificationsEnabled: false,
        deviceRegistered: true,
      }),
    ).toBe("Off");
    expect(
      resolveNativeNotifStatus({
        permission: "denied",
        notificationsEnabled: true,
        deviceRegistered: null,
      }),
    ).toBe("Blocked");
    expect(
      resolveNativeNotifStatus({
        permission: "granted",
        notificationsEnabled: true,
        deviceRegistered: false,
      }),
    ).toBe("Not reaching this device");
    expect(
      resolveNativeNotifStatus({
        permission: "undetermined",
        notificationsEnabled: true,
        deviceRegistered: null,
      }),
    ).toBe("Not enabled");
  });

  it("picks the web's action per state: Enable, Turn on, Repair, or iOS Settings", () => {
    expect(
      resolveNativeNotifAction({
        permission: "undetermined",
        notificationsEnabled: true,
        deviceRegistered: null,
      }),
    ).toBe("enable");
    expect(
      resolveNativeNotifAction({
        permission: "granted",
        notificationsEnabled: false,
        deviceRegistered: null,
      }),
    ).toBe("turn-on");
    expect(
      resolveNativeNotifAction({
        permission: "granted",
        notificationsEnabled: true,
        deviceRegistered: false,
      }),
    ).toBe("repair");
    // e015c822: a denied member is shown the way to iOS Settings.
    expect(
      resolveNativeNotifAction({
        permission: "denied",
        notificationsEnabled: true,
        deviceRegistered: null,
      }),
    ).toBe("open-settings");
    expect(
      resolveNativeNotifAction({
        permission: "granted",
        notificationsEnabled: true,
        deviceRegistered: true,
      }),
    ).toBe("none");
  });

  it("describes the denied state with the Settings direction (e015c822)", () => {
    expect(
      nativeNotifStatusDescription({
        permission: "denied",
        notificationsEnabled: true,
        deviceRegistered: null,
      }),
    ).toMatch(/Settings/);
  });

  it("reminds a denied member on the web's cadence: 7 days, then monthly", () => {
    const day = 24 * 60 * 60 * 1000;
    const deniedAt = 1_000_000_000_000;
    // Silent for the first 7 days.
    expect(shouldShowDeniedRepromptAt(deniedAt, null, deniedAt + 6 * day)).toBe(false);
    // Then visible…
    expect(shouldShowDeniedRepromptAt(deniedAt, null, deniedAt + 8 * day)).toBe(true);
    // …monthly after that.
    expect(
      shouldShowDeniedRepromptAt(deniedAt, deniedAt + 8 * day, deniedAt + 20 * day),
    ).toBe(false);
    expect(
      shouldShowDeniedRepromptAt(deniedAt, deniedAt + 8 * day, deniedAt + 40 * day),
    ).toBe(true);
  });
});
