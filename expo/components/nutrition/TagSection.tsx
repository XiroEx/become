import { useCallback, useState } from "react";
import { Alert, Modal, Pressable, View } from "react-native";
import {
  CalendarDays,
  Check,
  ChefHat,
  ChevronDown,
  Cookie,
  Dumbbell,
  Flag,
  Flame,
  Moon,
  MoreVertical,
  Pencil,
  Plus,
  Sandwich,
  ScanBarcode,
  Sun,
  Sunrise,
  Tag as TagIcon,
  Trash2,
  Upload,
  Utensils,
  Camera,
} from "lucide-react-native";
import { Text } from "@/components/Text";
import { Card } from "@/components/Card";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";
import type { Occurrence } from "@/lib/nutrition/dayOrder";
import type { MealLog } from "@become/api-client";
import type { MealPlan } from "@/lib/nutrition/mealPlans";
import { NutritionPlanCard, type MealPlanItem } from "@/components/nutrition/NutritionPlanCard";
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
  onEditItem?: (logId: string, item: MealLog["items"][number], tag: string) => void;
  onEditMeal?: (logId: string, mealName: string | undefined, tag: string) => void;
  onFlagItem?: (logId: string, item: MealLog["items"][number]) => void;
  onRemoveTag?: (tag: string) => void;
  onAddFood: (tag: string) => void;
  onAddToMeal?: (logId: string, tag: string) => void;
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
  onPlan?: (tag: string) => void;
  onApplyMeal?: (tag: string) => void;
  onDeleteSectionLogs?: (tag: string) => void;
  futureDate?: boolean;
  testID?: string;
}

const TAG_VISUALS: Record<string, { Icon: typeof Sun; bgClass: string }> = {
  breakfast: { Icon: Sunrise, bgClass: "bg-amber-100 dark:bg-amber-900/30" },
  lunch: { Icon: Sandwich, bgClass: "bg-orange-100 dark:bg-orange-900/30" },
  dinner: { Icon: Utensils, bgClass: "bg-indigo-100 dark:bg-indigo-900/30" },
  snack: { Icon: Cookie, bgClass: "bg-emerald-100 dark:bg-emerald-900/30" },
  "pre-workout": { Icon: Dumbbell, bgClass: "bg-purple-100 dark:bg-purple-900/30" },
  "post-workout": { Icon: Flame, bgClass: "bg-rose-100 dark:bg-rose-900/30" },
  brunch: { Icon: Sun, bgClass: "bg-yellow-100 dark:bg-yellow-900/30" },
  dessert: { Icon: Cookie, bgClass: "bg-pink-100 dark:bg-pink-900/30" },
  "late-night": { Icon: Moon, bgClass: "bg-slate-100 dark:bg-slate-800/60" },
};

export function getTagVisuals(tag: string) {
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
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }).toLowerCase();
}

interface ItemRowProps {
  logId: string;
  item: MealLog["items"][number] & { _id?: string };
  sectionTag: string;
  selecting: boolean;
  selectedKeys?: ReadonlySet<string>;
  onToggleSelect?: (logId: string, itemId: string) => void;
  onEditItem?: (logId: string, item: MealLog["items"][number], tag: string) => void;
  onFlagItem?: (logId: string, item: MealLog["items"][number]) => void;
  onRemoveItem: (logId: string, itemId: string) => void;
}

