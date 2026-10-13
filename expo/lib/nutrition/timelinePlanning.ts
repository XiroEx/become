export type CellTint = "none" | "under" | "on" | "over";

export function tintForCalories(cals: number, goal?: number): CellTint {
  if (cals === 0) return "none";
  if (!goal || goal <= 0) return "none";
  const pct = cals / goal;
  if (pct < 0.8) return "under";
  if (pct <= 1.1) return "on";
  return "over";
}

export const TINT_BG_CLASSES: Record<CellTint, string> = {
  none: "",
  under: "bg-amber-500/10 dark:bg-amber-500/15",
  on: "bg-emerald-500/10 dark:bg-emerald-500/15",
  over: "bg-destructive/10 dark:bg-destructive/15",
};

export interface TagDotColors {
  solid: string;
  ring: string;
}

const TAG_DOT_COLORS: Record<string, TagDotColors> = {
  breakfast: { solid: "bg-amber-500", ring: "border-amber-500" },
  lunch: { solid: "bg-orange-500", ring: "border-orange-500" },
  dinner: { solid: "bg-indigo-500", ring: "border-indigo-500" },
  snack: { solid: "bg-emerald-500", ring: "border-emerald-500" },
};

const DEFAULT_TAG_DOT: TagDotColors = {
  solid: "bg-muted-foreground",
  ring: "border-muted-foreground",
};

export function tagDotColors(tag: string): TagDotColors {
  return TAG_DOT_COLORS[tag.toLowerCase()] ?? DEFAULT_TAG_DOT;
}

// ─── Per-log tag chip + accent-bar colors (NP-318) ──────────────────────────
//
// Ports the web's `tagAccent` / `tagBorderAccent` maps
// (`webapp/app/dashboard/timeline/page.tsx:172-228`) so a logged meal's tag
// chip and left accent bar read the same on native as on the web.

export interface TagChipColors {
  bg: string;
  text: string;
}

const TAG_CHIP_COLORS: Record<string, TagChipColors> = {
  breakfast: { bg: "bg-amber-100 dark:bg-amber-900/30", text: "text-amber-700 dark:text-amber-300" },
  lunch: { bg: "bg-orange-100 dark:bg-orange-900/30", text: "text-orange-700 dark:text-orange-300" },
  dinner: { bg: "bg-indigo-100 dark:bg-indigo-900/30", text: "text-indigo-700 dark:text-indigo-300" },
  snack: { bg: "bg-emerald-100 dark:bg-emerald-900/30", text: "text-emerald-700 dark:text-emerald-300" },
  "pre-workout": { bg: "bg-purple-100 dark:bg-purple-900/30", text: "text-purple-700 dark:text-purple-300" },
  "post-workout": { bg: "bg-rose-100 dark:bg-rose-900/30", text: "text-rose-700 dark:text-rose-300" },
  brunch: { bg: "bg-yellow-100 dark:bg-yellow-900/30", text: "text-yellow-700 dark:text-yellow-300" },
  dessert: { bg: "bg-pink-100 dark:bg-pink-900/30", text: "text-pink-700 dark:text-pink-300" },
  "late-night": { bg: "bg-slate-100 dark:bg-slate-800/60", text: "text-slate-700 dark:text-slate-300" },
};

const DEFAULT_TAG_CHIP: TagChipColors = {
  bg: "bg-muted",
  text: "text-muted-foreground",
};

export function tagChipColors(tag: string): TagChipColors {
  return TAG_CHIP_COLORS[tag.toLowerCase()] ?? DEFAULT_TAG_CHIP;
}

/**
 * The log card's left accent bar, as a `border-l-*` className — reuses
 * `tagDotColors`' `ring` class (already a Tailwind color, NP-123: no hex
 * literals) rewritten from a full border to a left-only one, so the two
 * accents (the month dot and the log card's stripe) stay the same color per
 * tag without a second color table to drift out of sync.
 */
export function tagAccentBorderClass(tag: string | undefined): string {
  const ring = tagDotColors(tag ?? "").ring;
  return ring
    .split(" ")
    .map((cls) => cls.replace(/^(dark:)?border-(?!l-)/, "$1border-l-"))
    .join(" ");
}

const PRIMARY_TAG_PRIORITY = ["breakfast", "lunch", "dinner", "snack"];

/** Picks the tag used for the log card's accent — the web's `primaryTag`. */
export function primaryLogTag(tags: string[] | undefined): string | undefined {
  if (!tags || tags.length === 0) return undefined;
  const lower = tags.map((t) => t.toLowerCase());
  const def = lower.find((t) => PRIMARY_TAG_PRIORITY.includes(t));
  return def ?? lower[0];
}

/** `h:mm AM/PM` — the web's `formatTime` (`page.tsx:115-120`). */
export function formatLogTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}
