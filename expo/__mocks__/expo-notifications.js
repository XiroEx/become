// `expo-notifications` has no native module under Jest. The push card reads
// its own permission state when no `readState` is injected, so every suite
// that renders it (directly or through DashboardScreen) would call into the
// native module. Default to undetermined; suites that care inject `deps`.
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
};
