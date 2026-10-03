import { Pressable, View } from "react-native";
import { Check, Flag, Pencil, Plus, Trash2 } from "lucide-react-native";
import { Text } from "@/components/Text";
import { Card } from "@/components/Card";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";
import type { Occurrence } from "@/lib/nutrition/dayOrder";
import type { MealLog } from "@become/api-client";
import type { MealPlan } from "@/lib/nutrition/mealPlans";
import { NutritionPlanCard } from "@/components/nutrition/NutritionPlanCard";
import {
  canCombine,
  combineTotals,
  pickedLogItems,
  selectableLogItems,
  selectionKey,
} from "@/lib/nutrition/combineItems";

export interface TagSectionProps {
  occurrence: Occurrence<MealLog, MealPlan>;
  empty?: boolean;
  removable?: boolean;
  onRemoveItem: (logId: string, itemId: string) => void;
  /**
   * Edit a logged row (NP-095). The screen opens the item editor sheet.
   */
  onEditItem?: (logId: string, item: MealLog["items"][number], tag: string) => void;
  /**
   * Edit a whole logged meal (NP-095). Offered on the section header when the
   * sitting holds logs; the screen opens the meal editor sheet.
   */
  onEditMeal?: (logId: string, mealName: string | undefined, tag: string) => void;
  /**
   * Edit a whole logged meal (NP-095). Offered on the section header when the
   * sitting holds logs; the screen opens the meal editor sheet.
   */
  onEditMeal?: (logId: string, mealName: string | undefined, tag: string) => void;
  /**
   * "Something look wrong?" on a logged row (NP-174). Offered only for rows
   * with a real catalogue food behind them; the screen opens the flag sheet.
   */
  onFlagItem?: (logId: string, item: MealLog["items"][number]) => void;
  onRemoveTag?: (tag: string) => void;
  onAddFood: (tag: string) => void;
  /**
   * Add a food into a specific logged sitting (NP-094) — the web's "Add food
   * to this meal" on a logged meal group. Hands back the MealLog id (and the
   * tag) so the screen can open the search sheet in append mode.
   */
  onAddToMeal?: (logId: string, tag: string) => void;
  onLogPlan?: (planId: string) => void;
  onRemovePlan?: (planId: string) => void;
  onSkipPlan?: (planId: string) => void;
  /**
   * ── Select mode (NP-175) ──────────────────────────────────────────────────
   *
   * Pick rows already logged in this sitting, then fold them into one entry.
   * The screen owns the selection and the sheet, because a combine is ONE
   * server request over whatever was picked — see `lib/nutrition/combineItems`.
   * Omit `onStartSelect` and the section has no select mode at all, which is
   * what a day with nothing addressable in it should have.
   *
   * It hands back the OCCURRENCE key, not the tag: a day with a 10am snack and
   * a 3pm snack is two sittings, and selecting in one must not light up the
   * other.
   */
  onStartSelect?: (sectionKey: string) => void;
  selecting?: boolean;
  selectedKeys?: ReadonlySet<string>;
  onToggleSelect?: (logId: string, itemId: string) => void;
  onCancelSelect?: () => void;
  /** Open the combine sheet over what is picked. */
  onCombine?: () => void;
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
  onEditItem,
  onEditMeal,
  onFlagItem,
  onRemoveTag,
  onAddFood,
  onAddToMeal,
  onLogPlan,
  onRemovePlan,
  onSkipPlan,
  onStartSelect,
  selecting = false,
  selectedKeys,
  onToggleSelect,
  onCancelSelect,
  onCombine,
  testID,
}: TagSectionProps) {
  const { colors, tint } = useThemeTokens();
  const sectionTag = occurrence.tag;
  const sectionTestId = testID ?? `nutrition-section-${sectionTag}`;
  const isPlannedOccurrence = Boolean(occurrence.planned);
  const plans = (occurrence.plans ?? []) as MealPlan[];
  const hasPlans = plans.length > 0;
  const hasLogs = (occurrence.logs ?? []).length > 0;
  const hasContent = !empty && (hasLogs || hasPlans);

  // Only rows with a real subdocument id can be combined — the route addresses
  // a pick as `{ logId, itemId }`. Two of them is the floor: one item is not a
  // combination, it would just rename a row.
  const selectable = selectableLogItems(occurrence.logs);
  const canStartSelect =
    Boolean(onStartSelect) && !isPlannedOccurrence && canCombine(selectable);
  const picked = pickedLogItems(selectable, selectedKeys ?? new Set<string>());
  const pickedTotals = combineTotals(picked);

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

        {/* Select mode's way in and out (NP-175) */}
        {selecting ? (
          <Pressable
            testID={`nutrition-combine-cancel-${sectionTag}`}
            accessibilityLabel={`Stop selecting items in ${sectionTag}`}
            accessibilityRole="button"
            onPress={onCancelSelect}
            hitSlop={8}
            style={{ paddingHorizontal: 6, paddingVertical: 4 }}
          >
            <Text className="text-muted-foreground text-xs font-semibold">
              Cancel
            </Text>
          </Pressable>
        ) : (
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            {onEditMeal && hasLogs && firstLog ? (
              <Pressable
                testID={`nutrition-edit-meal-${sectionTag}`}
                accessibilityLabel={`Edit ${capitalizeTag(sectionTag)} meal`}
                accessibilityRole="button"
                onPress={() =>
                  onEditMeal(
                    String(firstLog._id ?? (firstLog as { id?: unknown }).id ?? ""),
                    firstLog.mealName,
                    sectionTag,
                  )
                }
                hitSlop={8}
                style={{ padding: 6 }}
              >
                <Pencil size={16} color={colors["muted-foreground"]} />
              </Pressable>
            ) : null}
            {canStartSelect ? (
              <Pressable
                testID={`nutrition-combine-start-${sectionTag}`}
                accessibilityLabel={`Select items in ${sectionTag} to combine`}
                accessibilityRole="button"
                onPress={() => onStartSelect?.(occurrence.key)}
                hitSlop={8}
                style={{ paddingHorizontal: 6, paddingVertical: 4 }}
              >
                <Text className="text-primary text-xs font-semibold">Select</Text>
              </Pressable>
            ) : null}
          </View>
        )}
      </View>

      {/* The running count, so it stays visible while a long sitting scrolls. */}
      {selecting ? (
        <View
          testID={`nutrition-combine-bar-${sectionTag}`}
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 8,
            marginBottom: 8,
            paddingHorizontal: 10,
            paddingVertical: 8,
            borderRadius: 10,
            backgroundColor: tint("primary", 0.1),
          }}
        >
          <View style={{ flex: 1 }}>
            <Text
              testID={`nutrition-combine-count-${sectionTag}`}
              className="text-foreground text-xs font-semibold"
            >
              {picked.length === 0
                ? "Tap items to combine"
                : `${picked.length} selected`}
            </Text>
            {picked.length > 0 ? (
              <Text className="text-muted-foreground text-xs mt-0.5">
                {Math.round(pickedTotals.calories)} kcal ·{" "}
                {Math.round(pickedTotals.protein)}g P ·{" "}
                {Math.round(pickedTotals.carbs)}g C ·{" "}
                {Math.round(pickedTotals.fats)}g F
              </Text>
            ) : null}
          </View>
          <Pressable
            testID={`nutrition-combine-submit-${sectionTag}`}
            accessibilityLabel={`Combine ${picked.length} selected items`}
            accessibilityRole="button"
            accessibilityState={{ disabled: !canCombine(picked) }}
            disabled={!canCombine(picked)}
            onPress={onCombine}
            hitSlop={8}
            style={{
              paddingHorizontal: 10,
              paddingVertical: 6,
              borderRadius: 8,
              backgroundColor: colors.primary,
              opacity: canCombine(picked) ? 1 : 0.5,
            }}
          >
            <Text className="text-primary-foreground text-xs font-semibold">
              Combine
            </Text>
          </Pressable>
        </View>
      ) : null}

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

                // Addressable only with a real subdocument id; the fallback key
                // above is for React, not for the server.
                const pickKey = item._id
                  ? selectionKey(logId, String(item._id))
                  : null;
                const selectableRow = selecting && pickKey !== null;
                const isSelected = pickKey !== null && Boolean(selectedKeys?.has(pickKey));

                const body = (
                  <>
                    {selectableRow ? (
                      <View
                        testID={`nutrition-combine-check-${itemId}`}
                        style={{
                          width: 20,
                          height: 20,
                          marginRight: 10,
                          borderRadius: 4,
                          borderWidth: 1,
                          alignItems: "center",
                          justifyContent: "center",
                          borderColor: isSelected ? colors.primary : colors.border,
                          backgroundColor: isSelected ? colors.primary : "transparent",
                        }}
                      >
                        {isSelected ? (
                          <Check size={13} color={colors["primary-foreground"]} />
                        ) : null}
                      </View>
                    ) : null}
                    <View style={{ flex: 1, marginRight: 12 }}>
                      <Text className="text-foreground text-sm font-semibold">
                        {item.name}
                      </Text>
                      <Text className="text-muted-foreground text-xs mt-0.5">
                        {servingDesc} · {Math.round(itemCals)} kcal
                      </Text>
                    </View>

                    {/* In select mode the row is a checkbox target and its
                        delete affordance is withheld — tapping to pick must
                        never delete a log. */}
                    {selectableRow ? null : (
                      <View
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                        }}
                      >
                        {onEditItem && item._id ? (
                          <Pressable
                            testID={`day-totals-entry-${itemId}-edit`}
                            accessibilityLabel={`Edit ${item.name}`}
                            accessibilityRole="button"
                            onPress={() => onEditItem(logId, item, sectionTag)}
                            hitSlop={8}
                            style={{ padding: 6 }}
                          >
                            <Pencil size={16} color={colors["muted-foreground"]} />
                          </Pressable>
                        ) : null}
                        {onFlagItem && item.foodId ? (
                          <Pressable
                            testID={`day-totals-entry-${itemId}-flag`}
                            accessibilityLabel={`Report ${item.name}`}
                            accessibilityHint="Something look wrong? Report this food without changing your entry"
                            accessibilityRole="button"
                            onPress={() => onFlagItem(logId, item)}
                            hitSlop={8}
                            style={{ padding: 6 }}
                          >
                            <Flag size={16} color={colors["muted-foreground"]} />
                          </Pressable>
                        ) : null}
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
                    )}
                  </>
                );

                const rowStyle = {
                  flexDirection: "row" as const,
                  justifyContent: "space-between" as const,
                  alignItems: "center" as const,
                  paddingVertical: 10,
                  borderTopWidth: 1,
                  borderTopColor: colors.border,
                };

                if (selectableRow) {
                  return (
                    <Pressable
                      key={itemId}
                      testID={`nutrition-item-row-${itemId}`}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: isSelected }}
                      accessibilityLabel={`${isSelected ? "Deselect" : "Select"} ${item.name}`}
                      onPress={() => onToggleSelect?.(logId, String(item._id))}
                      style={rowStyle}
                    >
                      {body}
                    </Pressable>
                  );
                }

                return (
                  <View
                    key={itemId}
                    testID={`nutrition-item-row-${itemId}`}
                    style={rowStyle}
                  >
                    {body}
                  </View>
                );
              });
            })}

          {/* Planned meals */}
          {hasPlans && (
            <View style={{ marginTop: hasLogs ? 12 : 4, gap: 10 }}>
              {plans.map((plan) => (
                <NutritionPlanCard
                  key={plan._id}
                  plan={plan}
                  onLogPlan={onLogPlan}
                  onSkipPlan={onSkipPlan}
                  onRemovePlan={onRemovePlan}
                />
              ))}
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
        {/* Add a food INTO a named logged sitting (NP-094) — the web's "Add
            food to this meal" on a logged meal group. Only when the sitting
            holds a log to append to. */}
        {onAddToMeal && hasLogs && firstLog ? (
          <Pressable
            testID={`nutrition-add-to-meal-${sectionTag}`}
            accessibilityLabel={`Add food to this meal in ${sectionTag}`}
            accessibilityRole="button"
            onPress={() =>
              onAddToMeal(
                String(firstLog._id ?? (firstLog as { id?: unknown }).id ?? ""),
                sectionTag,
              )
            }
            style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 4 }}
          >
            <Plus size={16} color={colors.primary} />
            <Text className="text-primary text-xs font-semibold">
              Add to this meal
            </Text>
          </Pressable>
        ) : null}
      </View>
    </Card>
  );
}
