/**
 * REANIMATED, OR A STILL FRAME — the one door every motion component imports
 * Reanimated through.
 *
 * `expo-router/testing-library` runs its own
 * `jest.mock("react-native-reanimated", …)`, and when Reanimated's own mock
 * cannot load it answers `{}`. That overrides `__mocks__/react-native-reanimated.js`
 * for every suite that renders through `renderRouter`, so a component calling
 * `useSharedValue` there throws "is not a function" and takes the whole route
 * tree down with it (the root error screen). The glass tab bar met the same
 * thing (`MOTION_AVAILABLE` in `components/navigation/GlassTabBar.tsx`).
 *
 * So the check is made ONCE, here, at module load: when Reanimated is real
 * these are its own exports, untouched; when it is missing they are inert
 * stand-ins that draw the same layout with no animation — `Animated.View` is
 * a plain `View`, an animated style is `undefined` (the caller's static style
 * is the whole style), and an animation is its end value. The choice is a
 * module constant, so a component still calls the same hooks in the same
 * order on every render.
 *
 * This changes nothing about Reduce Motion: every caller still asks
 * `useReducedMotion()` and cuts its travel when the OS says so.
 */

import { useState } from "react";
import { ScrollView, View } from "react-native";
import * as Reanimated from "react-native-reanimated";

const real = Reanimated as Partial<typeof Reanimated>;

const MOTION_AVAILABLE =
  typeof real.useSharedValue === "function" &&
  typeof real.useAnimatedStyle === "function" &&
  typeof real.withTiming === "function" &&
  real.default?.View != null;

/** Whether Reanimated is really there (false only under a `{}` mock). */
export function motionAvailable(): boolean {
  return MOTION_AVAILABLE;
}

type SharedBox<T> = {
  value: T;
  get: () => T;
  set: (next: T | ((prev: T) => T)) => void;
};

function useStaticSharedValue<T>(init: T): SharedBox<T> {
  const [box] = useState<SharedBox<T>>(() => {
    const b: SharedBox<T> = {
      value: init,
      get: () => b.value,
      set: (next) => {
        b.value =
          typeof next === "function" ? (next as (prev: T) => T)(b.value) : next;
      },
    };
    return b;
  });
  return box;
}

function useStaticAnimatedStyle(): undefined {
  return undefined;
}

const identity = (t: number) => t;
const staticEasing = {
  linear: identity,
  ease: identity,
  quad: identity,
  cubic: identity,
  sin: identity,
  exp: identity,
  bezier: () => identity,
  in: (fn: (t: number) => number) => fn,
  out: (fn: (t: number) => number) => fn,
  inOut: (fn: (t: number) => number) => fn,
};

const staticAnimated = {
  View,
  ScrollView,
  createAnimatedComponent: <C>(c: C) => c,
};

const Animated = (
  MOTION_AVAILABLE ? real.default : staticAnimated
) as typeof Reanimated.default;

export const useSharedValue = (
  MOTION_AVAILABLE ? real.useSharedValue : useStaticSharedValue
) as typeof Reanimated.useSharedValue;

export const useAnimatedStyle = (
  MOTION_AVAILABLE ? real.useAnimatedStyle : useStaticAnimatedStyle
) as typeof Reanimated.useAnimatedStyle;

export const withTiming = (
  MOTION_AVAILABLE ? real.withTiming : (to: unknown) => to
) as typeof Reanimated.withTiming;

export const withSpring = (
  MOTION_AVAILABLE && typeof real.withSpring === "function"
    ? real.withSpring
    : (to: unknown) => to
) as typeof Reanimated.withSpring;

export const withDelay = (
  MOTION_AVAILABLE && typeof real.withDelay === "function"
    ? real.withDelay
    : (_ms: number, next: unknown) => next
) as typeof Reanimated.withDelay;

export const withSequence = (
  MOTION_AVAILABLE && typeof real.withSequence === "function"
    ? real.withSequence
    : (...vals: unknown[]) => vals[vals.length - 1]
) as typeof Reanimated.withSequence;

export const withRepeat = (
  MOTION_AVAILABLE && typeof real.withRepeat === "function"
    ? real.withRepeat
    : (val: unknown) => val
) as typeof Reanimated.withRepeat;

export const cancelAnimation = (
  MOTION_AVAILABLE && typeof real.cancelAnimation === "function"
    ? real.cancelAnimation
    : () => {}
) as typeof Reanimated.cancelAnimation;

const staticInterpolate = (
  v: number,
  input: readonly number[],
  output: readonly number[],
) => {
  if (!input.length || !output.length) return v;
  if (v <= input[0]) return output[0];
  if (v >= input[input.length - 1]) return output[output.length - 1];
  return output[0];
};

export const interpolate = (
  MOTION_AVAILABLE && typeof real.interpolate === "function"
    ? real.interpolate
    : staticInterpolate
) as typeof Reanimated.interpolate;

export const Extrapolation = (
  MOTION_AVAILABLE && real.Extrapolation
    ? real.Extrapolation
    : { CLAMP: "clamp", EXTEND: "extend", IDENTITY: "identity" }
) as typeof Reanimated.Extrapolation;

export const runOnJS = (
  MOTION_AVAILABLE && typeof real.runOnJS === "function"
    ? real.runOnJS
    : <F extends (...args: never[]) => unknown>(fn: F) => fn
) as typeof Reanimated.runOnJS;

export const Easing = (
  MOTION_AVAILABLE && real.Easing ? real.Easing : staticEasing
) as typeof Reanimated.Easing;

export default Animated;
