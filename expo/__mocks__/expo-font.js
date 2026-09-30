// Fonts are already in, everywhere except the test that is ABOUT loading them.
//
// `app/_layout.tsx` renders nothing until `useGeistFonts()` reports ready
// (NP-160), and on a device that is a promise: `expo-font` registers the eight
// Geist faces asynchronously. Every suite that renders the root layout would
// otherwise have to await a state change that has nothing to do with what it is
// testing, so the default here is "loaded".
//
// A Node-module mock in `__mocks__/` next to `node_modules` is applied
// automatically, with no `jest.mock()` call. `__tests__/geistFont.test.tsx`
// overrides it with its own `jest.mock("expo-font", …)` to drive the gate
// through both states.
module.exports = {
  __esModule: true,
  useFonts: jest.fn(() => [true, null]),
  loadAsync: jest.fn(async () => {}),
  isLoaded: jest.fn(() => true),
  isLoading: jest.fn(() => false),
  unloadAsync: jest.fn(async () => {}),
  FontDisplay: {
    AUTO: "auto",
    SWAP: "swap",
    BLOCK: "block",
    FALLBACK: "fallback",
    OPTIONAL: "optional",
  },
};
