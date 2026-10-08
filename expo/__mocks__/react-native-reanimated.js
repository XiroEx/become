const React = require("react");
const { View, Text, ScrollView } = require("react-native");

const chain = () => {
  const obj = {
    duration: () => obj,
    delay: () => obj,
    springify: () => obj,
    damping: () => obj,
    stiffness: () => obj,
    withCallback: () => obj,
    easing: () => obj,
    build: () => ({}),
  };
  return obj;
};

const Animated = {
  View,
  Text,
  ScrollView,
  createAnimatedComponent: (c) => c,
};

module.exports = {
  __esModule: true,
  default: Animated,
  ...Animated,
  FadeIn: chain(),
  FadeInDown: chain(),
  FadeInUp: chain(),
  FadeInLeft: chain(),
  FadeInRight: chain(),
  FadeOut: chain(),
  FadeOutDown: chain(),
  FadeOutUp: chain(),
  FadeOutLeft: chain(),
  FadeOutRight: chain(),
  SlideInDown: chain(),
  SlideInUp: chain(),
  SlideInLeft: chain(),
  SlideInRight: chain(),
  SlideOutDown: chain(),
  SlideOutUp: chain(),
  LinearTransition: chain(),
  Layout: chain(),
  // One mutable box per hook call, kept across renders — what Reanimated does.
  // A fresh `{ value }` per render would leave a gesture callback created on
  // the first render reading a box no later effect ever writes to.
  useSharedValue: (init) => React.useRef({ value: init }).current,
  useAnimatedStyle: (fn) => fn(),
  // The Becoming stage (NP-204) drives a camera through derived values and
  // Gesture Handler's `GestureDetector`, which probes Reanimated for
  // `useEvent` / `useHandler` and calls them during render. None of these
  // animate in jest: a derived value is its function's answer, an event hook
  // is its handler, a reaction never fires, and a cancel has nothing to stop.
  useDerivedValue: (fn) => ({ value: fn() }),
  useAnimatedProps: (fn) => fn(),
  useAnimatedReaction: () => {},
  // Reanimated's `useEvent` hands the handler the NATIVE event; RNTL's
  // `fireEvent` (which Gesture Handler's `fireGestureHandler` dispatches
  // through) hands it the wrapped `{ nativeEvent }`. Unwrap, so a test-driven
  // pan reaches the gesture's callbacks with its `handlerTag` and `state`.
  useEvent: (handler) => (event) =>
    handler(event && typeof event === "object" && "nativeEvent" in event ? event.nativeEvent : event),
  useHandler: () => ({ context: {}, doDependenciesDiffer: false, useWeb: false }),
  useAnimatedRef: () => ({ current: null }),
  cancelAnimation: () => {},
  makeMutable: (init) => ({ value: init }),
  runOnUI: (fn) => fn,
  setGestureState: () => {},
  Easing: {
    linear: (t) => t,
    ease: (t) => t,
    quad: (t) => t,
    cubic: (t) => t,
    sin: (t) => t,
    exp: (t) => t,
    bezier: () => (t) => t,
    in: (fn) => fn,
    out: (fn) => fn,
    inOut: (fn) => fn,
  },
  Extrapolation: { CLAMP: "clamp", EXTEND: "extend", IDENTITY: "identity" },
  withTiming: (toValue, _, callback) => {
    callback?.(true);
    return toValue;
  },
  withSpring: (toValue, _, callback) => {
    callback?.(true);
    return toValue;
  },
  withDelay: (_, val) => val,
  withSequence: (...vals) => vals[vals.length - 1],
  runOnJS: (fn) => fn,
  interpolate: (val, input, output) => output[0],
};
