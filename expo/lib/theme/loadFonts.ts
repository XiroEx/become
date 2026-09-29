import { useEffect } from "react";
import { useFonts } from "expo-font";
import * as SplashScreen from "expo-splash-screen";
import { GEIST_FONTS } from "./fonts";

/**
 * THE SPLASH STAYS UP UNTIL GEIST IS IN MEMORY.
 *
 * `expo-font` registers a font asynchronously, and React Native does not
 * re-render a `<Text>` when the registration lands: whatever face was resolved
 * for the first paint is the face that stays on screen. Render the app before
 * the fonts are ready and the launch screen is followed by a frame — often
 * several — of San Francisco / Roboto, and then nothing changes it back.
 *
 * So the launch screen is held (`holdSplashForFonts()`, called at MODULE LOAD
 * in `app/_layout.tsx`, next to `followSystemColorScheme()` — an effect runs after the
 * first paint, which is exactly the frame this is about), the root layout
 * renders nothing until `useGeistFonts()` says ready, and hiding the splash is
 * that hook's job. The first frame a member sees is already Geist.
 */
export function holdSplashForFonts(): void {
  // Rejects only if the splash module is unavailable (Expo Go reloads, tests).
  // There is nothing to do about it, and it must not take the app down.
  void SplashScreen.preventAutoHideAsync().catch(() => {});
}

export interface GeistFontsState {
  /** True once the faces are registered — or once loading them has failed. */
  fontsReady: boolean;
  /** Non-null when a face failed to load; the app renders in the system font. */
  fontError: Error | null;
}

/**
 * Loads the eight Geist faces and hides the launch screen when they are in.
 *
 * A FAILURE STILL SHOWS THE APP. If a face cannot be registered the state goes
 * ready anyway with `fontError` set: a member gets the system font, which is
 * ugly, instead of a launch screen that never goes away, which is a dead app.
 */
export function useGeistFonts(): GeistFontsState {
  const [loaded, error] = useFonts(GEIST_FONTS);
  const fontsReady = loaded || error !== null;

  useEffect(() => {
    if (!fontsReady) return;
    void SplashScreen.hideAsync().catch(() => {});
  }, [fontsReady]);

  return { fontsReady, fontError: error ?? null };
}
