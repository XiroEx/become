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
 *   primary     zinc-900 / white         primary-fg  white / zinc-900
 *                                          THE WEB'S NEUTRAL PRIMARY (NP-313):
 *                                          `bg-zinc-900 text-white
 *                                          dark:bg-white dark:text-black` is
 *                                          what every primary action on the web
 *                                          is (~790 `bg-zinc-900` uses), and
 *                                          native drew all of them in red-500
 *                                          because `primary` WAS red-500 in
 *                                          both modes. Red is not the base
 *                                          colour; it is an exception, and it
 *                                          now has its own two tokens below.
 *   brand       red-600 / red-500        brand-fg    white (both modes)
 *                                          The red the web keeps on purpose
 *                                          OUTSIDE of error text: the unread
 *                                          notification badge (`TopNav.tsx`'s
 *                                          `bg-red-500 text-white`) and the
 *                                          other `bg-red-500` / `text-red-600`
 *                                          accents. Mode-aware like `accent`,
 *                                          because red-500 on a near-white page
 *                                          is 3.6:1 and red-600 is 4.6:1.
 *   destructive red-700  / red-400       the web's `text-red-600
 *                                          dark:text-red-400` error/alert text
 *                                          and its `bg-red-50 dark:bg-red-950/30`
 *                                          tint — the "danger" red, unchanged
 *   accent      amber-600 / amber-400    success     green-600 / green-400
 *   info        blue-600 / blue-400      (the web's "Calendar"/History links
 *                                          the scheduled-workout icons and the
 *                                          meal macro tile for protein —
 *                                          Tailwind's blue, never the brand red)
 *   mindset     purple-600 / purple-400  (the web's Mindset streak icon —
 *                                          Tailwind's purple, distinct from accent)
 *   teal        teal-500 (both modes)    (the nutrition consultant's identity
 *                                          colour, NP-262)
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
 *   mind-cyan   cyan-500   (both modes)  State Shift's own identity colour
 *   mind-blue   blue-500   (both modes)  Mission's own identity colour
 *   mind-emerald emerald-500 (both modes) Vision's own identity colour
 *   mind-pink   pink-500   (both modes)  Social's own identity colour
 *                                          (NP-298) — `webapp/components/mind/
 *                                          ToolIntroGate.tsx`'s `ACCENTS` map,
 *                                          read by `lib/mind/accents.ts`'s
 *                                          `mindAccentColor()`. Self-Image,
 *                                          Discipline and Anti-Sabotage reuse
 *                                          `mind-violet` / `brand` / `orange`
 *                                          rather than adding three more flat
 *                                          tokens for the same hues.
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
  | "brand"
  | "brand-foreground"
  | "muted"
  | "muted-foreground"
  | "card"
  | "border"
  | "destructive"
  | "destructive-foreground"
  | "accent"
  | "accent-foreground"
  | "success"
  | "teal"
  | "info"
  | "mindset"
  | "mood-bad"
  | "mood-low"
  | "mood-okay"
  | "mood-good"
  | "mood-great"
  | "mind-violet"
  | "mind-green"
  | "mind-ink"
  | "mind-cyan"
  | "mind-blue"
  | "mind-emerald"
  | "mind-pink"
  | "orange"
  | "indigo"
  | "rose"
  | "amber";

export const lightTokens: Record<TokenName, string> = {
  background: "250 250 250", // zinc-50
  foreground: "24 24 27", // zinc-900
  primary: "24 24 27", // zinc-900 — the web's `bg-zinc-900` primary action
  "primary-foreground": "255 255 255", // the web's `text-white` on it
  brand: "220 38 38", // red-600 — the web's light-mode red (`text-red-600`,
  // `bg-red-600`); the lighter red-500 is 3.6:1 on zinc-50 and this is 4.6:1
  "brand-foreground": "255 255 255", // the web's `bg-red-500/600 text-white`
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
  teal: "20 184 166", // teal-500 — the nutrition consultant's identity
  // colour (NP-262), identical in both modes like `primary`: the web's
  // `accentFrom="from-emerald-500" accentTo="to-teal-500"` gradient does not
  // change with the scheme either.
  info: "37 99 235", // blue-600 — the web's `text-blue-600` (Calendar/History
  // links); `text-blue-500` icons are one shade lighter on the web but share
  // this token rather than adding a second blue
  mindset: "147 51 234", // purple-600 — the web's Mindset streak icon
  // (`text-purple-600 bg-purple-100`)
  // The mood chart's 5 bar/face colours (`webapp/components/ProgressChart.tsx`
  // `moodColors`). The web uses ONE flat palette in both modes — these data
  // colours identify a mood level, not a surface, so they do not flip with
  // the scheme — which is why the light and dark values below are identical.
  "mood-bad": "248 113 113", // red-400 — Bad
  "mood-low": "251 146 60", // orange-400 — Not Great
  "mood-okay": "251 191 36", // amber-400 — Okay
  "mood-good": "163 230 53", // lime-400 — Pretty Good
  "mood-great": "52 211 153", // emerald-400 — Great
  "mind-violet": "139 92 246", // violet-500 — same in both modes, like `primary`
  "mind-green": "34 197 94", // green-500 — same in both modes
  "mind-ink": "24 24 27", // zinc-900 — same in both modes
  "mind-cyan": "6 182 212", // cyan-500 — State Shift's accent (NP-298), same in both modes
  "mind-blue": "59 130 246", // blue-500 — Mission's accent (NP-298), same in both modes
  "mind-emerald": "16 185 129", // emerald-500 — Vision's accent (NP-298), same in both modes
  "mind-pink": "236 72 153", // pink-500 — Social's accent (NP-298), same in both modes
  orange: "249 115 22", // orange-500 — the web's Circuit group badge
  // (`bg-orange-500`), same in both modes like `primary`
  indigo: "99 102 241", // indigo-500 — the web's Triset group badge
  rose: "244 63 94", // rose-500 — the web's Giant Set group badge
  amber: "251 191 36", // amber-400 — the streak card's progress bar, the
  // flat END of the web's `from-orange-500 to-amber-400` gradient
  // (`WorkoutSummary.tsx`), which carries no `dark:` variant either — same
  // value in both modes like `orange`, `indigo` and `rose` above (NP-334)
};

export const darkTokens: Record<TokenName, string> = {
  background: "10 10 10", // #0a0a0a, the app's first paint
  foreground: "255 255 255",
  primary: "255 255 255", // white — the web's `dark:bg-white` primary action
  "primary-foreground": "24 24 27", // zinc-900 — the web's `dark:text-black`
  brand: "239 68 68", // red-500 — the web's flat `bg-red-500` / `dark:text-red-500`
  "brand-foreground": "255 255 255", // white on red in both modes, like the web
  muted: "39 39 42", // zinc-800
  "muted-foreground": "161 161 170", // zinc-400
  card: "24 24 27", // zinc-900
  border: "39 39 42", // zinc-800
  destructive: "248 113 113", // red-400 — the web's `dark:text-red-400`
  "destructive-foreground": "24 24 27",
  accent: "251 191 36", // amber-400 — the web's `dark:text-amber-400`
  "accent-foreground": "24 24 27",
  success: "74 222 128", // green-400 — the web's `dark:text-green-400`
  teal: "20 184 166", // teal-500 — mode-invariant, see lightTokens.teal
  info: "96 165 250", // blue-400 — the web's `dark:text-blue-400`
  mindset: "192 132 252", // purple-400 — the web's `dark:text-purple-400 dark:bg-purple-900/30`
  // Same flat mood palette as light mode — see the comment on `lightTokens`.
  "mood-bad": "248 113 113",
  "mood-low": "251 146 60",
  "mood-okay": "251 191 36",
  "mood-good": "163 230 53",
  "mood-great": "52 211 153",
  "mind-violet": "139 92 246", // violet-500 — same in both modes, like `primary`
  "mind-green": "34 197 94", // green-500 — same in both modes
  "mind-ink": "24 24 27", // zinc-900 — same in both modes
  "mind-cyan": "6 182 212", // cyan-500 — same in both modes
  "mind-blue": "59 130 246", // blue-500 — same in both modes
  "mind-emerald": "16 185 129", // emerald-500 — same in both modes
  "mind-pink": "236 72 153", // pink-500 — same in both modes
  orange: "249 115 22", // orange-500 — same in both modes
  indigo: "99 102 241", // indigo-500 — same in both modes
  rose: "244 63 94", // rose-500 — same in both modes
  amber: "251 191 36", // amber-400 — same in both modes, see lightTokens.amber
};

export function getTokens(mode: ThemeMode): Record<TokenName, string> {
  return mode === "dark" ? darkTokens : lightTokens;
}

/**
 * Resolve a token to a CSS-compatible `rgb(r g b)` string for use in places
 * where NativeWind class strings aren't available.
 *
 * Example: `resolveToken("brand", "dark")` → `"rgb(239 68 68)"`.
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
 * WHITE, IN BOTH MODES — the ink for a surface that is dark in both schemes.
 *
 * A camera viewfinder, a full-screen photo behind a scrim, the program hero
 * card: those are black on every phone whatever the system setting is, the way
 * the web's hero and mirror stage are. Until NP-313 those call sites used
 * `primary-foreground`, which happened to be white in both modes because
 * `primary` was the brand red; now `primary-foreground` is the ink on a NEUTRAL
 * primary (white in light, zinc-900 in dark), so an always-dark surface names
 * the DARK palette's foreground explicitly instead of riding on a coincidence.
 *
 * It is derived, not retyped, so `__tests__/noHexColorLiterals.test.ts` stays
 * satisfied and there is still exactly one place a colour value is written.
 */
export const onDarkForeground = `rgb(${darkTokens.foreground})`;

/**
 * THE BECOMING STAGE (NP-204) — a surface that is dark in BOTH modes.
 *
 * The web's journey stage (`webapp/components/becoming/journey/JourneyCanvas.tsx`)
 * is a fixed night sky: `bg-[#07060d]`, white chrome at various alphas, a
 * violet-400 (`#a78bfa`) line, Horizon and area fill, and a gold (`#ffd37a`)
 * ring on a week that set a new high. None of it follows the colour scheme —
 * a member in light mode still opens a dark stage, as on the web — so like
 * `onDarkForeground` these are named here, once, as triplets.
 */
export const becomingStageTokens = {
  /** the web's `#07060d` */
  background: "7 6 13",
  /**
   * the web's `#0e0c17` — a week card's own ground, under its subject-tinted
   * sky (NP-342). Dark in both schemes like the stage it sits on.
   */
  card: "14 12 23",
  /** violet-400 — the web's `#a78bfa` */
  violet: "167 139 250",
  /** the web's `#ffd37a` — the "new high" ring */
  gold: "255 211 122",
  /** violet-600 and emerald-500 — the two radial washes of the web's ambient sky */
  skyViolet: "124 58 237",
  skyEmerald: "16 185 129",
  /** white ink, the dark palette's foreground */
  ink: darkTokens.foreground,
} as const;

/** `rgb(r g b)` for a triplet, or `rgba(r, g, b, a)` when an alpha is given. */
export function rgbOf(triplet: string, alpha = 1): string {
  if (alpha >= 1) return `rgb(${triplet})`;
  const [r, g, b] = triplet.split(" ");
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
