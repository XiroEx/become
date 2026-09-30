// `expo-camera` is a native module: under Jest there is no camera and no
// permission dialog. A Node-module mock in `<rootDir>/__mocks__` is applied
// automatically, the same arrangement as `expo-font.js` beside it.
//
// The default answer is GRANTED, because the code under test is the capture
// flow, not the dialog. `__tests__/mediaCapture.test.ts` overrides the resolved
// value per case to drive a refusal (NP-059).
const GRANTED = {
  status: "granted",
  granted: true,
  canAskAgain: true,
  expires: "never",
};

const requestCameraPermissionsAsync = jest.fn(async () => GRANTED);
const getCameraPermissionsAsync = jest.fn(async () => GRANTED);
const requestMicrophonePermissionsAsync = jest.fn(async () => GRANTED);
const getMicrophonePermissionsAsync = jest.fn(async () => GRANTED);

module.exports = {
  __esModule: true,
  Camera: {
    requestCameraPermissionsAsync,
    getCameraPermissionsAsync,
    requestMicrophonePermissionsAsync,
    getMicrophonePermissionsAsync,
    scanFromURLAsync: jest.fn(async () => []),
  },
  requestCameraPermissionsAsync,
  getCameraPermissionsAsync,
  useCameraPermissions: jest.fn(() => [GRANTED, requestCameraPermissionsAsync]),
  CameraView: () => null,
  PermissionStatus: {
    GRANTED: "granted",
    UNDETERMINED: "undetermined",
    DENIED: "denied",
  },
  __GRANTED: GRANTED,
};
