import * as ExpoRouter from "expo-router";

type EffectCallback = () => void | (() => void);

const routerObj = ExpoRouter as Record<string, unknown>;
const maybeUseFocusEffect = routerObj.useFocusEffect as
  | ((cb: EffectCallback) => void)
  | undefined;

/**
 * Hook to run an action when the screen gains focus.
 * In a real Expo runtime, uses expo-router's useFocusEffect.
 * When useFocusEffect is not present (e.g. unit test mocks),
 * does not loop or duplicate initial mount effects.
 */
export function useScreenFocus(callback: EffectCallback): void {
  if (typeof maybeUseFocusEffect === "function") {
    maybeUseFocusEffect(callback);
  }
}
