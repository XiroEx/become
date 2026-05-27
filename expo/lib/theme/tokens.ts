/**
 * Semantic theme tokens — RGB triplets (space-separated, no commas, no rgb() wrapper).
 *
 * Mirrors the CSS variables in global.css so that:
 *   1. Tailwind / NativeWind resolve `bg-primary` to `rgb(var(--primary) / <alpha>)`.
 *   2. RN APIs that can't read Tailwind (StatusBar, Drawer screenOptions, lucide
 *      `color` prop, ActivityIndicator) can import these raw values.
 *
 * Per the nextjs-to-react-native skill: tokens stored as "R G B" so alpha composes
 * via the Tailwind `<alpha-value>` placeholder.
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
  | "accent-foreground";

export const lightTokens: Record<TokenName, string> = {
  background: "250 250 250",
  foreground: "24 24 27",
  primary: "239 68 68",
  "primary-foreground": "255 255 255",
  muted: "244 244 245",
  "muted-foreground": "113 113 122",
  card: "255 255 255",
  border: "228 228 231",
  destructive: "220 38 38",
  "destructive-foreground": "255 255 255",
  accent: "250 204 21",
  "accent-foreground": "24 24 27",
};

export const darkTokens: Record<TokenName, string> = {
  background: "10 10 10",
  foreground: "255 255 255",
  primary: "239 68 68",
  "primary-foreground": "255 255 255",
  muted: "39 39 42",
  "muted-foreground": "161 161 170",
  card: "24 24 27",
  border: "39 39 42",
  destructive: "248 113 113",
  "destructive-foreground": "24 24 27",
  accent: "250 204 21",
  "accent-foreground": "24 24 27",
};

export function getTokens(mode: ThemeMode): Record<TokenName, string> {
  return mode === "dark" ? darkTokens : lightTokens;
}

/**
 * Resolve a token to a CSS-compatible `rgb(r g b)` string for use in places
 * where NativeWind class strings aren't available.
 *
 * Example: `resolveToken("primary", "dark")` → `"rgb(239 68 68)"`.
 */
export function resolveToken(name: TokenName, mode: ThemeMode = "dark"): string {
  const triplet = getTokens(mode)[name];
  return `rgb(${triplet})`;
}
