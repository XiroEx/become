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
  useSharedValue: (init) => ({ value: init }),
  useAnimatedStyle: (fn) => fn(),
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
