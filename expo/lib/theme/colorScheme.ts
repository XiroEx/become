import { colorScheme } from "nativewind";
import type { ThemeMode } from "@/lib/theme/tokens";

/**
 * THE SYSTEM DECIDES, THE WAY IT DOES ON THE WEB (NP-123).
 *
 * This file used to pin dark (`colorScheme.set("dark")`, NP-013) because 43
 * `#0a0a0a` literals sat in plain RN `style` objects while NativeWind's variables
 * followed the system: a phone in light mode drew light-mode text on those
 * near-black surfaces. NP-123 deleted the literals — every colour now comes
 * from `useThemeTokens()` or from a class — so the pin has nothing left to
 * protect, and native follows `prefers-color-scheme` exactly as
 * `webapp/app/layout.tsx` does.
 *
 * `"system"` IS NativeWind's default, and this call is still not a no-op worth
 * deleting: the scheme is a persisted, writable global (`colorScheme.set`), and
 * saying it out loud at startup is what makes "follow the system" a fact in the
 * code and a line in a test rather than an absence. `app.json` says
 * `userInterfaceStyle: "automatic"` so the OS agrees about the surfaces the app
 * does not draw — keyboards, share sheets, the launch screen.
 */
export const COLOR_SCHEME_SOURCE = "system" as const;

/** The two modes the app has values for. There is no in-app override. */
export const SUPPORTED_COLOR_SCHEMES: readonly ThemeMode[] = ["light", "dark"];

/**
 * Called at module load from `app/_layout.tsx` — before the first render, so
 * there is no frame in the wrong theme.
 */
export function followSystemColorScheme(): void {
  colorScheme.set(COLOR_SCHEME_SOURCE);
}
