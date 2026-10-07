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
        teal: {
          DEFAULT: "rgb(var(--teal) / <alpha-value>)",
          50: "#f0fdfa",
          100: "#ccfbf1",
          200: "#99f6e4",
          300: "#5eead4",
          400: "#2dd4bf",
          500: "#14b8a6",
          600: "#0d9488",
          700: "#0f766e",
          800: "#115e59",
          900: "#134e4a",
          950: "#042f2e",
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
          50: "#fff7ed",
          100: "#ffedd5",
          200: "#fed7aa",
          300: "#fdba74",
          400: "#fb923c",
          500: "#f97316",
          600: "#ea580c",
          700: "#c2410c",
          800: "#9a3412",
          900: "#7c2d12",
          950: "#431407",
        },
        indigo: {
          DEFAULT: "rgb(var(--indigo) / <alpha-value>)",
          50: "#eef2ff",
          100: "#e0e7ff",
          200: "#c7d2fe",
          300: "#a5b4fc",
          400: "#818cf8",
          500: "#6366f1",
          600: "#4f46e5",
          700: "#4338ca",
          800: "#3730a3",
          900: "#312e81",
          950: "#1e1b4b",
        },
        rose: {
          DEFAULT: "rgb(var(--rose) / <alpha-value>)",
          50: "#fff1f2",
          100: "#ffe4e6",
          200: "#fecdd3",
          300: "#fda4af",
          400: "#fb7185",
          500: "#f43f5e",
          600: "#e11d48",
          700: "#be123c",
          800: "#9f1239",
          900: "#881337",
          950: "#4c0519",
        },
        amber: {
          DEFAULT: "rgb(var(--amber) / <alpha-value>)",
          50: "#fffbeb",
          100: "#fef3c7",
          200: "#fde68a",
          300: "#fcd34d",
          400: "#fbbf24",
          500: "#f59e0b",
          600: "#d97706",
          700: "#b45309",
          800: "#92400e",
          900: "#78350f",
          950: "#451a03",
        },
      },
    },
  },
  plugins: [],
};
