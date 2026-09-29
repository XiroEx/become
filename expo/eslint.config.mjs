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
