import { useCallback, useState } from "react";

/**
 * Pressed-state via `onPressIn`/`onPressOut` instead of a `style` callback.
 *
 * NP-314: on RN 0.86.3 + NativeWind 4.2 (confirmed on an Android S23 Ultra,
 * One UI 7), a `Pressable` whose `style` prop is a FUNCTION
 * (`style={({ pressed }) => [...]}`) renders with NONE of those styles
 * applied — children render, the container style does not. There were 9 such
 * call sites across 8 files and every one of them was invisible, stacked or
 * missing its card on device despite looking correct in Jest (RN's test
 * renderer evaluates the callback the way the prop type promises; the device
 * runtime did not).
 *
 * The fix is mechanical: never pass a function to `style`. Build a static
 * array/object from this hook's boolean instead — same pressed-opacity
 * effect, no callback.
 */
export function usePressed(): {
  pressed: boolean;
  onPressIn: () => void;
  onPressOut: () => void;
} {
  const [pressed, setPressed] = useState(false);
  const onPressIn = useCallback(() => setPressed(true), []);
  const onPressOut = useCallback(() => setPressed(false), []);
  return { pressed, onPressIn, onPressOut };
}

export default usePressed;
