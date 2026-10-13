import { Image } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import {
  Apple,
  Beef,
  Carrot,
  Cherry,
  Coffee,
  Cookie,
  Croissant,
  CupSoda,
  Drumstick,
  Egg,
  Fish,
  GlassWater,
  Grape,
  IceCreamCone,
  Milk,
  Pizza,
  Salad,
  Sandwich,
  Soup,
  Wheat,
  Wine,
  Lollipop,
  Banana,
  Utensils,
  Droplet,
  type LucideIcon,
} from "lucide-react-native";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";

/**
 * ─── The hero — natively (NP-269) ───────────────────────────────────────────
 *
 * Port of `webapp/components/nutrition/FoodThumbnail.tsx`: a full-width,
 * category-tinted hero above the title on the food detail page. Web shows
 * one; native showed none at all. Renders the food's own image when it has
 * one, otherwise a category-appropriate lucide icon on a diagonal two-stop
 * gradient (NP-325) — native used to draw a FLAT tint, which read as a plain
 * peach tile (brown in dark mode) next to the web's yellow-orange gradient.
 * `expo-linear-gradient` draws the same `bg-gradient-to-br` diagonal the web
 * uses, with a second stop shaded off the category's own tint (darker in
 * light mode, lighter in dark) rather than a second literal per palette
 * entry — close to the web's hue, not a pixel-exact port of its 55 Tailwind
 * stop pairs. Variant within a category is chosen by hashing the food name,
 * so the same food always shows the same thumbnail.
 */

type Variant = {
  light: string;
  dark: string;
  Icon: LucideIcon;
  iconLight: string;
  iconDark: string;
};

const PALETTE: Record<string, Variant[]> = {
  Protein: [
    { light: "254 205 211", dark: "76 5 25", Icon: Beef, iconLight: "190 18 60", iconDark: "253 164 175" },
    { light: "254 215 170", dark: "76 29 5", Icon: Drumstick, iconLight: "194 65 12", iconDark: "253 186 116" },
    { light: "253 230 138", dark: "69 48 5", Icon: Egg, iconLight: "180 83 9", iconDark: "253 224 71" },
    { light: "186 230 253", dark: "8 51 68", Icon: Fish, iconLight: "3 105 161", iconDark: "125 211 252" },
    { light: "251 207 232", dark: "76 5 46", Icon: Beef, iconLight: "190 24 93", iconDark: "249 168 212" },
  ],
  Grain: [
    { light: "253 230 138", dark: "69 48 5", Icon: Wheat, iconLight: "180 83 9", iconDark: "253 224 71" },
    { light: "254 240 138", dark: "66 50 5", Icon: Sandwich, iconLight: "161 98 7", iconDark: "254 240 138" },
    { light: "254 215 170", dark: "76 29 5", Icon: Croissant, iconLight: "194 65 12", iconDark: "253 186 116" },
    { light: "231 229 228", dark: "41 37 36", Icon: Pizza, iconLight: "68 64 60", iconDark: "214 211 209" },
    { light: "217 249 157", dark: "54 83 20", Icon: Wheat, iconLight: "77 124 15", iconDark: "190 242 100" },
  ],
  Fruit: [
    { light: "254 205 211", dark: "76 5 25", Icon: Apple, iconLight: "190 18 60", iconDark: "253 164 175" },
    { light: "245 208 254", dark: "59 7 100", Icon: Grape, iconLight: "162 28 175", iconDark: "240 171 252" },
    { light: "254 202 202", dark: "69 10 10", Icon: Cherry, iconLight: "185 28 28", iconDark: "252 165 165" },
    { light: "254 240 138", dark: "66 50 5", Icon: Banana, iconLight: "161 98 7", iconDark: "254 240 138" },
    { light: "254 215 170", dark: "76 29 5", Icon: Apple, iconLight: "194 65 12", iconDark: "253 186 116" },
  ],
  Vegetable: [
    { light: "209 250 229", dark: "2 44 34", Icon: Salad, iconLight: "4 120 87", iconDark: "110 231 183" },
    { light: "254 215 170", dark: "76 29 5", Icon: Carrot, iconLight: "194 65 12", iconDark: "253 186 116" },
    { light: "217 249 157", dark: "54 83 20", Icon: Salad, iconLight: "77 124 15", iconDark: "190 242 100" },
    { light: "204 251 241", dark: "4 47 46", Icon: Soup, iconLight: "15 118 110", iconDark: "94 234 212" },
    { light: "187 247 208", dark: "5 46 22", Icon: Carrot, iconLight: "21 128 61", iconDark: "134 239 172" },
  ],
  Dairy: [
    { light: "224 242 254", dark: "8 47 73", Icon: Milk, iconLight: "3 105 161", iconDark: "125 211 252" },
    { light: "224 231 255", dark: "30 27 75", Icon: Milk, iconLight: "67 56 202", iconDark: "165 180 252" },
    { light: "254 249 195", dark: "66 32 6", Icon: IceCreamCone, iconLight: "161 98 7", iconDark: "254 240 138" },
    { light: "231 229 228", dark: "41 37 36", Icon: Milk, iconLight: "68 64 60", iconDark: "214 211 209" },
    { light: "207 250 254", dark: "8 51 68", Icon: IceCreamCone, iconLight: "14 116 144", iconDark: "103 232 249" },
  ],
  Fat: [
    { light: "253 230 138", dark: "69 48 5", Icon: Droplet, iconLight: "180 83 9", iconDark: "253 224 71" },
    { light: "254 215 170", dark: "76 29 5", Icon: Droplet, iconLight: "194 65 12", iconDark: "253 186 116" },
    { light: "217 249 157", dark: "54 83 20", Icon: Droplet, iconLight: "77 124 15", iconDark: "190 242 100" },
    { light: "254 215 170", dark: "76 29 5", Icon: Droplet, iconLight: "194 65 12", iconDark: "253 186 116" },
    { light: "231 229 228", dark: "41 37 36", Icon: Droplet, iconLight: "68 64 60", iconDark: "214 211 209" },
  ],
  Beverage: [
    { light: "207 250 254", dark: "8 51 68", Icon: GlassWater, iconLight: "14 116 144", iconDark: "103 232 249" },
    { light: "254 215 170", dark: "76 29 5", Icon: Coffee, iconLight: "146 64 14", iconDark: "253 186 116" },
    { light: "254 205 211", dark: "76 5 25", Icon: Wine, iconLight: "190 18 60", iconDark: "253 164 175" },
    { light: "254 215 170", dark: "76 29 5", Icon: CupSoda, iconLight: "194 65 12", iconDark: "253 186 116" },
    { light: "191 219 254", dark: "30 58 138", Icon: GlassWater, iconLight: "29 78 216", iconDark: "147 197 253" },
  ],
  Condiment: [
    { light: "254 205 211", dark: "76 5 25", Icon: Utensils, iconLight: "190 18 60", iconDark: "253 164 175" },
    { light: "253 230 138", dark: "69 48 5", Icon: Utensils, iconLight: "180 83 9", iconDark: "253 224 71" },
    { light: "254 215 170", dark: "76 29 5", Icon: Utensils, iconLight: "194 65 12", iconDark: "253 186 116" },
    { light: "254 240 138", dark: "66 50 5", Icon: Utensils, iconLight: "161 98 7", iconDark: "254 240 138" },
    { light: "254 202 202", dark: "69 10 10", Icon: Utensils, iconLight: "185 28 28", iconDark: "252 165 165" },
  ],
  Snack: [
    { light: "254 215 170", dark: "76 29 5", Icon: Cookie, iconLight: "194 65 12", iconDark: "253 186 116" },
    { light: "254 240 138", dark: "66 50 5", Icon: IceCreamCone, iconLight: "161 98 7", iconDark: "254 240 138" },
    { light: "245 208 254", dark: "59 7 100", Icon: Lollipop, iconLight: "162 28 175", iconDark: "240 171 252" },
    { light: "254 215 170", dark: "76 29 5", Icon: Pizza, iconLight: "194 65 12", iconDark: "253 186 116" },
    { light: "254 205 211", dark: "76 5 25", Icon: Cookie, iconLight: "190 18 60", iconDark: "253 164 175" },
  ],
  Other: [
    { light: "228 228 231", dark: "39 39 42", Icon: Utensils, iconLight: "82 82 91", iconDark: "212 212 216" },
    { light: "226 232 240", dark: "30 41 59", Icon: Utensils, iconLight: "71 85 105", iconDark: "203 213 225" },
    { light: "231 229 228", dark: "41 37 36", Icon: Apple, iconLight: "68 64 60", iconDark: "214 211 209" },
    { light: "229 229 229", dark: "38 38 38", Icon: Utensils, iconLight: "82 82 82", iconDark: "212 212 212" },
    { light: "229 231 235", dark: "31 41 55", Icon: Utensils, iconLight: "75 85 99", iconDark: "209 213 219" },
  ],
};

