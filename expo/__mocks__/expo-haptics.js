// expo-haptics talks to a native engine jest does not have. Every caller goes
// through `lib/feedback/haptics.ts`, which swallows failures, so the mock only
// has to resolve — and recording the calls lets `mindBreathScene` assert that a
// phase change asks for exactly one light impact.
module.exports = {
  __esModule: true,
  impactAsync: jest.fn(() => Promise.resolve()),
  notificationAsync: jest.fn(() => Promise.resolve()),
  selectionAsync: jest.fn(() => Promise.resolve()),
  performAndroidHapticsAsync: jest.fn(() => Promise.resolve()),
  ImpactFeedbackStyle: {
    Light: "light",
    Medium: "medium",
    Heavy: "heavy",
    Soft: "soft",
    Rigid: "rigid",
  },
  NotificationFeedbackType: {
    Success: "success",
    Warning: "warning",
    Error: "error",
  },
  AndroidHaptics: {
    Clock_Tick: "clockTick",
    Context_Click: "contextClick",
    Keyboard_Press: "keyboardPress",
  },
};
