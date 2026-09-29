/**
 * AsyncStorage under Jest — the package's own in-memory mock, applied
 * automatically because this file sits in `__mocks__/` next to `node_modules`.
 *
 * The offline write queue persists its snapshot here (`lib/offline/storage.ts`),
 * and the root layout starts that queue, so without this the launch canary
 * would reach for a native module the test renderer does not have. Tests that
 * care about what was written pass their own `AsyncStorageLike`
 * (`createMemoryAsyncStorage`) instead of reading this.
 */
module.exports = require("@react-native-async-storage/async-storage/jest/async-storage-mock.js");
