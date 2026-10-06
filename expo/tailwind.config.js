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
      // The web's two families (`webapp/app/globals.css` maps
      // `--font-geist-sans` / `--font-geist-mono` onto Tailwind's `--font-sans`
      // / `--font-mono`), named here as the faces `expo-font` registers.
      //
      // A class can only name a FAMILY, and React Native's `fontFamily` names a
      // FACE, so `font-sans` / `font-mono` are the regular weights. The face for
      // a weight is picked by `lib/theme/fonts.ts` and applied inline by
      // `components/Text.tsx`, which outranks these (NativeWind: inline beats
      // className) — that is how `font-mono font-bold` resolves to one face.
      fontFamily: {
        sans: ["Geist-Regular"],
        mono: ["GeistMono-Regular"],
      },
      colors: {
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
        teal: "rgb(var(--teal) / <alpha-value>)",
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
        orange: "rgb(var(--orange) / <alpha-value>)",
        indigo: "rgb(var(--indigo) / <alpha-value>)",
        rose: "rgb(var(--rose) / <alpha-value>)",
      },
    },
  },
  plugins: [],
};
