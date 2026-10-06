import { useCallback, useEffect, useRef } from "react";
import {
  Dimensions,
  Keyboard,
  Platform,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";

/** Anything with RN's `NativeMethods.measureInWindow` — a `TextInput`, a `View`, … */
interface Measurable {
  measureInWindow(
    callback: (x: number, y: number, width: number, height: number) => void,
  ): void;
}

interface ScrollerLike {
  scrollTo(options: { y: number; animated?: boolean }): void;
}

/**
 * NP-319 — Android has no built-in "scroll the focused `TextInput` into
 * view" the way iOS's `ScrollView` does, and with targetSdk 35 / Android 15
 * edge-to-edge, `windowSoftInputMode=adjustResize` no longer shrinks the
 * window to make room either (see `ANDROID_QUIRKS.md`). `app/(auth)/login.tsx`
 * (NP-309) hand-rolled the fix for its one field —
 * `Keyboard.addListener("keyboardDidShow", …)` + `measureInWindow` +
 * `ScrollView.scrollTo` — this hook is that fix, generalised so any screen
 * with a `ScrollView` and more than one focusable field can reuse it instead
 * of re-deriving it per screen.
 *
 * Usage: give the `ScrollView` the `ref` and `onScroll` this returns, and
 * call `setActiveField(fieldRef.current)` from the focused field's
 * `onFocus` — e.g. `onFocus={() => setActiveField(fieldRef.current)}`.
 * The ref is dereferenced INSIDE that handler (an event, not render), which
 * is also why this takes the resolved node rather than the ref itself: a
 * plain value, read where it is safe to read it.
 *
 * iOS is left alone on purpose — its `ScrollView` already does this itself.
 */
export function useScrollFocusedFieldIntoView(
  scrollViewRef: React.RefObject<ScrollerLike | null>,
) {
  const activeFieldRef = useRef<Measurable | null>(null);
  const scrollOffsetRef = useRef(0);

  const onScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      scrollOffsetRef.current = e.nativeEvent.contentOffset.y;
    },
    [],
  );

  const setActiveField = useCallback((field: Measurable | null) => {
    activeFieldRef.current = field;
  }, []);

  useEffect(() => {
    if (Platform.OS !== "android") return;
    const subscription = Keyboard.addListener("keyboardDidShow", (event) => {
      const field = activeFieldRef.current;
      const scroller = scrollViewRef.current;
      if (!field || !scroller) return;
      const keyboardHeight = event?.endCoordinates?.height ?? 0;
      field.measureInWindow((_x, y, _width, height) => {
        const visibleBottom = Dimensions.get("window").height - keyboardHeight;
        const overflow = y + height - visibleBottom;
        if (overflow > 0) {
          scroller.scrollTo({
            y: scrollOffsetRef.current + overflow + 16,
            animated: true,
          });
        }
      });
    });
    return () => subscription.remove();
  }, [scrollViewRef]);

  return { onScroll, setActiveField };
}

/** The `setActiveField` this hook returns — for a component that doesn't own
 * the `ScrollView` itself (e.g. a dashboard rendered inside a parent route's
 * scroll view) and needs to accept it as a prop instead. */
export type SetActiveField = ReturnType<
  typeof useScrollFocusedFieldIntoView
>["setActiveField"];
