import * as ExpoRouter from "expo-router";

type EffectCallback = () => void | (() => void);

const routerObj = ExpoRouter as Record<string, unknown>;

/**
 * Hook to run an action when the screen gains focus.
 * In a real Expo runtime, uses expo-router's useFocusEffect.
 * When useFocusEffect is not present (e.g. unit test mocks) or when rendered
 * outside a NavigationContainer in unit tests, does not throw or duplicate
 * initial mount effects.
 */
export function useScreenFocus(callback: EffectCallback): void {
  const maybeUseFocusEffect = routerObj.useFocusEffect as
    | ((cb: EffectCallback) => void)
    | undefined;
  if (typeof maybeUseFocusEffect === "function") {
    try {
      maybeUseFocusEffect(callback);
    } catch {
      // Rendered outside a NavigationContainer in a unit test.
    }
  }
}
