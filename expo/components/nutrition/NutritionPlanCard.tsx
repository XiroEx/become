import { View, Pressable } from "react-native";
import { Trash2 } from "lucide-react-native";
import { Text } from "@/components/Text";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";
import type { MealPlan } from "@/lib/nutrition/mealPlans";

export interface NutritionPlanCardProps {
  plan: MealPlan;
  isToday?: boolean;
  onLogPlan?: (planId: string) => void;
  onSkipPlan?: (planId: string) => void;
  onRemovePlan?: (planId: string) => void;
  testID?: string;
}

function capitalizeTag(tag: string): string {
  if (!tag) return "";
  return tag.charAt(0).toUpperCase() + tag.slice(1);
}

export function NutritionPlanCard({
  plan,
  isToday = false,
  onLogPlan,
  onSkipPlan,
  onRemovePlan,
  testID,
}: NutritionPlanCardProps) {
  const { colors } = useThemeTokens();
  const planId = String(plan._id);

  let planCals = 0;
  let planProtein = 0;
  let planCarbs = 0;
  let planFats = 0;

  if (plan.expectedNutrition) {
    planCals = plan.expectedNutrition.calories ?? 0;
    planProtein = plan.expectedNutrition.protein ?? 0;
    planCarbs = plan.expectedNutrition.carbs ?? 0;
    planFats = plan.expectedNutrition.fats ?? 0;
  } else {
    for (const item of plan.items ?? []) {
      const s =
        typeof item.servings === "number" && item.servings > 0
          ? item.servings
          : 1;
      const nut = item.nutrition ?? { calories: 0, protein: 0, carbs: 0, fats: 0 };
      planCals += (nut.calories ?? 0) * s;
      planProtein += (nut.protein ?? 0) * s;
      planCarbs += (nut.carbs ?? 0) * s;
      planFats += (nut.fats ?? 0) * s;
    }
  }

  return (
    <View
      testID={testID ?? `nutrition-plan-${planId}`}
      className="rounded-xl border border-blue-200 dark:border-blue-900/40 bg-blue-50/50 dark:bg-blue-950/20 p-3 gap-2"
    >
      {/* Plan Header */}
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <View style={{ flex: 1, marginRight: 8 }}>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
              flexWrap: "wrap",
            }}
          >
            <Text
              testID={`nutrition-plan-title-${planId}`}
              className="text-foreground text-sm font-bold"
            >
              {plan.mealName ?? `${capitalizeTag(plan.tag)} Plan`}
            </Text>
            <View
              testID={`nutrition-plan-badge-${planId}`}
              className="bg-blue-100 dark:bg-blue-900/30 px-2 py-0.5 rounded-full"
            >
              <Text className="text-blue-700 dark:text-blue-300 text-[10px] font-bold uppercase">
                Planned
              </Text>
            </View>
          </View>
          <Text className="text-muted-foreground text-xs mt-0.5">
            {Math.round(planCals)} cal · {Math.round(planProtein)}g P ·{" "}
            {Math.round(planCarbs)}g C · {Math.round(planFats)}g F
          </Text>
        </View>

        {/* Actions: Log it, Skip, Remove */}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          {onLogPlan ? (
            <Pressable
              testID={`nutrition-plan-log-${planId}`}
              accessibilityLabel={`Log ${plan.mealName ?? plan.tag}`}
              accessibilityRole="button"
              onPress={() => onLogPlan(planId)}
              className="bg-blue-600 px-3 py-1.5 rounded-full"
            >
              <Text className="text-white text-xs font-semibold">
                Log it
              </Text>
            </Pressable>
          ) : null}

          {onSkipPlan ? (
            <Pressable
              testID={`nutrition-plan-skip-${planId}`}
              accessibilityLabel={`Skip ${plan.mealName ?? plan.tag}`}
              accessibilityRole="button"
              onPress={() => onSkipPlan(planId)}
              className="border border-border bg-card px-2.5 py-1 rounded-full"
            >
              <Text className="text-muted-foreground text-xs font-medium">
                Skip
              </Text>
            </Pressable>
          ) : null}

          {onRemovePlan ? (
            <Pressable
              testID={`nutrition-plan-remove-${planId}`}
              accessibilityLabel={`Remove ${plan.mealName ?? plan.tag}`}
              accessibilityRole="button"
              onPress={() => onRemovePlan(planId)}
              hitSlop={8}
              style={{ padding: 4 }}
            >
              <Trash2 size={16} color={colors.destructive} />
            </Pressable>
          ) : null}
        </View>
      </View>

      {/* Plan items */}
      {plan.items && plan.items.length > 0 ? (
        <View className="border-t border-blue-100 dark:border-blue-900/30 pt-1.5 gap-1">
          {plan.items.map((item, idx) => {
            const itemId = String(
              item._id ?? (item as { id?: string }).id ?? `${planId}-item-${idx}`,
            );
            const servings =
              typeof item.servings === "number" && item.servings > 0
                ? item.servings
                : 1;
            const nut = item.nutrition ?? {
              calories: 0,
              protein: 0,
              carbs: 0,
              fats: 0,
            };
            const itemCals = (nut.calories ?? 0) * servings;
            const servingDesc =
              item.servingSize && item.servingUnit
                ? `${servings !== 1 ? `${servings} × ` : ""}${item.servingSize} ${item.servingUnit}`
                : `${servings} serving${servings !== 1 ? "s" : ""}`;

            return (
              <View
                key={itemId}
                testID={`nutrition-plan-item-${itemId}`}
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                  paddingVertical: 4,
                }}
              >
                <View style={{ flex: 1, marginRight: 8 }}>
                  <Text className="text-foreground text-sm font-medium">
                    {item.name}
                  </Text>
                  <Text className="text-muted-foreground text-xs">
                    {servingDesc} · {Math.round(itemCals)} kcal
                  </Text>
                </View>
              </View>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}
