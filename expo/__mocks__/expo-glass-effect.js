// `expo-glass-effect` is Apple's Liquid Glass (`UIGlassEffect` inside a
// `UIVisualEffectView`), so both of its pieces need a native module jest does
// not have: `GlassView` is a native view, and `isLiquidGlassAvailable()` reads
// `requireNativeModule("ExpoGlassEffect")` and throws without one.
//
// It answers FALSE here on purpose: a test that renders the tab bar then
// exercises the fallback path every device below iOS 26 takes (expo-blur's
// `systemChromeMaterial`), which is the path most members are on. The NP-351
// acceptance test overrides this module to prove the iOS 26 branch as well.
const React = require("react");
const { View } = require("react-native");

class MockGlassView extends React.Component {
  render() {
    const { children, ...props } = this.props;
    return React.createElement(View, props, children);
  }
}

module.exports = {
  __esModule: true,
  GlassView: MockGlassView,
  GlassContainer: MockGlassView,
  isLiquidGlassAvailable: jest.fn(() => false),
  isGlassEffectAPIAvailable: jest.fn(() => false),
};
