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

 * THESE ARE TAILWIND v4's COLOURS (not v3's). The web is Tailwind v4
 * (`tailwindcss ^4`, `@import "tailwindcss"`), whose default palette is oklch,
 * and most of it lies outside sRGB: a browser gamut-maps it (chroma reduced in
 * oklch at constant lightness and hue). Each token below that names a Tailwind
 * class is that class's v4 oklch value mapped the same way, read from
 * tailwindcss 4.2.4's `theme.css`. A token is marked `(v4)` when it moved; one
 * within 1 ΔE (oklab ×100) of its v3 hex was left alone (zinc-*, amber-400/600,
 * green-500/600, teal-500, cyan-500, emerald-500, orange-500, violet-300), and
 * so were the colours the web writes as a HEX LITERAL, which no palette
 * touches: the mood chart (`ProgressChart.tsx` `moodColors`) and the Mind
 * accents (`ToolIntroGate.tsx` `ACCENTS`: mind-cyan/-blue/-emerald/-pink),
 * which stay exactly as the web paints them.
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
  | "amber"
  | "purple";

export const lightTokens: Record<TokenName, string> = {
  background: "250 250 250", // zinc-50
  foreground: "24 24 27", // zinc-900
  primary: "24 24 27", // zinc-900 — the web's `bg-zinc-900` primary action
  "primary-foreground": "255 255 255", // the web's `text-white` on it
  brand: "228 0 22", // red-600 (v4) — the web's light-mode red (`text-red-600`,
  // `bg-red-600`); the lighter red-500 is 3.6:1 on zinc-50 and this is 4.7:1
  "brand-foreground": "255 255 255", // the web's `bg-red-500/600 text-white`
  muted: "244 244 245", // zinc-100
  "muted-foreground": "113 113 122", // zinc-500
  card: "255 255 255", // white
  border: "228 228 231", // zinc-200
  destructive: "185 28 28", // red-700 (v3 KEPT) — the web's `text-red-700` on a red tint,
  // and what keeps the error banner at 4.5:1 in light mode
  // (red-600 on `bg-red-50` is 3.5:1 and fails AA). Its v4 value, 191 0 15, is
  // 1.6 ΔE away but reads 4.44:1 on the 18% tint three banners draw it on, so
  // it stays on the v3 shade until those tints move (themeFollowsSystem.test).
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
  info: "21 93 252", // blue-600 (v4) — the web's `text-blue-600` (Calendar/History
  // links); `text-blue-500` icons are one shade lighter on the web but share
  // this token rather than adding a second blue
  mindset: "152 16 250", // purple-600 (v4) — the web's Mindset streak icon
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
  "mind-violet": "141 86 255", // violet-500 (v4) — same in both modes, like `primary`
  "mind-green": "34 197 94", // green-500 — same in both modes
  "mind-ink": "24 24 27", // zinc-900 — same in both modes
  "mind-cyan": "6 182 212", // cyan-500 — State Shift's accent (NP-298), same in both modes
  "mind-blue": "59 130 246", // blue-500 — Mission's accent (NP-298), same in both modes
  "mind-emerald": "16 185 129", // emerald-500 — Vision's accent (NP-298), same in both modes
  "mind-pink": "236 72 153", // pink-500 — Social's accent (NP-298), same in both modes
  orange: "249 115 22", // orange-500 — the web's Circuit group badge
  // (`bg-orange-500`), same in both modes like `primary`
  indigo: "98 96 255", // indigo-500 (v4) — the web's Triset group badge
  rose: "255 35 87", // rose-500 (v4) — the web's Giant Set group badge
  amber: "251 191 36", // amber-400 — the streak card's progress bar, the
  // flat END of the web's `from-orange-500 to-amber-400` gradient
  // (`WorkoutSummary.tsx`), which carries no `dark:` variant either — same
  // value in both modes like `orange`, `indigo` and `rose` above (NP-334)
  purple: "152 16 250", // purple-600 (v4) — the web's `text-purple-600` / `bg-purple-100` (NP-353)
};

