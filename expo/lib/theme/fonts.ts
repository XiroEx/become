import { Platform, StyleSheet } from "react-native";
import type { StyleProp, TextStyle } from "react-native";

/**
 * ARIAL, THE WEB'S BODY TYPEFACE, ON THE PHONE.
 *
 * `webapp/app/globals.css` sets `body { font-family: Arial, Helvetica,
 * sans-serif; }` — unlayered, so it overrides redstyle's
 * `var(--font-geist-sans, …)`. On become.redbtn.io the computed body font is
 * Arial and no Geist face loads: everything sans on the web renders in Arial.
 * `font-mono` there is still Geist Mono (Tailwind's `font-mono` class sets the
 * family explicitly) and `font-serif` is the platform serif, so those two are
 * unchanged here. Native used to draw all sans text in Geist, which was the
 * visible mismatch across the whole app.
 *
 * THE ONE THING REACT NATIVE DOES NOT DO IS CASCADE. There is no `body` to
 * hang a family off: a `<Text>` with no `fontFamily` is the system font, full
 * stop. That is why the app owns its Text (`components/Text.tsx`) and why this
 * module — not a Tailwind class — decides the family.
 *
 * TWO SANS FACES PER PLATFORM, NOT ONE VARIABLE FILE. The web gets every
 * weight from one variable font because a browser can synthesise the
 * intermediate instances. React Native cannot: `fontFamily` names ONE face on
 * both platforms, and a `fontWeight` that the named face does not have is
 * either ignored (iOS picks the closest face in the family, and a
 * runtime-registered font is a family of one) or faked (Android). So each
 * platform's sans is two faces — regular and bold — and `appFontFamily()`
 * below snaps the weight the way a browser does with Arial, which ships only
 * 400 and 700: 100-500 → regular, 600-900 → bold. `font-medium` is regular;
 * `font-semibold` / `font-bold` / `font-extrabold` are bold.
 *
 * iOS ships Arial, so the faces are the system ones — `ArialMT` (regular)
 * and `Arial-BoldMT` (bold) — and nothing is bundled for it. Android has no
 * Arial, so it draws Arimo, the metric-compatible Arial clone: Google Fonts'
 * latin subset, SIL Open Font License 1.1 (`assets/fonts/Arimo-OFL.txt`),
 * registered with `expo-font` as `Arimo-Regular` / `Arimo-Bold`.
 * `sansFaceFor()` is a pure function of `os` so the mapping is testable
 * without mocking `Platform`, like `serifFontFamilyFor()` below.
 *
 * Mono keeps its four Geist Mono faces, exactly as before.
 */

/** The two families the app draws: the web body's sans, and mono. */
export type AppFamily = "sans" | "mono";

/** The weights bundled as real faces. Everything else snaps to one of these. */
export type MonoWeight = 400 | 500 | 600 | 700;

export const MONO_WEIGHTS: readonly MonoWeight[] = [400, 500, 600, 700];

/** iOS draws the web body's Arial straight from the system — nothing bundled. */
export const IOS_SANS_FACES = {
  regular: "ArialMT",
  bold: "Arial-BoldMT",
} as const;

/** Android draws Arimo, the metric-compatible Arial clone. */
export const ANDROID_SANS_FACES = {
  regular: "Arimo-Regular",
  bold: "Arimo-Bold",
} as const;

/** Mono is Geist Mono on both platforms, the web's `font-mono`, unchanged. */
export const MONO_FACES: Record<MonoWeight, string> = {
  400: "GeistMono-Regular",
  500: "GeistMono-Medium",
  600: "GeistMono-SemiBold",
  700: "GeistMono-Bold",
};

/** Where the `.ttf` for a face lives, relative to this package's root. */
export function geistFontFile(face: string): string {
  return `assets/fonts/${face}.ttf`;
}

/**
 * The map handed to `useFonts()`. Every file-backed face is `require`d so
 * Metro bundles it and the app ships it inside itself — nothing is fetched at
 * runtime. iOS's Arial faces are system fonts, so they are NOT here (there is
 * no file to bundle); Android's Arimo faces and the four Geist Mono faces are.
 */
export const GEIST_FONTS: Record<string, number> = {
  "Arimo-Regular": require("../../assets/fonts/Arimo-Regular.ttf"),
  "Arimo-Bold": require("../../assets/fonts/Arimo-Bold.ttf"),
  "GeistMono-Regular": require("../../assets/fonts/GeistMono-Regular.ttf"),
  "GeistMono-Medium": require("../../assets/fonts/GeistMono-Medium.ttf"),
  "GeistMono-SemiBold": require("../../assets/fonts/GeistMono-SemiBold.ttf"),
  "GeistMono-Bold": require("../../assets/fonts/GeistMono-Bold.ttf"),
};

/** Tailwind's own font-weight scale, as `tailwind.config.js` resolves it. */
const WEIGHT_BY_CLASS: Record<string, number> = {
  "font-thin": 100,
  "font-extralight": 200,
  "font-light": 300,
  "font-normal": 400,
  "font-medium": 500,
  "font-semibold": 600,
  "font-bold": 700,
  "font-extrabold": 800,
  "font-black": 900,
};

