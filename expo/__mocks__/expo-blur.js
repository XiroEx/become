// `expo-blur` renders a native view (UIVisualEffectView on iOS, a Dimezis
// BlurView on Android): under Jest there is no native view manager, so the real
// component throws on render. The glass tab bar (NP-351) is asserted on its
// PROPS — the tint it asks for per platform, and that Android gets
// `experimentalBlurMethod` — which is what a mock that forwards them supports.
const React = require("react");
const { View } = require("react-native");

class MockBlurView extends React.Component {
  render() {
    const { children, ...props } = this.props;
    return React.createElement(View, props, children);
  }
}

module.exports = {
  __esModule: true,
  BlurView: MockBlurView,
  BlurEffect: MockBlurView,
};
