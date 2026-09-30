import expo from "eslint-config-expo/flat.js";

export default [
  ...expo,
  {
    // GEIST OR NOTHING (NP-160). React Native has no cascade: a `<Text>` from
    // `react-native` with no `fontFamily` renders in the system font, whatever
    // `tailwind.config.js` says. `components/Text.tsx` is the app's Text and it
    // carries the face; this is what stops the next screen from drifting back
    // to San Francisco / Roboto without anybody noticing.
    files: [
      "app/**/*.tsx",
      "app/**/*.ts",
      "components/**/*.tsx",
      "components/**/*.ts",
      "lib/**/*.tsx",
      "lib/**/*.ts",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "react-native",
              importNames: ["Text"],
              message:
                'Import Text from "@/components/Text" — it carries the Geist face (NP-160).',
            },
          ],
        },
      ],
      // NO COLOUR LITERALS (NP-123). The app was dark-only because 43 `#0a0a0a`
      // literals sat in plain RN styles while the classes beside them followed
      // the system colour scheme, so a light-mode phone drew light-mode text on
      // hard-coded dark surfaces. A hex has ONE value; a token has two.
      // `__tests__/noHexColorLiterals.test.ts` is the same ban in CI.
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "Literal[value=/^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/]",
          message:
            "No hex colours (NP-123): use a Tailwind class (bg-background) or useThemeTokens() — a literal cannot follow the system light/dark setting.",
        },
        {
          selector: "Literal[value=/^rgba?\\(/]",
          message:
            "No hand-written rgb()/rgba() (NP-123): the two palettes live in lib/theme/tokens.ts — reach them through useThemeTokens().",
        },
      ],
    },
  },
  {
    // THE ONE FILE ALLOWED TO WRITE A COLOUR DOWN. It is the two palettes and
    // the scrim, as RGB triplets and one rgba() per mode; `useThemeTokens()`
    // hands them to everything else. Banning literals here would be banning the
    // token file.
    files: ["lib/theme/tokens.ts"],
    rules: {
      "no-restricted-syntax": "off",
    },
  },
  {
    // Manual mocks for Node modules run under Jest, so `jest` is in scope here
    // exactly as it is inside `__tests__`.
    files: ["__mocks__/**/*.js"],
    languageOptions: {
      globals: {
        jest: "readonly",
      },
    },
  },
  {
    // Build-time scripts run on Node, not on the phone: they are the only
    // files here allowed to reach for `console` and `process`.
    files: ["scripts/**/*.mjs"],
    languageOptions: {
      sourceType: "module",
      globals: {
        Buffer: "readonly",
        console: "readonly",
        process: "readonly",
      },
    },
  },
  {
    ignores: [
      "node_modules/**",
      ".expo/**",
      "dist/**",
      "coverage/**",
      "babel.config.js",
      "metro.config.js",
      "tailwind.config.js",
    ],
  },
];
