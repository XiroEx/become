// `app/_layout.tsx` imports `../global.css` so NativeWind's Metro transformer
// can pick the Tailwind entry up. Jest has no CSS transformer, so importing the
// real file is a syntax error. Every test that renders the root layout only
// needs the import to resolve, not to do anything.
module.exports = {};
