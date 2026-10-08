import type { NativeStackNavigationOptions } from "expo-router";
import { useReducedMotion } from "@/lib/a11y/reducedMotion";

/**
 * ONE PUSH ANIMATION, NAMED OUT LOUD (NP-340).
 *
 * Every Stack in this app used to leave `animation` unset, which means
 * `presentation: "card"`'s default — and react-native-screens documents that
 * default as "slide from the side on iOS, the animation on Android will VARY
 * DEPENDING ON THE OS VERSION AND THEME". On George's Pixel (and on the S23)
 * that is the Android 15 / Material 3 predictive-back transition: the outgoing
 * screen travels further than the incoming one covers, so the native stack
 * container shows through at the left edge for a few frames, and the curve is
 * not the one the app uses anywhere else. "Varies with the OS version" is not
 * something a store build can be smooth on.
 *
 * `ios_from_right` is the explicit answer, and it is one value for both
 * platforms:
 *
 *   • on ANDROID it is react-native-screens' own iOS-style push — the incoming
 *     screen comes in from the right while the outgoing one parallaxes to -30%,
 *     so the two together cover the whole frame for the entire transition and
 *     there is no edge for the container to show through;
 *   • on iOS it resolves to the platform default, which IS that push — so iOS
 *     keeps the native feel (and the native edge-swipe back) unchanged.
 *
 * `slide_from_right` was the other candidate in the card. It also leaves no
 * gap, but it is Android-only (it resolves to the default on iOS), so the two
 * platforms would again be animating differently for no stated reason.
 */
export type StackAnimation = NonNullable<
  NativeStackNavigationOptions["animation"]
>;

/** The push/back animation for every Stack in the app. */
export const PUSH_ANIMATION: StackAnimation = "ios_from_right";

/**
 * …and `"none"` when the OS asks for reduced motion. A navigator transition is
 * motion like any other, and React Native applies none of the setting for us
 * (`lib/a11y/reducedMotion.ts`): "Reduce Motion" on iOS and "Remove animations"
 * on Android both mean cut, not travel. `"none"` is a cut — the destination
 * screen still arrives, it just does not slide.
 */
export function stackAnimation(reducedMotion: boolean): StackAnimation {
  return reducedMotion ? "none" : PUSH_ANIMATION;
}

/** The live version, for a navigator's `screenOptions`. */
export function useStackAnimation(): StackAnimation {
  return stackAnimation(useReducedMotion());
}
