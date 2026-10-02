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
