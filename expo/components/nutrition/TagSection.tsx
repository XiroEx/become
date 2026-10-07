import { useState } from "react";
import { Alert, Modal, Pressable, View } from "react-native";
import {
  CalendarDays,
  Camera,
  Check,
  ChevronDown,
  ChefHat,
  Cookie,
  Dumbbell,
  Flag,
  Flame,
  Moon,
  MoreVertical,
  Pencil,
  PencilLine,
  Plus,
  Sandwich,
  ScanBarcode,
  Sun,
  Sunrise,
  Tag as TagIcon,
  Trash2,
  Upload,
  Utensils,
} from "lucide-react-native";
import { Text } from "@/components/Text";
import { Card } from "@/components/Card";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";
import type { Occurrence } from "@/lib/nutrition/dayOrder";
import type { MealLog } from "@become/api-client";
import type { MealPlan } from "@/lib/nutrition/mealPlans";
import {
  NutritionPlanCard,
  type MealPlanItem,
} from "@/components/nutrition/NutritionPlanCard";
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
  /** Edit a logged row (NP-095). */
  onEditItem?: (
    logId: string,
    item: MealLog["items"][number],
    tag: string,
  ) => void;
  /** Edit a whole logged meal (NP-095). */
  onEditMeal?: (
    logId: string,
    mealName: string | undefined,
    tag: string,
  ) => void;
  /** Flag a catalogue food item (NP-174). */
  onFlagItem?: (logId: string, item: MealLog["items"][number]) => void;
  onRemoveTag?: (tag: string) => void;
  onAddFood: (tag: string) => void;
  /** Add into THIS sitting (NP-094) — the web's "add to this meal" on a logged group. */
  onAddToMeal?: (logId: string, tag: string) => void;
  /** Plan for a future day — opens the plan date dialog (NP-320). */
  onPlan?: (tag: string) => void;
  /** Apply a saved meal to this tag (NP-320). */
  onApplyMeal?: (tag: string) => void;
  /** Delete all logged entries in this section (NP-320). */
  onDeleteSectionLogs?: (
    tag: string,
    entries: { logId: string; itemId: string }[],
  ) => void;
  onLogPlan?: (planId: string) => void;
  onRemovePlan?: (planId: string, scope?: "one" | "series") => void;
  onSkipPlan?: (planId: string) => void;
  onEditPlanItem?: (
    planId: string,
    item: MealPlanItem,
    planItems: MealPlanItem[],
  ) => void;
  onStartSelect?: (sectionKey: string) => void;
  selecting?: boolean;
  selectedKeys?: ReadonlySet<string>;
  onToggleSelect?: (logId: string, itemId: string) => void;
  onCancelSelect?: () => void;
  onCombine?: () => void;
  testID?: string;
}

const TAG_VISUALS: Record<string, { Icon: typeof Sun; bgClass: string }> = {
  breakfast: { Icon: Sunrise, bgClass: "bg-amber-100 dark:bg-amber-900/30" },
  lunch: { Icon: Sandwich, bgClass: "bg-orange-100 dark:bg-orange-900/30" },
  dinner: { Icon: Utensils, bgClass: "bg-indigo-100 dark:bg-indigo-900/30" },
  snack: { Icon: Cookie, bgClass: "bg-emerald-100 dark:bg-emerald-900/30" },
  "pre-workout": {
    Icon: Dumbbell,
    bgClass: "bg-purple-100 dark:bg-purple-900/30",
  },
  "post-workout": {
    Icon: Flame,
    bgClass: "bg-rose-100 dark:bg-rose-900/30",
  },
  brunch: { Icon: Sun, bgClass: "bg-yellow-100 dark:bg-yellow-900/30" },
  dessert: { Icon: Cookie, bgClass: "bg-pink-100 dark:bg-pink-900/30" },
  "late-night": {
    Icon: Moon,
    bgClass: "bg-slate-100 dark:bg-slate-800/60",
  },
};