function hashName(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = ((h << 5) - h + name.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function clampByte(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n)));
}

/** Shade an "R G B" triplet by `delta` per channel — the gradient's 2nd stop. */
function shadeTriplet(triplet: string, delta: number): string {
  const [r = 0, g = 0, b = 0] = triplet.split(" ").map(Number);
  return `${clampByte(r + delta)} ${clampByte(g + delta)} ${clampByte(b + delta)}`;
}

export interface FoodThumbnailProps {
  name: string;
  category?: string | null;
  imageUrl?: string | null;
  /** Height of the hero, in dp. Defaults to the food detail page's size. */
  height?: number;
  /** Icon size, in dp. */
  iconSize?: number;
  testID?: string;
}

export function FoodThumbnail({
  name,
  category,
  imageUrl,
  height = 176,
  iconSize = 56,
  testID = "food-thumbnail",
}: FoodThumbnailProps) {
  const { isDark } = useThemeTokens();

  if (imageUrl) {
    return (
      <Image
        testID={testID}
        source={{ uri: imageUrl }}
        accessibilityLabel={name}
        style={{ width: "100%", height, borderRadius: 16 }}
        resizeMode="cover"
      />
    );
  }

  const palette = PALETTE[category ?? "Other"] ?? PALETTE.Other ?? [];
  const picked = palette[hashName(name) % palette.length] ?? palette[0];
  if (!picked) return null;
  const Icon = picked.Icon;

  // Diagonal two-stop gradient (the web's `bg-gradient-to-br`) — light mode
  // shades slightly darker for the 2nd stop, dark mode slightly lighter,
  // mirroring how Tailwind's own `-200 to -300` / `-900/50 to -900/40` pairs
  // move.
  const stop1 = isDark ? picked.dark : picked.light;
  const stop2 = shadeTriplet(stop1, isDark ? 14 : -18);

  return (
    <LinearGradient
      testID={testID}
      accessibilityRole="image"
      accessibilityLabel={name}
      colors={[`rgb(${stop1})`, `rgb(${stop2})`]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={{
        width: "100%",
        height,
        borderRadius: 16,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Icon
        width={iconSize}
        height={iconSize}
        color={`rgb(${isDark ? picked.iconDark : picked.iconLight})`}
      />
    </LinearGradient>
  );
}

export default FoodThumbnail;
