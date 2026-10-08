// @shopify/react-native-skia draws through a native canvas (CanvasKit's wasm
// on the web) that jest does not have. The package ships a `Mock`, but it has
// to be handed a CanvasKit instance to build its `Skia` object, which would
// mean loading Skia's web build into every suite that touches The Becoming.
//
// This mock is only what the stage touches (NP-204): every drawing component
// is a View that keeps its props — so a test can count the markers or read a
// tick's text out of the tree — `Skia.Path.Make()` records the commands it is
// given and plays them back as an SVG string, and the font hooks answer
// "nothing loaded", which is a state the stage already has to render.
const React = require("react");
const { View } = require("react-native");

function drawing(name) {
  const Component = (props) =>
    React.createElement(
      View,
      { ...props, testID: props.testID ?? `skia-${name}` },
      props.children,
    );
  Component.displayName = `Skia${name}`;
  return Component;
}

function makePath() {
  const cmds = [];
  const path = {
    moveTo: (x, y) => {
      cmds.push(`M ${x} ${y}`);
      return path;
    },
    lineTo: (x, y) => {
      cmds.push(`L ${x} ${y}`);
      return path;
    },
    close: () => {
      cmds.push("Z");
      return path;
    },
    toSVGString: () => cmds.join(" "),
    getBounds: () => ({ x: 0, y: 0, width: 0, height: 0 }),
  };
  return path;
}

module.exports = {
  __esModule: true,
  Canvas: drawing("Canvas"),
  Group: drawing("Group"),
  Path: drawing("Path"),
  Circle: drawing("Circle"),
  Line: drawing("Line"),
  Rect: drawing("Rect"),
  Points: drawing("Points"),
  Text: drawing("Text"),
  LinearGradient: drawing("LinearGradient"),
  RadialGradient: drawing("RadialGradient"),
  DashPathEffect: drawing("DashPathEffect"),
  vec: (x = 0, y = 0) => ({ x, y }),
  Skia: {
    Path: { Make: makePath, MakeFromSVGString: () => makePath() },
    Color: (c) => c,
    Point: (x, y) => ({ x, y }),
  },
  useFont: () => null,
  matchFont: () => null,
  PaintStyle: { Fill: 0, Stroke: 1 },
  StrokeCap: { Butt: 0, Round: 1, Square: 2 },
  StrokeJoin: { Miter: 0, Round: 1, Bevel: 2 },
};