function getTagVisuals(tag: string) {
  return (
    TAG_VISUALS[tag.toLowerCase()] ?? {
      Icon: TagIcon,
      bgClass: "bg-zinc-100 dark:bg-zinc-800",
    }
  );
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

interface FlattenedLogItem {
  logId: string;
  item: MealLog["items"][number];
  mealName?: string;
  source?: string;
  loggedAt?: string | Date;
  untimed?: boolean;
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
  onPlan,
  onApplyMeal,
  onDeleteSectionLogs,
  onLogPlan,
  onRemovePlan,
  onSkipPlan,
  onEditPlanItem,
  onStartSelect,
  selecting = false,
  selectedKeys,
  onToggleSelect,
  onCancelSelect,
  onCombine,
  testID,
}: TagSectionProps) {
  const { colors, scrim } = useThemeTokens();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [kebabOpen, setKebabOpen] = useState(false);
  const [kebabPos, setKebabPos] = useState<{ top: number; right: number }>({
    top: 100,
    right: 20,
  });
  const [expandedMealGroups, setExpandedMealGroups] = useState<
    Record<string, boolean>
  >({});
  const [expandedCaptureGroups, setExpandedCaptureGroups] = useState<
    Record<string, boolean>
  >({});

  const sectionTag = occurrence.tag;
  const sectionTestId = testID ?? `nutrition-section-${sectionTag}`;
  const visuals = getTagVisuals(sectionTag);
  const isPlannedOccurrence = Boolean(occurrence.planned);
  const plans = (occurrence.plans ?? []) as MealPlan[];
  const hasPlans = plans.length > 0;
  const hasLogs = (occurrence.logs ?? []).length > 0;
  const hasContent = !empty && (hasLogs || hasPlans);

  const selectable = selectableLogItems(occurrence.logs);
  const canStartSelect =
    Boolean(onStartSelect) && !isPlannedOccurrence && canCombine(selectable);
  const picked = pickedLogItems(selectable, selectedKeys ?? new Set<string>());
  const pickedTotals = combineTotals(picked);

  let totalCals = 0;
  let totalProtein = 0;
  let totalCarbs = 0;
  let totalFats = 0;

  const flattenedItems: FlattenedLogItem[] = [];

  for (const log of occurrence.logs ?? []) {
    const logId = String(log._id ?? (log as { id?: unknown }).id ?? "");
    for (const item of log.items ?? []) {
      flattenedItems.push({
        logId,
        item,
        mealName: log.mealName,
        source: (log as { source?: string }).source,
        loggedAt: log.loggedAt,
        untimed: log.untimed,
      });
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
          typeof item.servings === "number" && item.servings > 0
            ? item.servings
            : 1;
        const nut = item.nutrition ?? {
          calories: 0,
          protein: 0,
          carbs: 0,
          fats: 0,
        };
        totalCals += (nut.calories ?? 0) * servings;
        totalProtein += (nut.protein ?? 0) * servings;
        totalCarbs += (nut.carbs ?? 0) * servings;
        totalFats += (nut.fats ?? 0) * servings;
      }
    }
  }

  // Group flattened items
  type ItemGroup = {
    key: string;
    mealName?: string;
    source?: string;
    items: FlattenedLogItem[];
  };
  const groups: ItemGroup[] = [];
  let lastGroupKey = "";
  for (const fi of flattenedItems) {
    const gKey = fi.mealName
      ? `meal:${fi.logId}`
      : fi.source &&
          fi.source !== "manual" &&
          fi.source !== "search"
        ? `${fi.source}:${fi.logId}`
        : `loose:${fi.logId}`;
    if (gKey !== lastGroupKey) {
      groups.push({
        key: gKey,
        mealName: fi.mealName,
        source: fi.source,
        items: [],
      });
      lastGroupKey = gKey;
    }
    groups[groups.length - 1].items.push(fi);
  }

  const firstLog = occurrence.logs?.[0];
  const timeLabel = isPlannedOccurrence
    ? ""
    : occurrence.untimed
      ? "Untimed"
      : formatTimeString(firstLog?.loggedAt);

  const handleDeleteSection = () => {
    setKebabOpen(false);
    const entries = flattenedItems
      .filter((fi) => fi.item._id)
      .map((fi) => ({ logId: fi.logId, itemId: String(fi.item._id) }));
    if (entries.length === 0) return;

    const doDelete = () => {
      if (onDeleteSectionLogs) {
        onDeleteSectionLogs(sectionTag, entries);
      } else {
        for (const fi of entries) {
          onRemoveItem(fi.logId, fi.itemId);
        }
      }
    };

    if (entries.length === 1) {
      doDelete();
    } else {
      Alert.alert(
        "Delete logged entries",
        `Delete all ${entries.length} logged entries in ${capitalizeTag(sectionTag)}?`,
        [
          { text: "Cancel", style: "cancel" },
          { text: "Delete", style: "destructive", onPress: doDelete },
        ],
      );
    }
  };

  const renderItemRow = (fi: FlattenedLogItem, idx: number) => {
    const { logId, item } = fi;
    const itemId = String(item._id ?? (item as { id?: unknown }).id ?? `${logId}-item-${idx}`);
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

    const pickKey = item._id
      ? selectionKey(logId, String(item._id))
      : null;
    const selectableRow = selecting && pickKey !== null;
    const isSelected =
      pickKey !== null && Boolean(selectedKeys?.has(pickKey));

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

        {selectableRow ? null : (
          <View style={{ flexDirection: "row", alignItems: "center" }}>
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
  };

  return (
    <Card
      testID={sectionTestId}
      className={
        isPlannedOccurrence
          ? "border-blue-300/70 dark:border-blue-800/50 bg-blue-50/40 dark:bg-blue-950/20"
          : undefined
      }
    >
      {/* Header — matching web header: icon tile, title, time, cal, +, kebab, collapse chevron */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 8,
        }}
      >
        <Pressable
          testID={`nutrition-section-collapse-${sectionTag}`}
          accessibilityRole="button"
          accessibilityLabel={`${isCollapsed ? "Expand" : "Collapse"} ${capitalizeTag(sectionTag)}`}
          onPress={() => setIsCollapsed((c) => !c)}
          style={{
            flexDirection: "row",
            alignItems: "center",
            flex: 1,
            minWidth: 0,
            gap: 10,
          }}
        >
          <View
            testID={`nutrition-section-icon-${sectionTag}`}
            className={visuals.bgClass}
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <visuals.Icon size={16} color={colors.foreground} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                flexWrap: "wrap",
                gap: 6,
              }}
            >
              <Text
                testID={`${sectionTestId}-title`}
                className="text-foreground text-sm font-semibold truncate"
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
                <Text className="text-muted-foreground text-[11px] tabular-nums">
                  {timeLabel}
                </Text>
              ) : null}
              {hasContent ? (
                <Text className="text-muted-foreground text-xs tabular-nums">
                  {Math.round(totalCals)} cal
                </Text>
              ) : null}
            </View>
          </View>
        </Pressable>

        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          {empty && removable && onRemoveTag ? (
            <Pressable
              testID={`nutrition-remove-tag-${sectionTag}`}
              accessibilityLabel={`Remove tag ${sectionTag}`}
              accessibilityRole="button"
              onPress={() => onRemoveTag(sectionTag)}
              hitSlop={8}
              style={{ padding: 6 }}
            >
              <Trash2 size={16} color={colors.destructive} />
            </Pressable>
          ) : null}

          {/* Header + button (NP-320 web parity) */}
          <Pressable
            testID={`nutrition-add-food-${sectionTag}`}
            accessibilityLabel={`Add food to ${capitalizeTag(sectionTag)}`}
            accessibilityRole="button"
            onPress={() => onAddFood(sectionTag)}
            hitSlop={8}
            style={{
              width: 28,
              height: 28,
              borderRadius: 14,
              backgroundColor: colors.muted,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Plus size={16} color={colors.foreground} />
          </Pressable>

          {/* Tag kebab button (NP-320 web parity) */}
          <Pressable
            testID={`nutrition-section-kebab-${sectionTag}`}
            accessibilityLabel={`More actions for ${capitalizeTag(sectionTag)}`}
            accessibilityRole="button"
            onPress={(e) => {
              const target = e.target as {
                measureInWindow?: (
                  cb: (x: number, y: number, w: number, h: number) => void,
                ) => void;
              };
              if (target && typeof target.measureInWindow === "function") {
                target.measureInWindow((x, y, w, h) => {
                  setKebabPos({ top: y + h + 4, right: 16 });
                  setKebabOpen(true);
                });
              } else {
                setKebabPos({ top: 120, right: 16 });
                setKebabOpen(true);
              }
            }}
            hitSlop={8}
            style={{
              width: 28,
              height: 28,
              borderRadius: 14,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <MoreVertical size={16} color={colors["muted-foreground"]} />
          </Pressable>

          {/* Collapse chevron */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={isCollapsed ? "Expand section" : "Collapse section"}
            onPress={() => setIsCollapsed((c) => !c)}
            hitSlop={8}
            style={{ padding: 4 }}
          >
            <ChevronDown
              size={16}
              color={colors["muted-foreground"]}
              style={{
                transform: [{ rotate: isCollapsed ? "-90deg" : "0deg" }],
              }}
            />
          </Pressable>
        </View>
      </View>

      {/* Kebab Dropdown Menu */}
      <Modal
        visible={kebabOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setKebabOpen(false)}
      >
        <Pressable
          style={{ flex: 1, backgroundColor: scrim }}
          onPress={() => setKebabOpen(false)}
        >
          <View
            testID={`nutrition-kebab-menu-${sectionTag}`}
            style={{
              position: "absolute",
              top: kebabPos.top,
              right: kebabPos.right,
              minWidth: 190,
              backgroundColor: colors.card,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: colors.border,
              overflow: "hidden",
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.15,
              shadowRadius: 8,
              elevation: 8,
            }}
          >
            {onPlan ? (
              <Pressable
                testID={`nutrition-kebab-plan-${sectionTag}`}
                accessibilityRole="button"
                accessibilityLabel="Plan for a future day…"
                onPress={() => {
                  setKebabOpen(false);
                  onPlan(sectionTag);
                }}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 10,
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                }}
              >
                <CalendarDays size={16} color="#3b82f6" />
                <Text className="text-foreground text-xs font-medium">
                  Plan for a future day…
                </Text>
              </Pressable>
            ) : null}

            {onApplyMeal ? (
              <Pressable
                testID={`nutrition-kebab-apply-${sectionTag}`}
                accessibilityRole="button"
                accessibilityLabel="Apply a saved meal…"
                onPress={() => {
                  setKebabOpen(false);
                  onApplyMeal(sectionTag);
                }}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 10,
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                  borderTopWidth: 1,
                  borderTopColor: colors.border,
                }}
              >
                <ChefHat size={16} color={colors.orange} />
                <Text className="text-foreground text-xs font-medium">
                  Apply a saved meal…
                </Text>
              </Pressable>
            ) : null}

            {canStartSelect ? (
              <Pressable
                testID={`nutrition-combine-start-${sectionTag}`}
                accessibilityRole="button"
                accessibilityLabel="Combine into a meal…"
                onPress={() => {
                  setKebabOpen(false);
                  setIsCollapsed(false);
                  onStartSelect?.(occurrence.key);
                }}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 10,
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                  borderTopWidth: 1,
                  borderTopColor: colors.border,
                }}
              >
                <ChefHat size={16} color={colors.success} />
                <Text className="text-foreground text-xs font-medium">
                  Combine into a meal…
                </Text>
              </Pressable>
            ) : null}

            {hasLogs ? (
              <Pressable
                testID={`nutrition-kebab-delete-${sectionTag}`}
                accessibilityRole="button"
                accessibilityLabel="Delete logged entries"
                onPress={handleDeleteSection}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 10,
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                  borderTopWidth: 1,
                  borderTopColor: colors.border,
                }}
              >
                <Trash2 size={16} color={colors.destructive} />
                <Text className="text-destructive text-xs font-medium">
                  {flattenedItems.length === 1
                    ? "Delete logged entry"
                    : "Delete logged entries"}
                </Text>
              </Pressable>
            ) : null}
          </View>
        </Pressable>
      </Modal>

      {/* Select mode banner */}
      {selecting ? (
        <View
          testID={`nutrition-combine-bar-${sectionTag}`}
          className="border border-emerald-200 dark:border-emerald-900/40 bg-emerald-50 dark:bg-emerald-900/20"
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 8,
            marginBottom: 8,
            paddingHorizontal: 10,
            paddingVertical: 8,
            borderRadius: 10,
          }}
        >
          <View style={{ flex: 1 }}>
            <Text
              testID={`nutrition-combine-count-${sectionTag}`}
              className="text-emerald-900 dark:text-emerald-100 text-xs font-semibold"
            >
              {picked.length === 0
                ? "Tap items to combine"
                : `${picked.length} selected`}
            </Text>
            {picked.length > 0 ? (
              <Text className="text-emerald-700 dark:text-emerald-300 text-xs mt-0.5">
                {Math.round(pickedTotals.calories)} kcal ·{" "}
                {Math.round(pickedTotals.protein)}g P ·{" "}
                {Math.round(pickedTotals.carbs)}g C ·{" "}
                {Math.round(pickedTotals.fats)}g F
              </Text>
            ) : null}
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
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
            <Pressable
              testID={`nutrition-combine-submit-${sectionTag}`}
              accessibilityLabel={`Combine ${picked.length} selected items`}
              accessibilityRole="button"
              accessibilityState={{ disabled: !canCombine(picked) }}
              disabled={!canCombine(picked)}
              onPress={onCombine}
              hitSlop={8}
              className="bg-emerald-600"
              style={{
                paddingHorizontal: 10,
                paddingVertical: 6,
                borderRadius: 8,
                opacity: canCombine(picked) ? 1 : 0.5,
              }}
            >
              <Text className="text-white text-xs font-semibold">Combine</Text>
            </Pressable>
          </View>
        </View>
      ) : null}

      {/* Content — hidden while collapsed */}
      {isCollapsed ? null : !hasContent ? (
        <View style={{ paddingVertical: 12 }}>
          <Text className="text-muted-foreground text-sm italic">
            No foods logged yet
          </Text>
        </View>
      ) : (
        <View style={{ marginTop: 4 }}>
          {/* Groups: MEAL rows, DESCRIBED/capture rows, and loose rows */}
          {hasLogs &&
            groups.map((group) => {
              const groupTotalCals = group.items.reduce((s, fi) => {
                const nut = fi.item.nutrition ?? { calories: 0 };
                const servings =
                  typeof fi.item.servings === "number" && fi.item.servings > 0
                    ? fi.item.servings
                    : 1;
                return s + (nut.calories ?? 0) * servings;
              }, 0);

              // 1. MEAL Group Card
              if (group.mealName) {
                const isExpanded = expandedMealGroups[group.key] ?? false;
                const first = group.items[0];
                return (
                  <View
                    key={group.key}
                    testID={`meal-group-${first.logId}`}
                    className="border border-orange-200 dark:border-orange-900/40 bg-orange-50/40 dark:bg-orange-900/10"
                    style={{
                      borderRadius: 12,
                      marginVertical: 4,
                      overflow: "hidden",
                    }}
                  >
                    <Pressable
                      onPress={() =>
                        setExpandedMealGroups((prev) => ({
                          ...prev,
                          [group.key]: !isExpanded,
                        }))
                      }
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        paddingHorizontal: 10,
                        paddingVertical: 8,
                        gap: 8,
                      }}
                    >
                      <ChefHat size={14} color={colors.orange} />
                      <Text className="text-orange-600 dark:text-orange-400 text-[10px] font-bold uppercase tracking-wider">
                        MEAL
                      </Text>
                      <Text
                        className="text-foreground text-sm font-semibold flex-1 truncate"
                        numberOfLines={1}
                      >
                        {group.mealName}
                      </Text>
                      <Text className="text-muted-foreground text-xs tabular-nums">
                        {Math.round(groupTotalCals)} cal
                      </Text>
                      {onEditMeal && first ? (
                        <Pressable
                          testID={`nutrition-edit-meal-${first.logId}`}
                          accessibilityLabel={`Edit ${group.mealName || "meal"}`}
                          accessibilityRole="button"
                          onPress={(e) => {
                            e.stopPropagation?.();
                            onEditMeal(
                              first.logId,
                              group.mealName,
                              sectionTag,
                            );
                          }}
                          hitSlop={8}
                          style={{ padding: 4 }}
                        >
                          <Pencil
                            size={14}
                            color={colors["muted-foreground"]}
                          />
                        </Pressable>
                      ) : null}
                      <ChevronDown
                        size={14}
                        color={colors["muted-foreground"]}
                        style={{
                          transform: [
                            { rotate: isExpanded ? "0deg" : "-90deg" },
                          ],
                        }}
                      />
                    </Pressable>

                    {isExpanded && (
                      <View
                        style={{
                          paddingHorizontal: 10,
                          borderTopWidth: 1,
                          borderTopColor: colors.border,
                        }}
                      >
                        {group.items.map((fi, idx) =>
                          renderItemRow(fi, idx),
                        )}
                        {onAddToMeal && first ? (
                          <Pressable
                            testID={`nutrition-add-to-meal-${sectionTag}`}
                            accessibilityLabel={`Add to this meal in ${capitalizeTag(sectionTag)}`}
                            accessibilityRole="button"
                            onPress={() =>
                              onAddToMeal(first.logId, sectionTag)
                            }
                            style={{
                              flexDirection: "row",
                              alignItems: "center",
                              justifyContent: "center",
                              gap: 6,
                              paddingVertical: 8,
                              borderTopWidth: 1,
                              borderTopColor: colors.border,
                            }}
                          >
                            <Plus size={14} color={colors.primary} />
                            <Text className="text-primary text-xs font-semibold">
                              Add food to this meal
                            </Text>
                          </Pressable>
                        ) : null}
                      </View>
                    )}
                  </View>
                );
              }

              // 2. DESCRIBED / CAPTURE Group Card
              if (
                group.source &&
                group.source !== "manual" &&
                group.source !== "search" &&
                group.items.length > 1
              ) {
                const isExpanded = expandedCaptureGroups[group.key] ?? false;
                const source = group.source.toLowerCase();
                const CaptureIcon =
                  source === "describe"
                    ? PencilLine
                    : source === "barcode"
                      ? ScanBarcode
                      : source === "upload"
                        ? Upload
                        : Camera;
                const label =
                  source === "describe"
                    ? "DESCRIBED"
                    : source === "barcode"
                      ? "BARCODE"
                      : source === "upload"
                        ? "UPLOAD"
                        : "PHOTO";

                return (
                  <View
                    key={group.key}
                    testID={`capture-group-${group.items[0]?.logId}`}
                    className="border border-cyan-200 dark:border-cyan-900/40 bg-cyan-50/40 dark:bg-cyan-900/10"
                    style={{
                      borderRadius: 12,
                      marginVertical: 4,
                      overflow: "hidden",
                    }}
                  >
                    <Pressable
                      onPress={() =>
                        setExpandedCaptureGroups((prev) => ({
                          ...prev,
                          [group.key]: !isExpanded,
                        }))
                      }
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        paddingHorizontal: 10,
                        paddingVertical: 8,
                        gap: 8,
                      }}
                    >
                      <CaptureIcon size={14} color="#06b6d4" />
                      <Text className="text-cyan-600 dark:text-cyan-400 text-[10px] font-bold uppercase tracking-wider">
                        {label}
                      </Text>
                      <Text className="text-foreground text-xs font-medium flex-1">
                        {group.items.length} items
                      </Text>
                      <Text className="text-muted-foreground text-xs tabular-nums">
                        {Math.round(groupTotalCals)} cal
                      </Text>
                      <ChevronDown
                        size={14}
                        color={colors["muted-foreground"]}
                        style={{
                          transform: [
                            { rotate: isExpanded ? "0deg" : "-90deg" },
                          ],
                        }}
                      />
                    </Pressable>

                    {isExpanded && (
                      <View
                        style={{
                          paddingHorizontal: 10,
                          borderTopWidth: 1,
                          borderTopColor: colors.border,
                        }}
                      >
                        {group.items.map((fi, idx) =>
                          renderItemRow(fi, idx),
                        )}
                      </View>
                    )}
                  </View>
                );
              }

              // 3. Loose items
              return (
                <View key={group.key}>
                  {group.items.map((fi, idx) => renderItemRow(fi, idx))}
                </View>
              );
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
                  onEditPlanItem={onEditPlanItem}
                />
              ))}
            </View>
          )}

          {/* Card footer totals (NP-320 parity: P: 36g C: 84g F: 6g  528 cal) */}
          <View
            testID={`nutrition-section-footer-${sectionTag}`}
            style={{
              borderTopWidth: 1,
              borderTopColor: colors.border,
              paddingTop: 10,
              marginTop: 8,
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <View style={{ flexDirection: "row", gap: 12 }}>
              <Text className="text-muted-foreground text-xs font-mono">
                P: {Math.round(totalProtein)}g
              </Text>
              <Text className="text-muted-foreground text-xs font-mono">
                C: {Math.round(totalCarbs)}g
              </Text>
              <Text className="text-muted-foreground text-xs font-mono">
                F: {Math.round(totalFats)}g
              </Text>
            </View>
            <Text className="text-foreground text-xs font-semibold font-mono">
              {Math.round(totalCals)} cal
            </Text>
          </View>
        </View>
      )}
    </Card>
  );
}
