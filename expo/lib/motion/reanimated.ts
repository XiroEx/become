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
 * THE SHARED-VALUE SHAPE. Every motion component in this app writes its
 * shared values through `.set()` and reads them through `.get()` (the
 * compiler-safe API Reanimated documents for exactly this: assignment to
 * `.value` is a setter call the React Compiler's static analysis cannot see,
 * so `.set()` is what the week card's edge light and every enter/pop/fill
 * already use). Real Reanimated 4.x provides `get`/`set` on every shared
 * value (`addCompilerSafeGetAndSet` in its `mutables`), and the jest mock
 * provides them too — but the static stand-in here used to be the odd one
 * out, so `useSharedValue` is wrapped on BOTH paths: the real hook's box is
 * returned as-is (it already carries `value`/`get`/`set`), and the static
 * hook builds the same box. Either way the caller gets one `SharedBox`
 * shape, and a component written against `.set()`/`.get()`/`.value` paints
 * on a real phone exactly the way it paints in a test.
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

export type SharedBox<T> = {
  value: T;
  get: () => T;
  set: (next: T | ((prev: T) => T)) => void;
};

/**
 * One `SharedBox` shape on both paths. The real hook already returns a box
 * carrying `value`/`get`/`set` (Reanimated 4.x adds them to every shared
 * value for the React Compiler, which cannot see through a `.value =`
 * assignment); the static hook builds the same box over `useState`, with
 * `set` applying plain values and updater functions and `withTiming` et al
 * already collapsed to their end values by the static animation stand-ins
 * below. Callers therefore always get `.set()`/`.get()`/`.value`, whether
 * the phone runs the real driver or a test runs the still frame — which is
 * what keeps ScreenEnter/ProgressFill painting on device the way they paint
 * in jest.
 */
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

const useRealSharedValue = (
  MOTION_AVAILABLE ? real.useSharedValue : useStaticSharedValue
) as <T>(init: T) => SharedBox<T>;

/**
 * The wrapped hook both paths share. The branch is chosen once at module
 * load (`MOTION_AVAILABLE` is a constant), so every render calls exactly one
 * hook: the real `useSharedValue` — whose box already satisfies `SharedBox`
 * — when Reanimated is present, the static box builder when it is missing.
 * One name, one shape, every caller.
 */
function useSharedValueBox<T>(init: T): SharedBox<T> {
  return useRealSharedValue(init);
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

export const useSharedValue = useSharedValueBox as typeof Reanimated.useSharedValue;

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
  const firstIn = input[0];
  const lastIn = input[input.length - 1];
  const firstOut = output[0];
  const lastOut = output[output.length - 1];
  if (
    firstIn === undefined ||
    lastIn === undefined ||
    firstOut === undefined ||
    lastOut === undefined
  ) {
    return v;
  }
  if (v <= firstIn) return firstOut;
  if (v >= lastIn) return lastOut;
  return firstOut;
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
