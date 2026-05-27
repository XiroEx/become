import expo from "eslint-config-expo/flat.js";

export default [
  ...expo,
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
