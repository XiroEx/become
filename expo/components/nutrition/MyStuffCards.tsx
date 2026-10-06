import { Image, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { ChefHat, ScrollText } from "lucide-react-native";
import { Text } from "@/components/Text";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";

/**
 * ─── The card chrome My Stuff was missing (NP-270) ─────────────────────────
 *
 * The web's `MealCard`/`RecipeCard` (`webapp/components/meals/*.tsx`) draw a
 * gradient thumbnail, a tag chip and a protein/carbs/fats split bar beside
 * the calorie line; native drew a bare name and a kcal string. These are the
 * pieces, shared by both cards (and reused for the Foods row's own macro
 * line) so the two stay the same shape the way the web's two components do.
 */

export interface MacroSplit {
  protein: number;
  carbs: number;
  fats: number;
}

function macroPercents(
  macros: MacroSplit,
): { protein: number; carbs: number; fats: number } | null {
  const total = macros.protein + macros.carbs + macros.fats;
  if (total <= 0) return null;
  return {
    protein: (macros.protein / total) * 100,
    carbs: (macros.carbs / total) * 100,
    fats: (macros.fats / total) * 100,
  };
}

/**
 * The macro-split bar — the web's blue/green/amber three-segment strip next
 * to a card's calorie line (`MealCard.tsx`/`RecipeCard.tsx`'s
 * `bg-blue-500`/`bg-green-500`/`bg-amber-500`). Protein is `info` (blue),
 * carbs `success` (green), fats `accent` (amber) — the same three tokens the
 * food detail page's own macro tile already draws them in
 * (`app/(tabs)/nutrition/food/[id].tsx`). Renders nothing with no macro data,
 * exactly like the web's `totalGrams > 0 &&`.
 */
export function MacroBar({ macros, testID }: { macros: MacroSplit; testID?: string }) {
  const { colors } = useThemeTokens();
  const pct = macroPercents(macros);
  if (!pct) return null;
  return (
    <View
      testID={testID}
      style={{
        flexDirection: "row",
        height: 6,
        width: 72,
        borderRadius: 3,
        overflow: "hidden",
        backgroundColor: colors.muted,
      }}
    >
      <View style={{ width: `${pct.protein}%`, backgroundColor: colors.info }} />
      <View style={{ width: `${pct.carbs}%`, backgroundColor: colors.success }} />
      <View style={{ width: `${pct.fats}%`, backgroundColor: colors.accent }} />
    </View>
  );
}

/**
 * A tag chip — the web's `bg-zinc-100 dark:bg-zinc-800` pill. Native drew the
 * tag nowhere on these cards.
 */
export function TagChip({ label, testID }: { label: string; testID?: string }) {
  return (
    <View testID={testID} className="self-start rounded-md bg-muted px-1.5 py-0.5">
      <Text className="text-muted-foreground text-[10px] font-medium">{label}</Text>
    </View>
  );
}

/**
 * Title-case a tag the way the WEB does it (`titleCaseTag` in
 * `webapp/components/meals/MealCard.tsx` / `RecipeCard.tsx` and
 * `webapp/app/dashboard/meals/page.tsx`): segments joined back with a
 * HYPHEN, not a space. `lib/nutrition/mealSchedule.ts#titleCase` joins with a
 * space for the schedule editor's own rows and stays exactly as it is for
 * them — this is the one convention the My Stuff screen's chips (card and
 * filter row alike) must match, because the web shows `Post-Workout` /
 * `Pre-Workout` and native showed `Post Workout` / `Pre Workout`.
 */
export function titleCaseTag(tag: string): string {
  return tag
    .split(/[-_\s]+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join("-");
}

interface ThumbnailProps {
  imageUrl?: string | null;
  name: string;
  size?: number;
  testID?: string;
}

/**
 * Meal thumbnail — the web's amber→orange chef tile
 * (`MealCard.tsx`'s `from-amber-100 via-orange-100 to-rose-100` + `ChefHat`).
 * A real photo wins when the meal has one; native drew neither.
 */
export function MealThumbnail({
  imageUrl,
  name,
  size = 56,
  testID = "meal-thumbnail",
}: ThumbnailProps) {
  const { tint, colors } = useThemeTokens();
  if (imageUrl) {
    return (
      <Image
        testID={testID}
        source={{ uri: imageUrl }}
        accessibilityLabel={name}
        style={{ width: size, height: size, borderRadius: 12 }}
        resizeMode="cover"
      />
    );
  }
  return (
    <LinearGradient
      testID={testID}
      colors={[tint("accent", 0.3), tint("orange", 0.22)]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={{
        width: size,
        height: size,
        borderRadius: 12,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <ChefHat size={Math.round(size * 0.4)} color={colors.accent} />
    </LinearGradient>
  );
}

/**
 * Recipe thumbnail — the web's violet→purple scroll tile
 * (`RecipeCard.tsx`'s `from-violet-100 via-purple-100 to-fuchsia-100` +
 * `ScrollText`).
 */
export function RecipeThumbnail({
  imageUrl,
  name,
  size = 56,
  testID = "recipe-thumbnail",
}: ThumbnailProps) {
  const { tint, colors } = useThemeTokens();
  if (imageUrl) {
    return (
      <Image
        testID={testID}
        source={{ uri: imageUrl }}
        accessibilityLabel={name}
        style={{ width: size, height: size, borderRadius: 12 }}
        resizeMode="cover"
      />
    );
  }
  return (
    <LinearGradient
      testID={testID}
      colors={[tint("mind-violet", 0.3), tint("mindset", 0.22)]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={{
        width: size,
        height: size,
        borderRadius: 12,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <ScrollText size={Math.round(size * 0.4)} color={colors["mind-violet"]} />
    </LinearGradient>
  );
}
