/// <reference types="nativewind/types" />

// `app/_layout.tsx` imports `../global.css` — that is how NativeWind's Metro
// transformer finds the Tailwind entry. TypeScript 6 (the version Expo SDK 57
// expects) errors on a side-effect import with no type declarations (TS2882),
// so declare the shape: there isn't one.
declare module "*.css" {}
