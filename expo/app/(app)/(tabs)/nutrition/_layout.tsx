import { TabStack } from "@/components/navigation/TabStack";

/**
 * The nutrition tab's own Stack. Search, a food, a recipe and a day log
 * push here — each is reached from the tab root and has to come back to
 * it.
 */
export default function NutritionTabLayout() {
  return <TabStack />;
}
