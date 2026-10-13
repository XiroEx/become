import { Platform, StyleSheet } from "react-native";
import type { StyleProp, TextStyle } from "react-native";

/**
 * GEIST, THE WEB'S TYPEFACE, ON THE PHONE.
 *
 * `webapp/app/layout.tsx` loads `Geist` and `Geist_Mono` from
 * `next/font/google` and exposes them as `--font-geist-sans` /
 * `--font-geist-mono`, which `webapp/app/globals.css` feeds to Tailwind's
 * `--font-sans` / `--font-mono`. Native shipped with no font at all, so every
 * screen drew in San Francisco (iOS) or Roboto (Android) and the two clients
 * read differently side by side.
 *
 * THE ONE THING REACT NATIVE DOES NOT DO IS CASCADE. There is no `body` to
 * hang a family off: a `<Text>` with no `fontFamily` is the system font, full
 * stop. That is why the app owns its Text (`components/Text.tsx`) and why this
 * module — not a Tailwind class — decides the family.
 *
 * FOUR STATIC FACES PER FAMILY, NOT ONE VARIABLE FILE. The web gets every
 * weight from one variable font because a browser can synthesise the
 * intermediate instances. React Native cannot: `fontFamily` names ONE face on
 * both platforms, and a `fontWeight` that the named face does not have is
 * either ignored (iOS picks the closest face in the family, and a
 * runtime-registered font is a family of one) or faked (Android). So each
 * weight is its own file and its own family name, and `geistFontFamily()`
 * below is what turns `font-semibold` into `Geist-SemiBold`.
 *
 * The files are the same ones the web serves — Google Fonts' latin subset of
 * Geist v5 / Geist Mono v6, SIL Open Font License 1.1, `assets/fonts/OFL.txt`.
 */

/** The two families the web's Tailwind theme names: `sans` and `mono`. */
export type GeistFamily = "sans" | "mono";

/** The weights bundled as real faces. Everything else snaps to one of these. */
export type GeistWeight = 400 | 500 | 600 | 700;

export const GEIST_WEIGHTS: readonly GeistWeight[] = [400, 500, 600, 700];

/**
 * Family × weight → the font name the app registers with `expo-font` and asks
 * React Native for. The name is also the file name: `assets/fonts/<face>.ttf`.
 */
export const GEIST_FACES: Record<GeistFamily, Record<GeistWeight, string>> = {
  sans: {
    400: "Geist-Regular",
    500: "Geist-Medium",
    600: "Geist-SemiBold",
    700: "Geist-Bold",
  },
  mono: {
    400: "GeistMono-Regular",
    500: "GeistMono-Medium",
    600: "GeistMono-SemiBold",
    700: "GeistMono-Bold",
  },
};

/** Where the `.ttf` for a face lives, relative to this package's root. */
export function geistFontFile(face: string): string {
  return `assets/fonts/${face}.ttf`;
}

/**
 * The map handed to `useFonts()`. Every face is `require`d so Metro bundles the
 * file and EAS ships it inside the app — nothing is fetched at runtime.
 */
export const GEIST_FONTS: Record<string, number> = {
  "Geist-Regular": require("../../assets/fonts/Geist-Regular.ttf"),
  "Geist-Medium": require("../../assets/fonts/Geist-Medium.ttf"),
  "Geist-SemiBold": require("../../assets/fonts/Geist-SemiBold.ttf"),
  "Geist-Bold": require("../../assets/fonts/Geist-Bold.ttf"),
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

/** The nearest weight that exists as a file. 100-400 → 400, 800/900 → 700. */
export function nearestGeistWeight(weight: number | null | undefined): GeistWeight {
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
 */
export function geistFontFamily(
  className?: string,
  style?: StyleProp<TextStyle>,
): string {
  const flat = (StyleSheet.flatten(style) ?? {}) as TextStyle;
  const tokens = (className ?? "").split(/\s+/).filter(Boolean).map(baseToken);

  let family: GeistFamily = "sans";
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

  return GEIST_FACES[family][nearestGeistWeight(weight)];
}

// ── The web's third family: `font-serif` ───────────────────────────────────

/**
 * THE WEB'S `font-serif`, ON THE PHONE (NP-349).
 *
 * The web sets the member's own words — the Becoming stage's identity lines
 * — in Tailwind's serif stack, `ui-serif, Georgia, Cambria, "Times New
 * Roman", Times, serif`. Review of NP-204 on 10/8 found native setting every
 * one of them in Geist italic, which reads as a different product. Nothing
 * serif is bundled (the eight faces above are the lot), so this is the
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
 * `components/Text.tsx` lets a caller's own `fontFamily` win over the Geist
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
