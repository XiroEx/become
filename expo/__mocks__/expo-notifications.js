// `expo-notifications` has no native module under Jest. The push card reads
// its own permission state when no `readState` is injected, so every suite
// that renders it (directly or through DashboardScreen) would call into the
// native module. Default to undetermined; suites that care inject `deps`.
// `setBadgeCountAsync` is the app-icon badge (NP-067): a recording stub so
// badge suites can assert what the icon was asked to draw.
module.exports = {
  __esModule: true,
  getPermissionsAsync: jest.fn(async () => ({
    granted: false,
    canAskAgain: true,
    status: "undetermined",
  })),
  requestPermissionsAsync: jest.fn(async () => ({
    granted: false,
    canAskAgain: true,
    status: "undetermined",
  })),
  getDevicePushTokenAsync: jest.fn(async () => {
    throw new Error("expo-notifications is unavailable in Jest");
  }),
  setNotificationChannelAsync: jest.fn(async () => null),
  // The locked-phone rest alert (NP-082) schedules a LOCAL notification and
  // cancels it on skip. Recording stubs, so the rest-alert suite can assert
  // what the OS was asked for — in particular that it asks for SOUND, which
  // iOS does not play unless the content says so.
  scheduleNotificationAsync: jest.fn(async () => "scheduled-notification-id"),
  cancelScheduledNotificationAsync: jest.fn(async () => undefined),
  SchedulableTriggerInputTypes: {
    TIME_INTERVAL: "timeInterval",
    DATE: "date",
    DAILY: "daily",
    WEEKLY: "weekly",
    YEARLY: "yearly",
    CALENDAR: "calendar",
    MONTHLY: "monthly",
  },
  setBadgeCountAsync: jest.fn(async () => undefined),
  getBadgeCountAsync: jest.fn(async () => 0),
};
