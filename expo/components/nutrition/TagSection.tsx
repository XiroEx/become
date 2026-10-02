import { Pressable, View } from "react-native";
import { Plus, Trash2 } from "lucide-react-native";
import { Text } from "@/components/Text";
import { Card } from "@/components/Card";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";
import type { Occurrence } from "@/lib/nutrition/dayOrder";
import type { MealLog } from "@become/api-client";
import type { MealPlan } from "@/lib/nutrition/mealPlans";

export interface TagSectionProps {
  occurrence: Occurrence<MealLog, MealPlan>;
  empty?: boolean;
  removable?: boolean;
  onRemoveItem: (logId: string, itemId: string) => void;
  onRemoveTag?: (tag: string) => void;
  onAddFood: (tag: string) => void;
  onLogPlan?: (planId: string) => void;
  onRemovePlan?: (planId: string) => void;
  onSkipPlan?: (planId: string) => void;
  testID?: string;
}

function capitalizeTag(tag: string): string {
  if (!tag) return "";
  return tag
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function formatTimeString(loggedAt: string | Date | undefined): string {
  if (!loggedAt) return "";
  const d = typeof loggedAt === "string" ? new Date(loggedAt) : loggedAt;
  if (!(d instanceof Date) || Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

export function TagSection({
  occurrence,
  empty,
  removable,
  onRemoveItem,
  onRemoveTag,
  onAddFood,
  onLogPlan,
  onRemovePlan,
  onSkipPlan,
  testID,
}: TagSectionProps) {
  const { colors } = useThemeTokens();
  const sectionTag = occurrence.tag;
  const sectionTestId = testID ?? `nutrition-section-${sectionTag}`;
  const isPlannedOccurrence = Boolean(occurrence.planned);
  const plans = (occurrence.plans ?? []) as MealPlan[];
  const hasPlans = plans.length > 0;
  const hasLogs = (occurrence.logs ?? []).length > 0;
  const hasContent = !empty && (hasLogs || hasPlans);

  let totalCals = 0;
  let totalProtein = 0;
  let totalCarbs = 0;
  let totalFats = 0;

  for (const log of occurrence.logs ?? []) {
    for (const item of log.items ?? []) {
      const servings =
        typeof item.servings === "number" && item.servings > 0 ? item.servings : 1;
      const nut = item.nutrition ?? { calories: 0, protein: 0, carbs: 0, fats: 0 };
      totalCals += (nut.calories ?? 0) * servings;
      totalProtein += (nut.protein ?? 0) * servings;
      totalCarbs += (nut.carbs ?? 0) * servings;
      totalFats += (nut.fats ?? 0) * servings;
    }
  }

  for (const plan of plans) {
    const exp = plan.expectedNutrition;
    if (exp) {
      totalCals += exp.calories ?? 0;
      totalProtein += exp.protein ?? 0;
      totalCarbs += exp.carbs ?? 0;
      totalFats += exp.fats ?? 0;
    } else {
      for (const item of plan.items ?? []) {
        const servings =
          typeof item.servings === "number" && item.servings > 0 ? item.servings : 1;
        const nut = item.nutrition ?? { calories: 0, protein: 0, carbs: 0, fats: 0 };
        totalCals += (nut.calories ?? 0) * servings;
        totalProtein += (nut.protein ?? 0) * servings;
        totalCarbs += (nut.carbs ?? 0) * servings;
        totalFats += (nut.fats ?? 0) * servings;
      }
    }
  }

  const firstLog = occurrence.logs?.[0];
  const timeLabel = isPlannedOccurrence
    ? ""
    : occurrence.untimed
      ? "Untimed"
      : formatTimeString(firstLog?.loggedAt);

  return (
    <Card
      testID={sectionTestId}
      className={
        isPlannedOccurrence
          ? "border-blue-300/70 dark:border-blue-800/50 bg-blue-50/40 dark:bg-blue-950/20"
          : undefined
      }
    >
      {/* Header */}
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 8,
        }}
      >
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Text
              testID={`${sectionTestId}-title`}
              className="text-foreground text-lg font-bold"
            >
              {capitalizeTag(sectionTag)}
            </Text>
            {isPlannedOccurrence && (
              <View
                testID="nutrition-plan-badge"
                className="bg-blue-100 dark:bg-blue-900/30 px-2 py-0.5 rounded-full"
              >
                <Text className="text-blue-700 dark:text-blue-300 text-[10px] font-bold uppercase tracking-wider">
                  Planned
                </Text>
              </View>
            )}
            {timeLabel ? (
              <Text className="text-muted-foreground text-xs font-medium">
                {timeLabel}
              </Text>
            ) : null}
          </View>
          {hasContent && (
            <Text className="text-muted-foreground text-xs mt-0.5">
              {Math.round(totalCals)} kcal · {Math.round(totalProtein)}g P ·{" "}
              {Math.round(totalCarbs)}g C · {Math.round(totalFats)}g F
            </Text>
          )}
        </View>

        {empty && removable && onRemoveTag ? (
          <Pressable
            testID={`nutrition-remove-tag-${sectionTag}`}
            accessibilityLabel={`Remove tag ${sectionTag}`}
            accessibilityRole="button"
            onPress={() => onRemoveTag(sectionTag)}
            hitSlop={8}
            style={{ padding: 4 }}
          >
            <Trash2 size={16} color={colors.destructive} />
          </Pressable>
        ) : null}
      </View>

      {/* Content */}
      {!hasContent ? (
        <View style={{ paddingVertical: 12 }}>
          <Text className="text-muted-foreground text-sm italic">
            No foods logged yet
          </Text>
        </View>
      ) : (
        <View style={{ marginTop: 4 }}>
          {/* Logged items */}
          {hasLogs &&
            occurrence.logs.flatMap((log) => {
              const logId = String(log._id ?? log.id ?? "");
              return (log.items ?? []).map((item, idx) => {
                const itemId = String(item._id ?? item.id ?? `${logId}-item-${idx}`);
                const servings =
                  typeof item.servings === "number" && item.servings > 0
                    ? item.servings
                    : 1;
                const nut = item.nutrition ?? { calories: 0, protein: 0, carbs: 0, fats: 0 };
                const itemCals = (nut.calories ?? 0) * servings;
                const servingDesc =
                  item.servingSize && item.servingUnit
                    ? `${servings !== 1 ? `${servings} × ` : ""}${item.servingSize} ${item.servingUnit}`
                    : `${servings} serving${servings !== 1 ? "s" : ""}`;

                return (
                  <View
                    key={itemId}
                    testID={`nutrition-item-row-${itemId}`}
                    style={{
                      flexDirection: "row",
                      justifyContent: "space-between",
                      alignItems: "center",
                      paddingVertical: 10,
                      borderTopWidth: 1,
                      borderTopColor: colors.border,
                    }}
                  >
                    <View style={{ flex: 1, marginRight: 12 }}>
                      <Text className="text-foreground text-sm font-semibold">
                        {item.name}
                      </Text>
                      <Text className="text-muted-foreground text-xs mt-0.5">
                        {servingDesc} · {Math.round(itemCals)} kcal
                      </Text>
                    </View>

                    <Pressable
                      testID={`day-totals-entry-${itemId}-remove`}
                      accessibilityLabel={`Remove ${item.name}`}
                      accessibilityRole="button"
                      onPress={() => onRemoveItem(logId, itemId)}
                      hitSlop={8}
                      style={{ padding: 6 }}
                    >
                      <Trash2 size={16} color={colors.destructive} />
                    </Pressable>
                  </View>
                );
              });
            })}

          {/* Planned meals */}
          {hasPlans && (
            <View style={{ marginTop: hasLogs ? 12 : 4, gap: 10 }}>
              {plans.map((plan) => {
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
                    key={planId}
                    testID={`nutrition-plan-${planId}`}
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
                            item._id ?? item.id ?? `${planId}-item-${idx}`,
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
              })}
            </View>
          )}
        </View>
      )}

      {/* Add food to this section button */}
      <View
        style={{
          marginTop: 8,
          borderTopWidth: 1,
          borderTopColor: colors.border,
          paddingTop: 8,
        }}
      >
        <Pressable
          testID={`nutrition-add-food-${sectionTag}`}
          accessibilityLabel={`Add food to ${sectionTag}`}
          accessibilityRole="button"
          onPress={() => onAddFood(sectionTag)}
          style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 4 }}
        >
          <Plus size={16} color={colors.primary} />
          <Text className="text-primary text-xs font-semibold">
            Add to {capitalizeTag(sectionTag)}
          </Text>
        </Pressable>
      </View>
    </Card>
  );
}