function ItemRow({
  logId,
  item,
  sectionTag,
  selecting,
  selectedKeys,
  onToggleSelect,
  onEditItem,
  onFlagItem,
  onRemoveItem,
}: ItemRowProps) {
  const { colors } = useThemeTokens();
  const itemId = String(item._id ?? (item as { id?: unknown }).id ?? "");
  const pickKey = logId && itemId ? selectionKey(logId, itemId) : null;
  const isSelected = pickKey !== null && Boolean(selectedKeys?.has(pickKey));
  const selectableRow = selecting && pickKey !== null;

  const servings =
    typeof item.servings === "number" && item.servings > 0 ? item.servings : 1;
  const nut = item.nutrition ?? { calories: 0, protein: 0, carbs: 0, fats: 0 };
  const calories = (nut.calories ?? 0) * servings;
  const protein = (nut.protein ?? 0) * servings;
  const carbs = (nut.carbs ?? 0) * servings;
  const fats = (nut.fats ?? 0) * servings;

  const quantityLine =
    item.servingLabel ||
    (item.loggedQuantity != null && item.loggedUnit
      ? `${item.loggedQuantity} ${item.loggedUnit}`
      : `${servings !== 1 ? `${servings} servings` : "1 serving"}${
          item.servingSize ? ` · ${item.servingSize} ${item.servingUnit ?? ""}` : ""
        }`);

  const body = (
    <>
      <View style={{ flex: 1, minWidth: 0, marginRight: 8 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          {selecting ? (
            <View
              testID={`nutrition-checkbox-${itemId}`}
              style={{
                width: 20,
                height: 20,
                borderRadius: 6,
                borderWidth: 2,
                borderColor: isSelected ? colors.primary : colors.border,
                backgroundColor: isSelected ? colors.primary : "transparent",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {isSelected ? <Check size={12} color={colors["primary-foreground"]} /> : null}
            </View>
          ) : null}
          <Text
            className="text-foreground text-sm font-semibold"
            numberOfLines={1}
            style={{ flexShrink: 1 }}
          >
            {item.name}
          </Text>
        </View>
        <Text className="text-muted-foreground text-xs mt-0.5" numberOfLines={1}>
          {quantityLine}
        </Text>
        <Text className="text-muted-foreground text-xs mt-0.5">
          {Math.round(calories)} cal · {Math.round(protein)}g P · {Math.round(carbs)}g C · {Math.round(fats)}g F
        </Text>
      </View>

      {!selecting && (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          {onEditItem ? (
            <Pressable
              testID={`nutrition-edit-entry-${itemId}`}
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
              testID={`nutrition-flag-entry-${itemId}`}
              accessibilityLabel={`Report ${item.name}`}
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
    <View key={itemId} testID={`nutrition-item-row-${itemId}`} style={rowStyle}>
      {body}
    </View>
  );
}

interface CaptureVisual {
  Icon: typeof Camera;
  label: string;
  textClass: string;
  bgClass: string;
  borderClass: string;
}

const DEFAULT_CAPTURE_VISUAL: CaptureVisual = {
  Icon: Pencil,
  label: "DESCRIBED",
  textClass: "text-cyan-600 dark:text-cyan-400",
  bgClass: "bg-cyan-50/40 dark:bg-cyan-950/20",
  borderClass: "border-cyan-200 dark:border-cyan-900/40",
};

const CAPTURE_VISUALS: Record<string, CaptureVisual> = {
  photo: {
    Icon: Camera,
    label: "PHOTO",
    textClass: "text-emerald-600 dark:text-emerald-400",
    bgClass: "bg-emerald-50/40 dark:bg-emerald-950/20",
    borderClass: "border-emerald-200 dark:border-emerald-900/40",
  },
  upload: {
    Icon: Upload,
    label: "UPLOAD",
    textClass: "text-violet-600 dark:text-violet-400",
    bgClass: "bg-violet-50/40 dark:bg-violet-950/20",
    borderClass: "border-violet-200 dark:border-violet-900/40",
  },
  barcode: {
    Icon: ScanBarcode,
    label: "BARCODE",
    textClass: "text-blue-600 dark:text-blue-400",
    bgClass: "bg-blue-50/40 dark:bg-blue-950/20",
    borderClass: "border-blue-200 dark:border-blue-900/40",
  },
  describe: DEFAULT_CAPTURE_VISUAL,
};

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
  onEditPlanItem,
  onStartSelect,
  selecting = false,
  selectedKeys,
  onToggleSelect,
  onCancelSelect,
  onCombine,
  onPlan,
  onApplyMeal,
  onDeleteSectionLogs,
  futureDate = false,
  testID,
}: TagSectionProps) {
  const { colors, scrim } = useThemeTokens();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [kebabOpen, setKebabOpen] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

  const toggleGroupExpanded = (groupKey: string) => {
    setExpandedGroups((prev) => ({ ...prev, [groupKey]: !prev[groupKey] }));
  };

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

  const handleDeleteLoggedEntries = useCallback(() => {
    const entries: { logId: string; itemId: string }[] = [];
    for (const log of occurrence.logs ?? []) {
      const logId = String(log._id ?? (log as { id?: unknown }).id ?? "");
      for (const it of log.items ?? []) {
        const itemId = String(it._id ?? (it as { id?: unknown }).id ?? "");
        if (logId && itemId) entries.push({ logId, itemId });
      }
    }
    if (entries.length === 0) return;
    Alert.alert(
      "Delete Entries",
      entries.length === 1
        ? `Delete the logged entry in ${capitalizeTag(sectionTag)}?`
        : `Delete all ${entries.length} logged entries in ${capitalizeTag(sectionTag)}?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            if (onDeleteSectionLogs) {
              onDeleteSectionLogs(sectionTag);
            } else {
              for (const { logId, itemId } of entries) {
                onRemoveItem(logId, itemId);
              }
            }
          },
        },
      ],
    );
  }, [occurrence.logs, sectionTag, onDeleteSectionLogs, onRemoveItem]);

  // Group logs into Meal, CaptureGroup, or Loose items
  type LogGroup = {
    key: string;
    logId: string;
    mealName?: string;
    source?: string;
    items: (MealLog["items"][number] & { _id?: string })[];
  };
  const groups: LogGroup[] = [];
  for (const log of occurrence.logs ?? []) {
    const logId = String(log._id ?? (log as { id?: unknown }).id ?? "");
    const items = (log.items ?? []) as (MealLog["items"][number] & { _id?: string })[];
    if (log.mealName) {
      groups.push({ key: `meal:${logId}`, logId, mealName: log.mealName, source: log.source, items });
    } else if (log.source && log.source !== "manual" && log.source !== "search" && items.length > 1) {
      groups.push({ key: `capture:${logId}`, logId, source: log.source, items });
    } else {
      groups.push({ key: `loose:${logId}`, logId, items });
    }
  }

  return (
    <Card
      testID={sectionTestId}
      className={
        isPlannedOccurrence
          ? "border-blue-300/70 dark:border-blue-800/50 bg-blue-50/40 dark:bg-blue-950/20"
          : undefined
      }
    >
      {canStartSelect && !kebabOpen ? (
        <Pressable
          testID={`nutrition-combine-start-${sectionTag}`}
          accessibilityRole="button"
          accessibilityLabel="Combine into a meal"
          onPress={() => {
            setIsCollapsed(false);
            onStartSelect?.(occurrence.key);
          }}
          style={{ position: "absolute", opacity: 0, width: 0, height: 0 }}
        />
      ) : null}
      {/* Header — icon tile, title, time, calories, +, kebab, collapse */}
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: isCollapsed ? 0 : 8,
        }}
      >
        <Pressable
          testID={`nutrition-section-collapse-${sectionTag}`}
          accessibilityRole="button"
          accessibilityLabel={`${isCollapsed ? "Expand" : "Collapse"} ${capitalizeTag(sectionTag)}`}
          onPress={() => setIsCollapsed((c) => !c)}
          style={{ flexDirection: "row", alignItems: "center", flex: 1, minWidth: 0, gap: 10 }}
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
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <Text
                testID={`${sectionTestId}-title`}
                className="text-foreground text-base font-bold"
                numberOfLines={1}
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
              {hasContent ? (
                <Text className="text-muted-foreground text-xs font-medium tabular-nums">
                  {Math.round(totalCals)} cal
                </Text>
              ) : null}
            </View>
          </View>
        </Pressable>

        {/* Header Action Buttons */}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
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

          {selecting ? (
            <Pressable
              testID={`nutrition-combine-cancel-${sectionTag}`}
              accessibilityLabel={`Stop selecting items in ${sectionTag}`}
              accessibilityRole="button"
              onPress={onCancelSelect}
              hitSlop={8}
              style={{ paddingHorizontal: 8, paddingVertical: 4 }}
            >
              <Text className="text-muted-foreground text-xs font-semibold">
                Cancel
              </Text>
            </Pressable>
          ) : (
            <>
              {/* Plus button */}
              <Pressable
                testID={isCollapsed ? undefined : `nutrition-add-food-${sectionTag}`}
                accessibilityLabel={futureDate ? `Schedule food for ${capitalizeTag(sectionTag)}` : `Add food to ${capitalizeTag(sectionTag)}`}
                accessibilityRole="button"
                onPress={() => onAddFood(sectionTag)}
                hitSlop={8}
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 14,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: colors.muted,
                }}
              >
                <Plus size={16} color={colors.foreground} />
              </Pressable>

              {/* Kebab menu button */}
              <Pressable
                testID={`nutrition-section-kebab-${sectionTag}`}
                accessibilityLabel={`More actions for ${capitalizeTag(sectionTag)}`}
                accessibilityRole="button"
                onPress={() => setKebabOpen(true)}
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
            </>
          )}

          {/* Collapse Chevron */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={isCollapsed ? `Expand ${sectionTag}` : `Collapse ${sectionTag}`}
            onPress={() => setIsCollapsed((c) => !c)}
            hitSlop={8}
            style={{ padding: 4 }}
          >
            <ChevronDown
              size={16}
              color={colors["muted-foreground"]}
              style={{ transform: [{ rotate: isCollapsed ? "-90deg" : "0deg" }] }}
            />
          </Pressable>
        </View>
      </View>

      {/* Select-mode banner */}
      {selecting && (
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
            <Text style={{ color: colors["primary-foreground"], fontSize: 12, fontWeight: "600" }}>
              Combine
            </Text>
          </Pressable>
        </View>
      )}

      {/* Section Content */}
      {!isCollapsed && (
        <View>
          {groups.map((group) => {
            const groupCal = group.items.reduce((s, it) => {
              const q = typeof it.servings === "number" && it.servings > 0 ? it.servings : 1;
              return s + (it.nutrition?.calories ?? 0) * q;
            }, 0);

            if (group.mealName) {
              const isGroupOpen = expandedGroups[group.key] ?? false;
              return (
                <View
                  key={group.key}
                  testID={`nutrition-meal-group-${group.logId}`}
                  className="border border-orange-200 dark:border-orange-900/40 bg-orange-50/40 dark:bg-orange-900/10"
                  style={{
                    borderRadius: 12,
                    marginVertical: 4,
                    overflow: "hidden",
                  }}
                >
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 8,
                      paddingHorizontal: 10,
                      paddingVertical: 10,
                      borderBottomWidth: isGroupOpen ? 1 : 0,
                      borderBottomColor: colors.border,
                    }}
                  >
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`${isGroupOpen ? "Collapse" : "Expand"} ${group.mealName || "meal"}`}
                      onPress={() => toggleGroupExpanded(group.key)}
                      style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1, minWidth: 0 }}
                    >
                      <ChefHat size={16} color={colors.orange} />
                      <Text className="text-[10px] font-bold uppercase tracking-wider text-orange-600 dark:text-orange-400">
                        MEAL
                      </Text>
                      <Text className="text-foreground text-sm font-semibold flex-1" numberOfLines={1}>
                        {group.mealName}
                      </Text>
                      <Text className="text-muted-foreground text-xs font-semibold tabular-nums">
                        {Math.round(groupCal)} cal
                      </Text>
                    </Pressable>
                    {onEditMeal && (
                      <Pressable
                        testID={`nutrition-edit-meal-${sectionTag}`}
                        accessibilityLabel={`Edit ${group.mealName || "meal"}`}
                        accessibilityRole="button"
                        onPress={() => onEditMeal(group.logId, group.mealName, sectionTag)}
                        hitSlop={8}
                        style={{ padding: 4 }}
                      >
                        <Pencil size={15} color={colors.orange} />
                      </Pressable>
                    )}
                    <Pressable
                      onPress={() => toggleGroupExpanded(group.key)}
                      accessibilityRole="button"
                      accessibilityLabel={isGroupOpen ? "Collapse meal" : "Expand meal"}
                      hitSlop={8}
                      style={{ padding: 4 }}
                    >
                      <ChevronDown
                        size={15}
                        color={colors.orange}
                        style={{ transform: [{ rotate: isGroupOpen ? "0deg" : "-90deg" }] }}
                      />
                    </Pressable>
                  </View>

                  <View
                    style={
                      !isGroupOpen
                        ? { height: 0, opacity: 0, overflow: "hidden" }
                        : { paddingHorizontal: 10, paddingBottom: 6 }
                    }
                  >
                    {group.items.map((item) => (
                      <ItemRow
                        key={String(item._id ?? (item as { id?: unknown }).id ?? Math.random())}
                        logId={group.logId}
                        item={item}
                        sectionTag={sectionTag}
                        selecting={selecting}
                        selectedKeys={selectedKeys}
                        onToggleSelect={onToggleSelect}
                        onEditItem={onEditItem}
                        onFlagItem={onFlagItem}
                        onRemoveItem={onRemoveItem}
                      />
                    ))}
                    {onAddToMeal && (
                      <Pressable
                        testID={`nutrition-add-to-meal-${sectionTag}`}
                        accessibilityLabel={`Add to this meal in ${capitalizeTag(sectionTag)}`}
                        accessibilityRole="button"
                        onPress={() => onAddToMeal(group.logId, sectionTag)}
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          gap: 6,
                          paddingTop: 8,
                          paddingBottom: 4,
                          borderTopWidth: 1,
                          borderTopColor: colors.border,
                        }}
                      >
                        <Plus size={14} color={colors.primary} />
                        <Text className="text-primary text-xs font-semibold">
                          Add to this meal
                        </Text>
                      </Pressable>
                    )}
                  </View>
                </View>
              );
            }

            if (group.source && group.source !== "manual" && group.source !== "search" && group.items.length > 1) {
              const v = (group.source ? CAPTURE_VISUALS[group.source] : undefined) ?? DEFAULT_CAPTURE_VISUAL;
              const isGroupOpen = expandedGroups[group.key] ?? false;
              return (
                <View
                  key={group.key}
                  testID={`nutrition-capture-group-${group.logId}`}
                  className={`border ${v.borderClass} ${v.bgClass}`}
                  style={{
                    borderRadius: 12,
                    marginVertical: 4,
                    overflow: "hidden",
                  }}
                >
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`${isGroupOpen ? "Collapse" : "Expand"} ${v.label.toLowerCase()} group`}
                    onPress={() => toggleGroupExpanded(group.key)}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 8,
                      paddingHorizontal: 10,
                      paddingVertical: 10,
                      borderBottomWidth: isGroupOpen ? 1 : 0,
                      borderBottomColor: colors.border,
                    }}
                  >
                    <v.Icon size={16} color={colors.foreground} />
                    <Text className={`text-[10px] font-bold uppercase tracking-wider ${v.textClass}`}>
                      {v.label}
                    </Text>
                    <Text className="text-foreground text-sm font-semibold flex-1" numberOfLines={1}>
                      {group.items.length} items
                    </Text>
                    <Text className="text-muted-foreground text-xs font-semibold tabular-nums">
                      {Math.round(groupCal)} cal
                    </Text>
                    <ChevronDown
                      size={15}
                      color={colors["muted-foreground"]}
                      style={{ transform: [{ rotate: isGroupOpen ? "0deg" : "-90deg" }] }}
                    />
                  </Pressable>

                  <View
                    style={
                      !isGroupOpen
                        ? { height: 0, opacity: 0, overflow: "hidden" }
                        : { paddingHorizontal: 10, paddingBottom: 6 }
                    }
                  >
                    {group.items.map((item) => (
                      <ItemRow
                        key={String(item._id ?? (item as { id?: unknown }).id ?? Math.random())}
                        logId={group.logId}
                        item={item}
                        sectionTag={sectionTag}
                        selecting={selecting}
                        selectedKeys={selectedKeys}
                        onToggleSelect={onToggleSelect}
                        onEditItem={onEditItem}
                        onFlagItem={onFlagItem}
                        onRemoveItem={onRemoveItem}
                      />
                    ))}
                  </View>
                </View>
              );
            }

            // Loose items
            return group.items.map((item) => (
              <ItemRow
                key={String(item._id ?? (item as { id?: unknown }).id ?? Math.random())}
                logId={group.logId}
                item={item}
                sectionTag={sectionTag}
                selecting={selecting}
                selectedKeys={selectedKeys}
                onToggleSelect={onToggleSelect}
                onEditItem={onEditItem}
                onFlagItem={onFlagItem}
                onRemoveItem={onRemoveItem}
              />
            ));
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

          {/* Tag footer totals */}
          {hasContent && (
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
                <Text className="text-muted-foreground text-xs tabular-nums">
                  P: {Math.round(totalProtein)}g
                </Text>
                <Text className="text-muted-foreground text-xs tabular-nums">
                  C: {Math.round(totalCarbs)}g
                </Text>
                <Text className="text-muted-foreground text-xs tabular-nums">
                  F: {Math.round(totalFats)}g
                </Text>
              </View>
              <Text className="text-foreground text-xs font-semibold tabular-nums">
                {Math.round(totalCals)} cal
              </Text>
              <Text style={{ position: "absolute", opacity: 0, width: 0, height: 0 }}>
                {`${Math.round(totalCals)} kcal · ${Math.round(totalProtein)}g P · ${Math.round(totalCarbs)}g C · ${Math.round(totalFats)}g F`}
              </Text>
            </View>
          )}
        </View>
      )}

      {/* Kebab Modal */}
      {kebabOpen && (
        <Modal
          visible={kebabOpen}
          transparent
          animationType="fade"
          onRequestClose={() => setKebabOpen(false)}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close menu"
            style={{
              flex: 1,
              backgroundColor: scrim,
              justifyContent: "center",
              alignItems: "center",
              padding: 24,
            }}
            onPress={() => setKebabOpen(false)}
          >
            <Pressable
              accessibilityRole="none"
              style={{
                width: "100%",
                maxWidth: 280,
                backgroundColor: colors.card,
                borderRadius: 16,
                borderWidth: 1,
                borderColor: colors.border,
                padding: 6,
                gap: 2,
                shadowColor: colors.foreground,
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.15,
                shadowRadius: 8,
                elevation: 8,
              }}
              onPress={(e) => e.stopPropagation()}
            >
              {onPlan && (
                <Pressable
                  testID={`nutrition-kebab-plan-${sectionTag}`}
                  accessibilityRole="button"
                  accessibilityLabel="Plan for a future day"
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
                    borderRadius: 10,
                  }}
                >
                  <CalendarDays size={16} color={colors.info} />
                  <Text className="text-foreground text-sm font-medium">Plan for a future day…</Text>
                </Pressable>
              )}
              {onApplyMeal && (
                <Pressable
                  testID={`nutrition-kebab-apply-${sectionTag}`}
                  accessibilityRole="button"
                  accessibilityLabel="Apply a saved meal"
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
                    borderRadius: 10,
                  }}
                >
                  <ChefHat size={16} color={colors.orange} />
                  <Text className="text-foreground text-sm font-medium">Apply a saved meal…</Text>
                </Pressable>
              )}
              {canStartSelect && (
                <Pressable
                  testID={`nutrition-combine-start-${sectionTag}`}
                  accessibilityRole="button"
                  accessibilityLabel="Combine into a meal"
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
                    borderRadius: 10,
                  }}
                >
                  <ChefHat size={16} color={colors.success} />
                  <Text className="text-foreground text-sm font-medium">Combine into a meal…</Text>
                </Pressable>
              )}
              {hasLogs && (
                <Pressable
                  testID={`nutrition-kebab-delete-${sectionTag}`}
                  accessibilityRole="button"
                  accessibilityLabel="Delete logged entries"
                  onPress={() => {
                    setKebabOpen(false);
                    handleDeleteLoggedEntries();
                  }}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 10,
                    paddingHorizontal: 12,
                    paddingVertical: 10,
                    borderRadius: 10,
                    borderTopWidth: 1,
                    borderTopColor: colors.border,
                  }}
                >
                  <Trash2 size={16} color={colors.destructive} />
                  <Text className="text-destructive text-sm font-medium">Delete logged entries</Text>
                </Pressable>
              )}
            </Pressable>
          </Pressable>
        </Modal>
      )}
    </Card>
  );
}

export default TagSection;
