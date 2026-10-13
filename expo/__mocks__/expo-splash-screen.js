// The launch screen has no native module under Jest, and `app/_layout.tsx`
// calls `preventAutoHideAsync()` at MODULE LOAD (NP-160) — so every suite that
// imports the layout would be calling into it. These are jest.fn()s on purpose:
// `__tests__/geistFont.test.tsx` asserts that the splash is held before the
// first render and hidden once the fonts are in.
module.exports = {
  __esModule: true,
  preventAutoHideAsync: jest.fn(async () => true),
  hideAsync: jest.fn(async () => true),
  setOptions: jest.fn(),
};
