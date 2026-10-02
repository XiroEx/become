/**
 * Preset profile icons — the starter set every member can equip for free.
 * Ported 1:1 from `webapp/lib/reward/icons.tsx`.
 *
 * Rendered from lucide-react-native glyphs on branded gradient / solid colours.
 * Custom uploads (User.avatarUrl) are handled separately with icon = 'custom'.
 */

import type { ComponentType } from "react";
import type { SvgProps } from "react-native-svg";
import {
  Flame,
  Dumbbell,
  Zap,
  Heart,
  Mountain,
  Sunrise,
  Target,
  Sparkles,
  Leaf,
  Trophy,
} from "lucide-react-native";

export type LucideIconComponent = ComponentType<
  SvgProps & {
    size?: number | string;
    color?: string;
    strokeWidth?: number | string;
  }
>;

export interface PresetIcon {
  id: string;
  label: string;
  Icon: LucideIconComponent;
  bgClass: string;
}

export const PRESET_ICONS: PresetIcon[] = [
  { id: "flame", label: "Flame", Icon: Flame, bgClass: "bg-orange-500" },
  { id: "strength", label: "Strength", Icon: Dumbbell, bgClass: "bg-violet-500" },
  { id: "bolt", label: "Bolt", Icon: Zap, bgClass: "bg-amber-500" },
  { id: "heart", label: "Heart", Icon: Heart, bgClass: "bg-rose-500" },
  { id: "summit", label: "Summit", Icon: Mountain, bgClass: "bg-sky-500" },
  { id: "sunrise", label: "Sunrise", Icon: Sunrise, bgClass: "bg-amber-500" },
  { id: "focus", label: "Focus", Icon: Target, bgClass: "bg-emerald-500" },
  { id: "spark", label: "Spark", Icon: Sparkles, bgClass: "bg-fuchsia-500" },
  { id: "leaf", label: "Calm", Icon: Leaf, bgClass: "bg-green-500" },
  { id: "champion", label: "Champion", Icon: Trophy, bgClass: "bg-yellow-500" },
];

const PRESET_BY_ID = new Map(PRESET_ICONS.map((p) => [p.id, p]));

/** Look up a preset by id (falls back to the first preset, 'flame'). */
export function presetIcon(id: string | null | undefined): PresetIcon {
  return (id && PRESET_BY_ID.get(id)) || PRESET_ICONS[0]!;
}

/** The id `profileIcon` carries when the member equipped an uploaded photo. */
export const CUSTOM_ICON = "custom";

/**
 * The image an avatar should try, or null when there is nothing to try and the
 * preset glyph is the answer outright.
 */
export function avatarImageSrc(
  icon: string | null | undefined,
  imageUrl: string | null | undefined,
): string | null {
  if (icon !== CUSTOM_ICON) return null;
  const src = typeof imageUrl === "string" ? imageUrl.trim() : "";
  return src ? src : null;
}

/**
 * Did the member equip a photo, whether or not it can be drawn? Decides which
 * glyph stands in when the image is unusable: a member who never chose a photo
 * falls back to their preset, while one whose photo is missing gets a neutral
 * silhouette rather than a preset they never picked.
 */
export function equippedCustomAvatar(icon: string | null | undefined): boolean {
  return icon === CUSTOM_ICON;
}

/** Labels for user fitness goals displayed on profile chips. */
export const GOAL_LABELS: Record<string, string> = {
  lose_weight: "Losing weight",
  gain_muscle: "Gaining muscle",
  maintain: "Maintaining",
  improve_performance: "Improving performance",
  general_health: "General health",
};
