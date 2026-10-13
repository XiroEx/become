// `expo-image-picker` is a native module: under Jest there is no system camera
// UI and no photo library. Applied automatically as a Node-module mock (see
// `expo-font.js`).
//
// The defaults are "permission granted" and "the member cancelled", which is
// the safe pair: a test that forgets to arrange an asset gets `cancelled`, not
// a half-built image. `__tests__/mediaCapture.test.ts` sets both per case.
const GRANTED = {
  status: "granted",
  granted: true,
  canAskAgain: true,
  expires: "never",
  accessPrivileges: "all",
};

const CANCELLED = { canceled: true, assets: null };

module.exports = {
  __esModule: true,
  requestCameraPermissionsAsync: jest.fn(async () => GRANTED),
  getCameraPermissionsAsync: jest.fn(async () => GRANTED),
  requestMediaLibraryPermissionsAsync: jest.fn(async () => GRANTED),
  getMediaLibraryPermissionsAsync: jest.fn(async () => GRANTED),
  useCameraPermissions: jest.fn(() => [GRANTED, jest.fn()]),
  useMediaLibraryPermissions: jest.fn(() => [GRANTED, jest.fn()]),
  launchCameraAsync: jest.fn(async () => CANCELLED),
  launchImageLibraryAsync: jest.fn(async () => CANCELLED),
  getPendingResultAsync: jest.fn(async () => null),
  MediaTypeOptions: { Images: "Images", Videos: "Videos", All: "All" },
  PermissionStatus: {
    GRANTED: "granted",
    UNDETERMINED: "undetermined",
    DENIED: "denied",
  },
  __GRANTED: GRANTED,
  __CANCELLED: CANCELLED,
};
