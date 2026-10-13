/**
 * DYNAMIC TYPE — the sizes the app has to survive, and the one style rule that
 * makes it survive them.
 *
 * `allowFontScaling` defaults to TRUE in React Native, so every `<Text>` in the
 * app already grows with "Settings → Display & Brightness → Text Size" and the
 * Accessibility sizes beyond it. Nothing here turns that on. What breaks at the
 * largest size is LAYOUT, and it breaks in exactly one way often enough to be
 * worth a name: a `<Text>` inside a flex ROW does not wrap, because React
 * Native's `flexShrink` defaults to 0 — the text keeps its intrinsic width and
 * runs off the end of its container, which is what "the label is cut off"
 * always turns out to be.
 *
 * So: a Text in a row gets `WRAPPABLE_TEXT`, and a row of controls that cannot
 * wrap gets `flex: 1` wrappers so each one owns a share of the width. Neither
 * caps the size — capping is the fix that makes the screenshot pass and the
 * member squint.
 */

/**
 * iOS's largest accessibility text size (AX5): 53pt body against the 17pt
 * default. This is the multiplier the accessibility suite renders the v1 screens
 * at, and the size the device QA pass sets in Accessibility → Display & Text
 * Size → Larger Text with "Larger Accessibility Sizes" on.
 */
export const LARGEST_DYNAMIC_TYPE_SCALE = 3.12;

/**
 * Android's largest: the Font size slider alone reaches 1.3, and with Display
 * size at its largest the effective font scale reaches ~2.0.
 */
export const LARGEST_ANDROID_FONT_SCALE = 2.0;

/**
 * The style a `<Text>` needs to WRAP instead of overflow when it sits inside a
 * flex row (`flexShrink` is 0 by default in React Native, unlike CSS's 1).
 */
export const WRAPPABLE_TEXT: { flexShrink: number } = Object.freeze({
  flexShrink: 1,
});
