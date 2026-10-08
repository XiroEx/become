/**
 * THE STAGE'S OWN WORDS (NP-349) — the opening's title block and the
 * overview HUD, set the way the web sets them, as numbers.
 *
 * Review of NP-204 on 10/8 (build 763bc68b: the web at 390 × 844 against the
 * S23 and the iOS simulator): every identity line on the web's stage is
 * `font-serif italic` — the intro title's quote, the overview HUD, the
 * Horizon card and the focused card's whisper — and native set all four in
 * Geist italic, which reads as a different product. The Horizon and the
 * whisper take the serif through `horizonCard.ts` / `focusedCard.ts`; this
 * module is the other two, and the title they sit under, pure, so the test
 * can hold them to the web's
 * (`webapp/components/becoming/journey/JourneyCanvas.tsx`):
 *
 *   The Becoming         text-[11px] font-semibold uppercase tracking-[0.35em] text-white/60
 *   Who am I becoming?   mt-2 text-4xl font-black tracking-tight
 *                        — 36px on a 40px line, −0.025em, 900, inside the block's `px-8`
 *   “<identity>”         mx-auto mt-4 max-w-sm font-serif text-base italic text-white/75 line-clamp-3
 *                        — 16px on a 24px line, 384 wide at most, three lines
 *
 *   HUD “<identity>”     mx-auto max-w-md font-serif text-[15px] italic leading-snug text-white/85 line-clamp-2
 *                        — 15px, snug (1.375), 448 wide at most, two lines
 *
 * The serif itself is `SERIF_FONT_FAMILY` (`lib/theme/fonts.ts`): the
 * platform's, since nothing serif is bundled — ONE constant for all four
 * lines, so the stage cannot drift into four serifs.
 */

import { SERIF_FONT_FAMILY } from "@/lib/theme/fonts";

// ── The web's `font-serif italic`, at a size ───────────────────────────────

export interface SerifItalicType {
  fontFamily: string;
  fontStyle: "italic";
  fontSize: number;
  lineHeight: number;
}

/** The platform serif, italic, at `fontSize` on a `lineHeight` line — what every identity line is made of. */
export function serifItalic(fontSize: number, lineHeight: number): SerifItalicType {
  return { fontFamily: SERIF_FONT_FAMILY, fontStyle: "italic", fontSize, lineHeight };
}

// ── The intro title ────────────────────────────────────────────────────────

/** `text-4xl`: 36px on a 40px line. */
export const TITLE_FONT_SIZE = 36;
export const TITLE_LINE_HEIGHT = 40;
/** `tracking-tight`: −0.025em of a 36px face. */
export const TITLE_TRACKING = -0.025 * TITLE_FONT_SIZE;
/**
 * `font-black`. The heaviest Geist bundled is Bold — NP-160 snaps 900 to
 * 700 (`nearestGeistWeight`) — so the face drawn is `Geist-Bold`. Size,
 * tracking and measure are the web's, and at a phone's width the title
 * wraps where the web's does: "Who am I becoming?" runs ~351 px in Geist
 * Bold at 36 / −0.9 (the web's Black, ~363), both past the 326 px a 390-wide
 * phone leaves inside `px-8`.
 */
export const TITLE_FONT_WEIGHT = "900" as const;
/** `mt-2` under the kicker. */
export const TITLE_GAP = 8;
/** The block's `px-8`: the measure the title wraps in. */
export const TITLE_BLOCK_PADDING = 32;

export interface IntroTitleType {
  fontSize: number;
  lineHeight: number;
  letterSpacing: number;
  fontWeight: typeof TITLE_FONT_WEIGHT;
}

export function introTitleType(): IntroTitleType {
  return { fontSize: TITLE_FONT_SIZE, lineHeight: TITLE_LINE_HEIGHT, letterSpacing: TITLE_TRACKING, fontWeight: TITLE_FONT_WEIGHT };
}

// ── The intro title's quote ────────────────────────────────────────────────

/** `text-base`: 16px on a 24px line. */
export const INTRO_QUOTE_FONT_SIZE = 16;
export const INTRO_QUOTE_LINE_HEIGHT = 24;
/** `max-w-sm`. */
export const INTRO_QUOTE_MAX_WIDTH = 384;
/** `text-white/75`. */
export const INTRO_QUOTE_ALPHA = 0.75;
/** `line-clamp-3`. */
export const INTRO_QUOTE_LINES = 3;
/** `mt-4` under the title. */
export const INTRO_QUOTE_GAP = 16;

export function introQuoteType(): SerifItalicType {
  return serifItalic(INTRO_QUOTE_FONT_SIZE, INTRO_QUOTE_LINE_HEIGHT);
}

// ── The overview HUD's identity ────────────────────────────────────────────

/** `text-[15px]`. */
export const HUD_IDENTITY_FONT_SIZE = 15;
/** `leading-snug`. */
export const HUD_IDENTITY_LEADING = 1.375;
/** `max-w-md`. */
export const HUD_IDENTITY_MAX_WIDTH = 448;
/** `text-white/85`. */
export const HUD_IDENTITY_ALPHA = 0.85;
/** `line-clamp-2`. */
export const HUD_IDENTITY_LINES = 2;

export function hudIdentityType(): SerifItalicType {
  return serifItalic(HUD_IDENTITY_FONT_SIZE, HUD_IDENTITY_FONT_SIZE * HUD_IDENTITY_LEADING);
}
