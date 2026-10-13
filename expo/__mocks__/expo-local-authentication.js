// `expo-local-authentication` is a native module: under Jest there is no
// secure enclave and no OS dialog. A Node-module mock in `<rootDir>/__mocks__`
// is applied automatically, the same arrangement as `expo-camera.js` beside it.
//
// The default answers are the no-hardware ones, because the code under test is
// the graceful-degradation path, not the dialog. Tests that need hardware
// override the resolved values per case (NP-187).
const NO_HARDWARE = false;
const NOT_ENROLLED = false;

const hasHardwareAsync = jest.fn(async () => NO_HARDWARE);
const isEnrolledAsync = jest.fn(async () => NOT_ENROLLED);
const supportedAuthenticationTypesAsync = jest.fn(async () => []);
const getEnrolledLevelAsync = jest.fn(async () => 0);
const authenticateAsync = jest.fn(async () => ({
  success: false,
  error: "not_available",
}));
const cancelAuthenticate = jest.fn(async () => undefined);

module.exports = {
  __esModule: true,
  hasHardwareAsync,
  isEnrolledAsync,
  supportedAuthenticationTypesAsync,
  getEnrolledLevelAsync,
  authenticateAsync,
  cancelAuthenticate,
  AuthenticationType: {
    FINGERPRINT: 1,
    FACIAL_RECOGNITION: 2,
    IRIS: 3,
  },
  SecurityLevel: {
    NONE: 0,
    SECRET: 1,
    BIOMETRIC: 2,
    BIOMETRIC_WEAK: 2,
    BIOMETRIC_STRONG: 3,
  },
};
