import { useState } from "react";
import { View as RNView } from "react-native";
import RealAnimated, {
  useAnimatedStyle as realUseAnimatedStyle,
  useSharedValue as realUseSharedValue,
  withRepeat as realWithRepeat,
  withSequence as realWithSequence,
  withTiming as realWithTiming,
} from "react-native-reanimated";

/**
 * THE REANIMATED SHIM — one import point for every animation in the app.
 *
 * `import ... from "@/lib/motion/reanimated"` instead of
 * `react-native-reanimated` directly. On device (and in most jest suites)
 * this re-exports the real module. Where the native module cannot run —
 * expo-router's `renderRouter` testing sandbox, which loads the real module
 * without worklets so `useSharedValue` is not a function
 * (`root-layout-smoke`, `dev-only-routes`, `profilePasskey`) — it falls back
 * to the same synchronous implementation as
 * `__mocks__/react-native-reanimated.js`: values jump to their end state,
 * so the UI under test still renders.
 *
 * Rule-travel note (`__tests__/reducedMotion.test.tsx`): this is the one
 * file that imports `react-native-reanimated` without calling
 * `useReducedMotion` itself — it cannot, at module scope. Every consumer
 * consults the setting before animating, and `motionDuration` is
 * re-exported here so the numbers and the rule travel together.
 */
export { motionDuration } from "@/lib/a11y/reducedMotion";

function usable(): boolean {
  return (
    typeof realUseSharedValue === "function" &&
    typeof realUseAnimatedStyle === "function" &&
    typeof realWithTiming === "function"
  );
}

const USE_REAL = usable();

/** Minimal `SharedValue` box: `.value` is all the motion components read. */
function useFallbackSharedValue<T>(init: T) {
  // `useState`'s lazy initializer runs once per hook instance and never
  // touches a ref during render — what the refs lint asks for. The box
  // identity is stable across renders, like Reanimated's own shared value.
  const [box] = useState(() => {
    const inner: {
      value: T;
      get: () => T;
      set: (next: T | ((prev: T) => T)) => void;
      addListener: () => void;
      removeListener: () => void;
    } = {
      value: init,
      get: () => inner.value,
      set: (next) => {
        inner.value =
          typeof next === "function"
            ? (next as (prev: T) => T)(inner.value)
            : next;
      },
      addListener: () => {},
      removeListener: () => {},
    };
    return inner;
  });
  return box;
}

function fallbackUseAnimatedStyle<T extends object>(fn: () => T): T {
  return fn();
}

function fallbackWithTiming(
  toValue: number,
  _opts?: unknown,
  callback?: (finished: boolean) => void,
): number {
  callback?.(true);
  return toValue;
}

function fallbackWithSequence(...values: number[]): number {
  return values.length > 0 ? (values[values.length - 1] as number) : 0;
}

function fallbackWithRepeat(value: number): number {
  return value;
}

type RealShared = typeof realUseSharedValue;
type RealStyle = typeof realUseAnimatedStyle;
type RealTiming = typeof realWithTiming;
type RealSequence = typeof realWithSequence;
type RealRepeat = typeof realWithRepeat;

export const useSharedValue: RealShared = (
  USE_REAL ? realUseSharedValue : useFallbackSharedValue
) as RealShared;
export const useAnimatedStyle: RealStyle = (
  USE_REAL ? realUseAnimatedStyle : fallbackUseAnimatedStyle
) as RealStyle;
export const withTiming: RealTiming = (
  USE_REAL ? realWithTiming : fallbackWithTiming
) as RealTiming;
export const withSequence: RealSequence = (
  USE_REAL ? realWithSequence : fallbackWithSequence
) as RealSequence;
export const withRepeat: RealRepeat = (
  USE_REAL ? realWithRepeat : fallbackWithRepeat
) as RealRepeat;

const FallbackAnimated = { View: RNView } as unknown as typeof RealAnimated;
const Animated = (USE_REAL ? RealAnimated : FallbackAnimated) as typeof RealAnimated;
export default Animated;
