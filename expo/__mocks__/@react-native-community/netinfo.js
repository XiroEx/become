/**
 * NetInfo under Jest.
 *
 * A node_modules mock in `__mocks__/` next to `node_modules` is applied
 * AUTOMATICALLY — no `jest.mock()` call — which is what the launch canary
 * (`__tests__/root-layout-smoke.test.tsx`) needs: it renders the real
 * `app/_layout.tsx`, and the real NetInfo would reach for a native module the
 * test renderer does not have.
 *
 * It is the package's own mock (`jest/netinfo-mock.js`): fetch() resolves a
 * connected state and addEventListener() never fires. Tests that need the
 * connection to CHANGE do not go through this — they pass their own
 * `ConnectivitySource` into the component or the queue, which is why both take
 * one.
 */
module.exports = require("@react-native-community/netinfo/jest/netinfo-mock.js");