/** `bold` / `normal` are the two keywords React Native accepts beside 100-900. */
function weightFromStyleValue(value: TextStyle["fontWeight"]): number | null {
  if (value === undefined || value === null) return null;
  if (typeof value === "number") return value;
  if (value === "normal") return 400;
  if (value === "bold") return 700;
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

/** A browser with Arial, which ships only 400 and 700: 100-500 → 400, 600-900 → 700. */
export function nearestSansWeight(weight: number | null | undefined): 400 | 700 {
  if (weight === null || weight === undefined) return 400;
  return weight >= 600 ? 700 : 400;
}

/**
 * THE SANS FACE FOR A PLATFORM AND A WEIGHT — pure in `os`, like
 * `serifFontFamilyFor()` below, so the mapping is testable without mocking
 * `Platform`. iOS draws Arial; everything else draws the bundled Arimo.
 */
export function sansFaceFor(os: string, weight: number | null | undefined): string {
  const faces = os === "ios" ? IOS_SANS_FACES : ANDROID_SANS_FACES;
  return nearestSansWeight(weight) === 700 ? faces.bold : faces.regular;
}
/** The nearest mono weight that exists as a file. 100-400 → 400, 800/900 → 700. */
export function nearestGeistWeight(weight: number | null | undefined): MonoWeight {
  if (weight === null || weight === undefined) return 400;
  if (weight <= 450) return 400;
  if (weight <= 550) return 500;
  if (weight <= 650) return 600;
  return 700;
}

/** A className token minus its variants: `active:font-bold` → `font-bold`. */
function baseToken(token: string): string {
  const colon = token.lastIndexOf(":");
  return colon === -1 ? token : token.slice(colon + 1);
}

function isMonoFace(family: string | undefined): boolean {
  return typeof family === "string" && family.startsWith("GeistMono");
}

/**
 * THE FACE A `<Text>` SHOULD RENDER IN.
 *
 * Reads the same two things the web's CSS would: the family (`font-mono` vs
 * `font-sans`, or an explicit `fontFamily`) and the weight (`font-semibold`,
 * or an explicit `fontWeight`). An inline `style` wins over a class, because
 * that is NativeWind's own precedence — inline beats className
 * (`specificityCompare` in react-native-css-interop) — and the resolved face
 * is handed back as an inline style, so it wins over the `font-sans` /
 * `font-mono` families in `tailwind.config.js` rather than fighting them.
 *
 * `os` defaults to the running platform; pass it explicitly to resolve a face
 * for the other one (tests do). The caller's own `fontWeight` stays on the
 * style beside the resolved face, exactly as before — the face already carries
 * the weight, and stripping the style would change what Android does with it.
 */
export function appFontFamily(
  className?: string,
  style?: StyleProp<TextStyle>,
  os: string = Platform.OS,
): string {
  const flat = (StyleSheet.flatten(style) ?? {}) as TextStyle;
  const tokens = (className ?? "").split(/\s+/).filter(Boolean).map(baseToken);

  let family: AppFamily = "sans";
  for (const token of tokens) {
    if (token === "font-mono") family = "mono";
    else if (token === "font-sans") family = "sans";
  }
  if (isMonoFace(flat.fontFamily)) family = "mono";

  let weight: number | null = null;
  for (const token of tokens) {
    const fromClass = WEIGHT_BY_CLASS[token];
    if (fromClass !== undefined) weight = fromClass;
  }
  const fromStyle = weightFromStyleValue(flat.fontWeight);
  if (fromStyle !== null) weight = fromStyle;

  if (family === "mono") return MONO_FACES[nearestGeistWeight(weight)];
  return sansFaceFor(os, weight);
}

// ── The web's third family: `font-serif` ───────────────────────────────────

/**
 * THE WEB'S `font-serif`, ON THE PHONE (NP-349).
 *
 * The web sets the member's own words — the Becoming stage's identity lines
 * — in Tailwind's serif stack, `ui-serif, Georgia, Cambria, "Times New
 * Roman", Times, serif`. Review of NP-204 on 10/8 found native setting every
 * one of them in Geist italic, which reads as a different product. Nothing
 * serif is bundled (only the Arimo and Geist Mono faces above are), so this is the
 * PLATFORM's serif — which is also what the web's stack resolves to in each
 * phone's browser:
 *
 *   iOS      `Georgia`: the stack's first NAMED face, shipped with iOS.
 *            Safari's `ui-serif` is New York, but UIKit exposes New York
 *            only through a font descriptor's design, never under a name
 *            React Native's `fontFamily` can ask for (its PostScript names
 *            are private API — not for a store build).
 *   Android  `serif`: React Native's name for the system serif (Noto Serif),
 *            where Chrome on Android lands too, having none of the named
 *            faces.
 *
 * `components/Text.tsx` lets a caller's own `fontFamily` win over the sans
 * face it resolves, which is how a line opts into this. Every identity line
 * on the stage takes it from here — the intro title's quote and the overview
 * HUD (`lib/becoming/stageWords.ts`), the Horizon card
 * (`lib/becoming/horizonCard.ts`) and the focused card's whisper
 * (`lib/becoming/focusedCard.ts`) — so there is ONE serif, not four.
 */
export function serifFontFamilyFor(os: string): string {
  return os === "ios" ? "Georgia" : "serif";
}

export const SERIF_FONT_FAMILY: string = serifFontFamilyFor(Platform.OS);
