import expo from "eslint-config-expo/flat.js";

export default [
  ...expo,
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
