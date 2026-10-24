const colors = require("tailwindcss/colors");

// Tailwind v4 default palette (`tailwindcss/theme.css` oklch stops gamut-mapped
// to sRGB at constant L and H), so utility classes in `expo/` (`bg-emerald-500`,
// `text-purple-600`, `bg-amber-400`, etc.) match `webapp/`'s Tailwind v4 output
// instead of `tailwindcss@3.4`'s v3 palette.
const v4Colors = {
  red: { 50: "#fef2f2", 100: "#ffe2e2", 200: "#ffcaca", 300: "#ffa3a4", 400: "#ff6568", 500: "#fb2c36", 600: "#e40016", 700: "#bf000f", 800: "#9f0712", 900: "#82181a", 950: "#460809" },
  orange: { 50: "#fff7ed", 100: "#ffedd5", 200: "#ffd7a8", 300: "#ffb970", 400: "#ff8b1f", 500: "#fc7100", 600: "#ec5600", 700: "#c43e00", 800: "#9f2d00", 900: "#7e2a0c", 950: "#441306" },
  amber: { 50: "#fffbeb", 100: "#fef3c6", 200: "#fee685", 300: "#ffd237", 400: "#fabc00", 500: "#f69e00", 600: "#da7700", 700: "#b55200", 800: "#953d00", 900: "#7b3306", 950: "#461901" },
  yellow: { 50: "#fefce8", 100: "#fef9c2", 200: "#fff085", 300: "#ffe030", 400: "#f7c900", 500: "#eab300", 600: "#ca8a00", 700: "#a26200", 800: "#874c00", 900: "#733e0a", 950: "#432004" },
  lime: { 50: "#f7fee7", 100: "#ecfcca", 200: "#d8f999", 300: "#bbf451", 400: "#9de500", 500: "#83cc00", 600: "#64a300", 700: "#4b7c00", 800: "#3d6300", 900: "#35530e", 950: "#192e03" },
  green: { 50: "#f0fdf4", 100: "#dcfce7", 200: "#b9f8cf", 300: "#7bf1a8", 400: "#05df72", 500: "#00c65a", 600: "#00a447", 700: "#00813a", 800: "#016630", 900: "#0d542b", 950: "#032e15" },
  emerald: { 50: "#ecfdf5", 100: "#d0fae5", 200: "#a4f4cf", 300: "#5ee9b5", 400: "#00d294", 500: "#00b981", 600: "#009669", 700: "#007857", 800: "#005f46", 900: "#004e3b", 950: "#002c22" },
  teal: { 50: "#f0fdfa", 100: "#cbfbf1", 200: "#96f7e4", 300: "#46ecd5", 400: "#00d3bd", 500: "#00b9a6", 600: "#009488", 700: "#00776e", 800: "#005f5a", 900: "#0b4f4a", 950: "#022f2e" },
  cyan: { 50: "#ecfeff", 100: "#cefafe", 200: "#a2f4fd", 300: "#53eafd", 400: "#00d1ec", 500: "#00b6d4", 600: "#0091b3", 700: "#007491", 800: "#005f78", 900: "#104e64", 950: "#053345" },
  sky: { 50: "#f0f9ff", 100: "#dff2fe", 200: "#b8e6fe", 300: "#78d4ff", 400: "#00bbfd", 500: "#00a5ea", 600: "#0084c7", 700: "#0069a2", 800: "#005986", 900: "#024a70", 950: "#052f4a" },
  blue: { 50: "#eff6ff", 100: "#dbeafe", 200: "#bedbff", 300: "#91c5ff", 400: "#56a2ff", 500: "#3280ff", 600: "#155dfc", 700: "#1447e6", 800: "#193cb8", 900: "#1c398e", 950: "#162456" },
  indigo: { 50: "#eef2ff", 100: "#e0e7ff", 200: "#c7d2ff", 300: "#a4b4ff", 400: "#7d87ff", 500: "#6260ff", 600: "#4f39f6", 700: "#432dd7", 800: "#372aac", 900: "#312c85", 950: "#1e1a4d" },
  violet: { 50: "#f5f3ff", 100: "#ede9fe", 200: "#ddd6ff", 300: "#c4b4ff", 400: "#a686ff", 500: "#8d56ff", 600: "#7f22fe", 700: "#7008e7", 800: "#5d0ec0", 900: "#4d179a", 950: "#2f0d68" },
  purple: { 50: "#faf5ff", 100: "#f3e8ff", 200: "#e9d5ff", 300: "#d8b4ff", 400: "#bf7eff", 500: "#ab4eff", 600: "#9810fa", 700: "#8200d9", 800: "#6e11b0", 900: "#59168b", 950: "#3c0366" },
  fuchsia: { 50: "#fdf4ff", 100: "#fae8ff", 200: "#f6cfff", 300: "#f2a9ff", 400: "#ec6dff", 500: "#e12afb", 600: "#c500da", 700: "#a600b4", 800: "#8a0194", 900: "#721378", 950: "#4b004f" },
  pink: { 50: "#fdf2f8", 100: "#fce7f3", 200: "#fccee8", 300: "#fda5d5", 400: "#fb64b6", 500: "#f6339a", 600: "#e30076", 700: "#c2005c", 800: "#a2004c", 900: "#861043", 950: "#510424" },
  rose: { 50: "#fff1f2", 100: "#ffe4e6", 200: "#ffccd3", 300: "#ffa3ae", 400: "#ff6880", 500: "#ff2357", 600: "#e60045", 700: "#c1003a", 800: "#a30037", 900: "#8b0836", 950: "#4d0218" },
};

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,jsx,ts,tsx}",
    "./components/**/*.{js,jsx,ts,tsx}",
  ],
  presets: [require("nativewind/preset")],
  darkMode: "class",
  theme: {
    extend: {
      // The web's two families — `body` Arial (`webapp/app/globals.css`) and
      // `font-mono` Geist Mono — named here as the faces the app draws.
      // `font-sans` is the iOS regular only: the real per-platform resolution
      // (ArialMT on iOS, bundled Arimo on Android) lives in
      // `lib/theme/fonts.ts` and is applied inline by `components/Text.tsx`,
      // which outranks these (NativeWind: inline beats className) — that is
      // how `font-mono font-bold` resolves to one face.
      fontFamily: {
        sans: ["ArialMT"],
        mono: ["GeistMono-Regular"],
      },
      colors: {
        ...v4Colors,
        neutral: colors.zinc,
        slate: colors.zinc,
        gray: colors.zinc,
        background: "rgb(var(--background) / <alpha-value>)",
        foreground: "rgb(var(--foreground) / <alpha-value>)",
        primary: {
          DEFAULT: "rgb(var(--primary) / <alpha-value>)",
          foreground: "rgb(var(--primary-foreground) / <alpha-value>)",
        },
        // The web's red, which is an EXCEPTION and not the base colour
        // (NP-313): the unread notification badge and the other `bg-red-500` /
        // `text-red-600` accents. Error text and destructive surfaces keep
        // using `destructive`.
        brand: {
          DEFAULT: "rgb(var(--brand) / <alpha-value>)",
          foreground: "rgb(var(--brand-foreground) / <alpha-value>)",
        },
        muted: {
          DEFAULT: "rgb(var(--muted) / <alpha-value>)",
          foreground: "rgb(var(--muted-foreground) / <alpha-value>)",
        },
        destructive: {
          DEFAULT: "rgb(var(--destructive) / <alpha-value>)",
          foreground: "rgb(var(--destructive-foreground) / <alpha-value>)",
        },
        accent: {
          DEFAULT: "rgb(var(--accent) / <alpha-value>)",
          foreground: "rgb(var(--accent-foreground) / <alpha-value>)",
        },
        card: "rgb(var(--card) / <alpha-value>)",
        border: "rgb(var(--border) / <alpha-value>)",
        success: "rgb(var(--success) / <alpha-value>)",
        teal: {
          DEFAULT: "rgb(var(--teal) / <alpha-value>)",
          ...v4Colors.teal,
        },
        info: "rgb(var(--info) / <alpha-value>)",
        mindset: "rgb(var(--mindset) / <alpha-value>)",
        "mood-bad": "rgb(var(--mood-bad) / <alpha-value>)",
        "mood-low": "rgb(var(--mood-low) / <alpha-value>)",
        "mood-okay": "rgb(var(--mood-okay) / <alpha-value>)",
        "mood-good": "rgb(var(--mood-good) / <alpha-value>)",
        "mood-great": "rgb(var(--mood-great) / <alpha-value>)",
        "mind-violet": "rgb(var(--mind-violet) / <alpha-value>)",
        "mind-green": "rgb(var(--mind-green) / <alpha-value>)",
        "mind-ink": "rgb(var(--mind-ink) / <alpha-value>)",
        "mind-cyan": "rgb(var(--mind-cyan) / <alpha-value>)",
        "mind-blue": "rgb(var(--mind-blue) / <alpha-value>)",
        "mind-emerald": "rgb(var(--mind-emerald) / <alpha-value>)",
        "mind-pink": "rgb(var(--mind-pink) / <alpha-value>)",
        orange: {
          DEFAULT: "rgb(var(--orange) / <alpha-value>)",
          ...v4Colors.orange,
        },
        indigo: {
          DEFAULT: "rgb(var(--indigo) / <alpha-value>)",
          ...v4Colors.indigo,
        },
        rose: {
          DEFAULT: "rgb(var(--rose) / <alpha-value>)",
          ...v4Colors.rose,
        },
        amber: {
          DEFAULT: "rgb(var(--amber) / <alpha-value>)",
          ...v4Colors.amber,
        },
        purple: {
          DEFAULT: "rgb(var(--purple) / <alpha-value>)",
          ...v4Colors.purple,
        },
      },
    },
  },
  plugins: [],
};
