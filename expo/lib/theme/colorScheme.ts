import { colorScheme } from "nativewind";
import type { ThemeMode } from "@/lib/theme/tokens";

/**
 * DARK IS THE ONLY THEME, AND IT IS PINNED HERE.
 *
 * `global.css` declares both palettes and `tailwind.config.js` sets
 * `darkMode: "class"`, so NativeWind decides which one a `bg-background` or a
 * `text-foreground` resolves to. Left alone it follows the SYSTEM setting — and
 * 39 files in this app hard-code the dark background (`#0a0a0a`) in a plain RN
 * `style`, because a StatusBar or a SafeAreaView cannot read a Tailwind class.
 * A phone in light mode therefore drew light-mode text (`24 24 27`, near-black)
 * on those near-black surfaces: unreadable, and unreadable only for members who
 * do not keep their phone in dark mode.
 *
 * Two ways out: make all 39 honour the theme, or ship one theme. v1 ships one
 * theme — the app was designed dark and the web is dark — so this sets
 * NativeWind's scheme to `dark` at startup and `app.json` sets
 * `userInterfaceStyle: "dark"` so the OS agrees (keyboards, share sheets, the
 * launch screen). The light status bar stays: content is light on dark.
 *
 * NP-123 is where a real light theme lands, and it starts by deleting the
 * literals — not by deleting this call.
 */
export const PINNED_COLOR_SCHEME: ThemeMode = "dark";

/**
 * Called at module load from `app/_layout.tsx` — before the first render, so
 * there is no frame in the system's theme to see.
 */
export function pinDarkMode(): void {
  colorScheme.set(PINNED_COLOR_SCHEME);
}