export const darkTokens: Record<TokenName, string> = {
  background: "10 10 10", // #0a0a0a, the app's first paint
  foreground: "255 255 255",
  primary: "255 255 255", // white — the web's `dark:bg-white` primary action
  "primary-foreground": "24 24 27", // zinc-900 — the web's `dark:text-black`
  brand: "251 44 54", // red-500 (v4) — the web's flat `bg-red-500` / `dark:text-red-500`
  "brand-foreground": "255 255 255", // white on red in both modes, like the web
  muted: "39 39 42", // zinc-800
  "muted-foreground": "161 161 170", // zinc-400
  card: "24 24 27", // zinc-900
  border: "39 39 42", // zinc-800
  destructive: "255 101 104", // red-400 (v4) — the web's `dark:text-red-400`
  "destructive-foreground": "24 24 27",
  accent: "251 191 36", // amber-400 — the web's `dark:text-amber-400`
  "accent-foreground": "24 24 27",
  success: "5 223 114", // green-400 (v4) — the web's `dark:text-green-400`
  teal: "20 184 166", // teal-500 — mode-invariant, see lightTokens.teal
  info: "86 162 255", // blue-400 (v4) — the web's `dark:text-blue-400`
  mindset: "191 126 255", // purple-400 (v4) — the web's `dark:text-purple-400 dark:bg-purple-900/30`
  // Same flat mood palette as light mode — see the comment on `lightTokens`.
  "mood-bad": "248 113 113",
  "mood-low": "251 146 60",
  "mood-okay": "251 191 36",
  "mood-good": "163 230 53",
  "mood-great": "52 211 153",
  "mind-violet": "141 86 255", // violet-500 (v4) — same in both modes, like `primary`
  "mind-green": "34 197 94", // green-500 — same in both modes
  "mind-ink": "24 24 27", // zinc-900 — same in both modes
  "mind-cyan": "6 182 212", // cyan-500 — same in both modes
  "mind-blue": "59 130 246", // blue-500 — same in both modes
  "mind-emerald": "16 185 129", // emerald-500 — same in both modes
  "mind-pink": "236 72 153", // pink-500 — same in both modes
  orange: "249 115 22", // orange-500 — same in both modes
  indigo: "98 96 255", // indigo-500 (v4) — same in both modes
  rose: "255 35 87", // rose-500 (v4) — same in both modes
  amber: "251 191 36", // amber-400 — same in both modes, see lightTokens.amber
  purple: "191 126 255", // purple-400 (v4) — the web's `dark:text-purple-400 dark:bg-purple-900/30` (NP-353)
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
 * THE TWO MIND ACCENTS THE WEB WRITES AS HEX, WHERE THE TOKEN IS A v4 CLASS.
 *
 * `ToolIntroGate.tsx`'s `ACCENTS` (and `SelfImageDashboard` / `DisciplineDashboard`)
 * paint self-image `#8b5cf6` and discipline `#ef4444` as literals, i.e. the v3
 * shades exactly. The tokens that used to stand in for them — `mind-violet` and
 * the dark `brand` — are `violet-500` / `red-500` CLASSES elsewhere on the web
 * and are v4 now, so `lib/mind/accents.ts` reads these instead for those two.
 */
export const mindAccentLiterals = {
  /** `#8b5cf6` — self-image, and `ToolIntroGate`'s default accent */
  violet: "139 92 246",
  /** `#ef4444` — discipline */
  red: "239 68 68",
} as const;

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
  /**
   * violet-600 (v4) — the web's `from-violet-600` on The Becoming door's unread
   * gradient (`bg-gradient-to-br from-violet-600 to-violet-500`,
   * `doorClassName` in `webapp/components/dashboard/BecomingDoor.tsx`).
   * The door is white ink on violet in both modes, like the stage it opens,
   * so this lives with the stage's own always-dark triplets rather than as a
   * full theme token.
   */
  doorVioletFrom: "127 34 254",
  /**
   * violet-300 — the web's `border-violet-300/60`, the Horizon card's dashed
   * border while it is the focused card (NP-344)
   */
  horizonRing: "196 181 253",
  /** the web's `#ffd37a` — the "new high" ring */
  gold: "255 211 122",
  /** violet-600 and emerald-500 — the two radial washes of the web's ambient sky */
  skyViolet: "124 58 237",
  skyEmerald: "16 185 129",
  /** white ink, the dark palette's foreground */
  ink: darkTokens.foreground,
  /** black — the web's `bg-black/25` chip on a compact week tile (NP-345) */
  shade: "0 0 0",
} as const;

