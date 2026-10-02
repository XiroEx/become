// `expo-linear-gradient` renders a native view: under Jest there is no native
// view manager, so the real component throws on render. Tests assert on the
// gradient PROPS (stops, angle) rather than pixels, which is what NP-214 is
// about — every preset must carry its two web-matching stops.
const React = require("react");
const { View } = require("react-native");

class MockLinearGradient extends React.Component {
  render() {
    const { children, ...props } = this.props;
    return React.createElement(View, props, children);
  }
}

module.exports = {
  LinearGradient: MockLinearGradient,
};
