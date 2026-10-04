import { SafeAreaView } from "react-native-safe-area-context";
import { MealDetail } from "@/components/nutrition/MealDetail";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";

/**
 * THE SAVED-MEAL PAGE, ON THE PHONE (NP-143).
 *
 * Native counterpart of `webapp/app/dashboard/meals/[id]/page.tsx` — the
 * header card, the foods list, notes, the log sheet, and the owner actions
 * (edit, delete with confirmation, to-recipe). Reached from My Stuff's
 * Meals tab; the tab stack keeps the tab bar and the back swipe.
 */
export default function MealDetailScreen() {
  const { colors } = useThemeTokens();
  return (
    <SafeAreaView
      edges={["top", "bottom"]}
      style={{ flex: 1, backgroundColor: colors.background }}
      testID="meal-detail-screen"
    >
      <MealDetail />
    </SafeAreaView>
  );
}