/** `rgb(r g b)` for a triplet, or `rgba(r, g, b, a)` when an alpha is given. */
export function rgbOf(triplet: string, alpha = 1): string {
  if (alpha >= 1) return `rgb(${triplet})`;
  const [r, g, b] = triplet.split(" ");
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * A TOKEN FOR A SKIA CANVAS: always `rgba(r, g, b, a)`, commas and all.
 *
 * `@shopify/react-native-skia` does not hand a colour string to React Native's
 * parser; it parses it itself, with a CSS colour parser that reads the comma
 * form (`rgb(r, g, b)`, `rgba(…)`, `hsl(…)`, hex, names) and NOT the CSS Color
 * 4 space form `rgb(r g b)` that `rgbOf` writes for a solid colour. A string
 * it cannot parse is painted BLACK — which is exactly what the Becoming
 * stage's Horizon segment and ring were on the S23 and the iOS simulator
 * (NP-344): asked for violet-400, drawn in black, while the alpha'd area fill
 * beside them (already `rgba(…, 0.22)`) came out right.
 *
 * Every colour the stage's canvas is given goes through this, so the whole
 * canvas speaks a form Skia reads. React Native's own views keep `rgbOf`.
 */
export function skiaRgbOf(triplet: string, alpha = 1): string {
  const [r, g, b] = triplet.split(" ");
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * THE STOPS THE WEB'S GRADIENTS USE THAT NO THEME TOKEN IS (gradients port).
 *
 * The web paints its green CTAs, progress bars and completion badges as
 * `from-green-500 to-emerald-600`-style gradients with NO `dark:` variant, so
 * every stop is the same in both modes and none of them is a surface token.
 * Where a stop already is one (`mind-green` = green-500, `mind-emerald` =
 * emerald-500, `mind-violet` = violet-500, `amber` = amber-400) the call site
 * reads the token; these are only the shades native had no name for. Triplets,
 * like `becomingStageTokens`, so alpha composes through `rgbOf`.
 */
export const webGradientTokens = {
  /** green-600 — the web's `from-green-600` on the quick session's Start CTA */
  green600: "22 163 74",
  /** green-400 (v4) — the web's `from-green-400` on the program progress bar */
  green400: "5 223 114",
  /** emerald-400 (v4) — the web's `to-emerald-400` on the program progress bar */
  emerald400: "0 210 148",
  /** emerald-500 (v4) — the web's `from-emerald-500` on ResumeWorkoutPill and CalorieRing */
  emerald500: "0 185 129",
  /** emerald-600 (v4) — the web's `to-emerald-600` on Start / Continue / Finish */
  emerald600: "0 150 105",
  /** teal-600 (v4) — the web's `dark:to-teal-600` on ResumeWorkoutPill */
  teal600: "0 148 136",
  /** amber-500 (v4) — the web's `to-amber-500` / `from-amber-500` stops */
  amber500: "246 158 0",
  /** amber-200 (v4) — the web's `text-amber-200` on BecomingDoor loud-state warnings */
  amber200: "254 230 133",
  /** red-500 (v4) — the web's `from-red-500` on the Challenge scene's badge */
  red500: "251 44 54",
  /** sky-500 (v4) — the web's `from-sky-500` on the Assemble scene's badge */
  sky500: "0 165 234",
  /** orange-600 (v4) — the web's `text-orange-600` on Super Streak light badge */
  orange600: "236 86 0",
  /** orange-400 (v4) — the web's `dark:text-orange-400` / `fill-orange-400` */
  orange400: "255 139 31",
  /** lime-100 (v4) — the web's `bg-lime-100` on MoodCard PrettyGood */
  lime100: "236 252 202",
  /** lime-300 (v4) — the web's `dark:text-lime-300` on MoodCard PrettyGood */
  lime300: "187 244 81",
  /** lime-400 (v4) — the web's `fill-lime-400` on MoodCard PrettyGoodFace */
  lime400: "157 229 0",
  /** lime-500 (v4) — the web's `bg-lime-500` on MoodCard trend bar */
  lime500: "131 204 0",
  /** lime-700 (v4) — the web's `text-lime-700` on MoodCard PrettyGood */
  lime700: "75 124 0",
  /** lime-900 (v4) — the web's `dark:bg-lime-900/30` on MoodCard PrettyGood */
  lime900: "53 83 14",
  /** emerald-100 (v4) — the web's `bg-emerald-100` on MoodCard Great */
  emerald100: "208 250 229",
  /** emerald-300 (v4) — the web's `dark:text-emerald-300` on MoodCard Great */
  emerald300: "94 233 181",
  /** emerald-700 (v4) — the web's `text-emerald-700` on MoodCard Great */
  emerald700: "0 120 87",
  /** emerald-900 (v4) — the web's `dark:bg-emerald-900/30` on MoodCard Great */
  emerald900: "0 78 59",
  /** amber-100 (v4) — the web's `bg-amber-100` */
  amber100: "254 243 198",
  /** amber-300 (v4) — the web's `dark:text-amber-300` */
  amber300: "255 210 55",
  /** amber-700 (v4) — the web's `text-amber-700` */
  amber700: "181 82 0",
  /** amber-900 (v4) — the web's `dark:bg-amber-900/30` */
  amber900: "123 51 6",
  /** orange-100 (v4) — the web's `bg-orange-100` */
  orange100: "255 237 213",
  /** orange-300 (v4) — the web's `dark:text-orange-300` */
  orange300: "255 185 112",
  /** orange-700 (v4) — the web's `text-orange-700` */
  orange700: "196 62 0",
  /** orange-900 (v4) — the web's `dark:bg-orange-900/30` */
  orange900: "126 42 12",
  /** red-100 (v4) — the web's `bg-red-100` */
  red100: "255 226 226",
  /** red-300 (v4) — the web's `dark:text-red-300` */
  red300: "255 163 164",
  /** red-700 (v4) — the web's `text-red-700` */
  red700: "191 0 15",
  /** red-900 (v4) — the web's `dark:bg-red-900/30` */
  red900: "130 24 26",
  /** green-100 (v4) — the web's `bg-green-100` */
  green100: "220 252 231",
  /** green-900 (v4) — the web's `dark:bg-green-900/30` */
  green900: "13 84 43",
  /** blue-100 (v4) — the web's `bg-blue-100` */
  blue100: "219 234 254",
  /** blue-900 (v4) — the web's `dark:bg-blue-900/30` */
  blue900: "28 57 142",
  /** purple-100 (v4) — the web's `bg-purple-100` */
  purple100: "243 232 255",
  /** purple-500 (v4) — the web's `bg-purple-500` */
  purple500: "171 78 255",
  /** purple-900 (v4) — the web's `dark:bg-purple-900/30` */
  purple900: "89 22 139",
  /** violet-100 (v4) — the web's `bg-violet-100` */
  violet100: "237 233 254",
  /** violet-300 (v4) — the web's `dark:text-violet-300` */
  violet300: "196 180 255",
  /** violet-900 (v4) — the web's `dark:bg-violet-900/30` */
  violet900: "77 23 154",
  /** zinc-300 (v4) — the web's `bg-zinc-300` / `dark:text-zinc-300` */
  zinc300: "212 212 216",
  /** zinc-400 (v4) — the web's `text-zinc-400` / `bg-zinc-400` */
  zinc400: "159 159 169",
  /** zinc-500 (v4) — the web's `dark:text-zinc-500` / `dark:bg-zinc-500` */
  zinc500: "113 113 123",
  /** zinc-600 (v4) — the web's `text-zinc-600` / `dark:text-zinc-600` */
  zinc600: "82 82 92",
  /** zinc-700 (v4) — the web's `dark:bg-zinc-700` / `fill-zinc-700` */
  zinc700: "63 63 70",
  /** black — the web's `from-black/…` photo scrims */
  black: "0 0 0",
} as const;

/**
 * OKLAB-SAMPLED RAMPS for the web's gradients that cross hues (gradient parity, F3).
 *
 * Tailwind v4 compiles `bg-gradient-to-*` to `linear-gradient(… in oklab, …)`,
 * so the web blends in oklab. `expo-linear-gradient` blends in sRGB, which for
 * two ADJACENT shades is under 0.3 ΔE of the same ramp but for violet → green
 * or amber → green is 3.9 to 5.0 ΔE mid-ramp (the native badge reads greyer or
 * darker than the web's). A multi-stop sRGB ramp reproduces the oklab one: each
 * ramp is the two end colours blended at t = 0, ¼, ½, ¾, 1 IN OKLAB (Ottosson's
 * matrices, linear-light sRGB in, clamped and gamma-encoded out) and rounded to
 * 8-bit. `expo-linear-gradient` spaces five colours evenly, which is those
 * five t values. The ends are the Tailwind colours named below, so the first
 * and last entries equal the plain tokens (`webGradientRamps.test.ts` re-derives
 * every ramp from the ends and fails if a token moves without the ramp).
 * Triplets, like the tokens, so alpha composes through `rgbOf`.
 */
export const webGradientRamps = {
  /** violet-500 → green-500 (Type, WriteAffirm) */
  violetToGreen: [
    "141 86 255",
    "125 126 222",
    "106 154 186",
    "81 177 146",
    "34 197 94",
  ],
  /** amber-500 → green-500 (Win, Vision) */
  amberToGreen: [
    "246 158 0",
    "212 171 45",
    "173 182 66",
    "125 190 81",
    "34 197 94",
  ],
  /** red-500 → amber-500 (Challenge) */
  redToAmber: [
    "251 44 54",
    "251 84 49",
    "251 112 41",
    "249 136 29",
    "246 158 0",
  ],
  /** sky-500 → green-500 (Assemble) */
  skyToGreen: [
    "0 165 234",
    "0 175 204",
    "0 184 172",
    "12 191 137",
    "34 197 94",
  ],
} as const;

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
