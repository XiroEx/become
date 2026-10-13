// `expo-system-ui` talks to the native window, which does not exist under Jest.
// The root layout repaints the window background from the theme on every scheme
// change (NP-123), so every suite that renders a layout reaches this.
//
// A Node module mock in `<rootDir>/__mocks__` is used automatically — the same
// arrangement as `expo-font.js` and `expo-splash-screen.js` beside it.
const calls = [];

module.exports = {
  __esModule: true,
  /** Records instead of painting, so a test can assert the colour. */
  setBackgroundColorAsync: jest.fn(async (color) => {
    calls.push(color);
  }),
  getBackgroundColorAsync: jest.fn(async () => calls[calls.length - 1] ?? null),
  /** Test-only: every colour the app has asked the window to be, in order. */
  __backgroundColors: calls,
};
