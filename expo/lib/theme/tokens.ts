/**
 * Semantic theme tokens — RGB triplets (space-separated, no commas, no rgb() wrapper).
 *
 * Mirrors the CSS variables in global.css so that:
 *   1. Tailwind / NativeWind resolve `bg-primary` to `rgb(var(--primary) / <alpha>)`.
 *   2. RN APIs that can't read Tailwind (StatusBar, Stack contentStyle, lucide
 *      `color` prop, ActivityIndicator, TextInput placeholders) can import these
 *      raw values.
 *
 * Per the nextjs-to-react-native skill: tokens stored as "R G B" so alpha composes
 * via the Tailwind `<alpha-value>` placeholder.
 *
 * THE VALUES ARE THE WEB'S (NP-123). `webapp/` styles with Tailwind's zinc /
 * red / amber / green families and a `dark:` variant on each — that pairing is
 * what every token below is, and the comment on each line names the web class
 * it comes from, so a drift is visible in a diff rather than on a phone:
 *
 *   background  zinc-50  / #0a0a0a      foreground  zinc-900 / white
 *   card        white    / zinc-900      border      zinc-200 / zinc-800
 *   muted       zinc-100 / zinc-800      muted-fg    zinc-500 / zinc-400
 *   primary     red-500 (brand, both)    destructive red-700  / red-400
 *   accent      amber-600 / amber-400    success     green-600 / green-400
 *   info        blue-600 / blue-400      (the web's "Calendar"/History links
 *                                          the scheduled-workout icons and the
 *                                          meal macro tile for protein —
 *                                          Tailwind's blue, never the brand red)
 *   mindset     purple-600 / purple-400  (the web's Mindset streak icon —
 *                                          Tailwind's purple, distinct from accent)
 *   mind-violet violet-500 (both modes)  the Mind home's own accent (NP-296):
 *   mind-green  green-500  (both modes)  the Brain icon, the level bar and the
 *                                          chapter path, as a violet→green
 *                                          gradient — `webapp/components/mind/
 *                                          MindJourney.tsx`'s `from-violet-500
 *                                          to-green-500`. Distinct from
 *                                          `mindset` (the Streaks screen's
 *                                          badge, a flat purple with no green).
 *   mind-ink    zinc-900   (both modes)  the session card's white Begin
 *                                          button text/icon — static like
 *                                          `primary`, because that button is
 *                                          white in both light and dark mode.
 *
 * Nothing here is mode-agnostic any more: `resolveToken` REQUIRES a mode, so a
 * new call site cannot quietly resolve against dark the way 20 of them did
 * before this card. The mode comes from `useThemeTokens()`, which reads
 * NativeWind's colour scheme and therefore the system setting.
 */
export type ThemeMode = "light" | "dark";

export type TokenName =
  | "background"
  | "foreground"
  | "primary"
  | "primary-foreground"
  | "muted"
  | "muted-foreground"
  | "card"
  | "border"
  | "destructive"
  | "destructive-foreground"
  | "accent"
  | "accent-foreground"
  | "success"
  | "info"
  | "mindset"
  | "mind-violet"
  | "mind-green"
  | "mind-ink";

export const lightTokens: Record<TokenName, string> = {
  background: "250 250 250", // zinc-50
  foreground: "24 24 27", // zinc-900
  primary: "239 68 68", // red-500 — the brand red, identical in both modes
  "primary-foreground": "255 255 255",
  muted: "244 244 245", // zinc-100
  "muted-foreground": "113 113 122", // zinc-500
  card: "255 255 255", // white
  border: "228 228 231", // zinc-200
  destructive: "185 28 28", // red-700 — the web's `text-red-700` on a red tint,
  // and what keeps the error banner at 4.5:1 in light mode
  // (red-600 on `bg-red-50` is 3.5:1 and fails AA)
  "destructive-foreground": "255 255 255",
  accent: "217 119 6", // amber-600 — the web's `text-amber-600`; amber-400 is
  // invisible on a near-white surface, which is why the
  // light value is not the dark one.
  "accent-foreground": "24 24 27",
  success: "22 163 74", // green-600 — the web's `text-green-600`
  info: "37 99 235", // blue-600 — the web's `text-blue-600` (Calendar/History
  // links); `text-blue-500` icons are one shade lighter on the web but share
  // this token rather than adding a second blue
  mindset: "147 51 234", // purple-600 — the web's Mindset streak icon
  // (`text-purple-600 bg-purple-100`)
  "mind-violet": "139 92 246", // violet-500 — same in both modes, like `primary`
  "mind-green": "34 197 94", // green-500 — same in both modes
  "mind-ink": "24 24 27", // zinc-900 — same in both modes
};

export const darkTokens: Record<TokenName, string> = {
  background: "10 10 10", // #0a0a0a, the app's first paint
  foreground: "255 255 255",
  primary: "239 68 68", // red-500
  "primary-foreground": "255 255 255",
  muted: "39 39 42", // zinc-800
  "muted-foreground": "161 161 170", // zinc-400
  card: "24 24 27", // zinc-900
  border: "39 39 42", // zinc-800
  destructive: "248 113 113", // red-400 — the web's `dark:text-red-400`
  "destructive-foreground": "24 24 27",
  accent: "251 191 36", // amber-400 — the web's `dark:text-amber-400`
  "accent-foreground": "24 24 27",
  success: "74 222 128", // green-400 — the web's `dark:text-green-400`
  info: "96 165 250", // blue-400 — the web's `dark:text-blue-400`
  mindset: "192 132 252", // purple-400 — the web's `dark:text-purple-400 dark:bg-purple-900/30`
  "mind-violet": "139 92 246", // violet-500 — same in both modes, like `primary`
  "mind-green": "34 197 94", // green-500 — same in both modes
  "mind-ink": "24 24 27", // zinc-900 — same in both modes
};

export function getTokens(mode: ThemeMode): Record<TokenName, string> {
  return mode === "dark" ? darkTokens : lightTokens;
}

/**
 * Resolve a token to a CSS-compatible `rgb(r g b)` string for use in places
 * where NativeWind class strings aren't available.
 *
 * Example: `resolveToken("primary", "dark")` → `"rgb(239 68 68)"`.
 *
 * `mode` is REQUIRED. It used to default to `"dark"`, and that default is what
 * made 20 call sites paint dark-mode colours on a light-mode phone.
 */
export function resolveToken(name: TokenName, mode: ThemeMode): string {
  const triplet = getTokens(mode)[name];
  return `rgb(${triplet})`;
}

/**
 * A translucent wash of a token, for the tinted surfaces the web builds with
 * `bg-red-50 dark:bg-red-950/30`: the error banner, the PR banner. Expressed as
 * an alpha over the screen background rather than two more tokens, because that
 * is what the web does in dark mode and it keeps one source of truth per hue.
 *
 * `rgba(r, g, b, a)` and not `rgb(r g b / a)`: React Native's colour parser
 * takes the comma form everywhere, the CSS Color 4 slash form only on newer
 * versions.
 */
export function tintToken(
  name: TokenName,
  mode: ThemeMode,
  alpha: number,
): string {
  const [r, g, b] = getTokens(mode)[name].split(" ");
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * The modal scrim. `--backdrop` in the web's redstyle tokens is
 * `rgba(0,0,0,0.5)` on dark; light gets a stronger wash than the web's 0.2
 * because a white sheet over a near-white page needs the separation on a phone,
 * where there is no window frame to read it against.
 */
export const scrimByMode: Record<ThemeMode, string> = {
  light: "rgba(0, 0, 0, 0.35)",
  dark: "rgba(0, 0, 0, 0.5)",
};
