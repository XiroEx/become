// `expo-apple-authentication` is a native module: under Jest there is no
// Apple sheet and no ASAuthorizationAppleIDButton. A Node-module mock in
// `<rootDir>/__mocks__` is applied automatically, the same arrangement as
// `expo-camera.js` beside it.
//
// The default for `isAvailableAsync` is TRUE, because the code under test is
// the sign-in flow rather than the platform check — the tests that care about
// an unavailable device (Android, iOS 12) override it per case.
//
// The button is rendered as a plain View carrying its props, so a test can
// assert Apple's STYLE RULES (which button type, which colour, the corner
// radius, the height) without a native view. The real component forbids
// `backgroundColor`/`borderRadius` in `style` through its types, which is
// checked by the typecheck rather than here.
const React = require("react");
const { View } = require("react-native");

const isAvailableAsync = jest.fn(async () => true);
const signInAsync = jest.fn(async () => ({
  user: "000123.mock-apple-user.0001",
  state: null,
  fullName: { givenName: "Alex", familyName: "Runner", nickname: null },
  email: "alex@example.test",
  realUserStatus: 2,
  identityToken: "mock.identity.token",
  authorizationCode: "mock-authorization-code",
}));

function AppleAuthenticationButton(props) {
  return React.createElement(View, {
    ...props,
    accessibilityRole: "button",
    accessible: true,
  });
}

module.exports = {
  __esModule: true,
  isAvailableAsync,
  signInAsync,
  refreshAsync: jest.fn(),
  signOutAsync: jest.fn(),
  getCredentialStateAsync: jest.fn(),
  addRevokeListener: jest.fn(() => ({ remove: jest.fn() })),
  AppleAuthenticationButton,
  AppleAuthenticationScope: { FULL_NAME: 0, EMAIL: 1 },
  AppleAuthenticationButtonType: { SIGN_IN: 0, CONTINUE: 1, SIGN_UP: 2 },
  AppleAuthenticationButtonStyle: { WHITE: 0, WHITE_OUTLINE: 1, BLACK: 2 },
  AppleAuthenticationCredentialState: {
    REVOKED: 0,
    AUTHORIZED: 1,
    NOT_FOUND: 2,
    TRANSFERRED: 3,
  },
  AppleAuthenticationUserDetectionStatus: {
    UNSUPPORTED: 0,
    UNKNOWN: 1,
    LIKELY_REAL: 2,
  },
};
