import { Pressable, View } from "react-native";
import { Plus, Trash2 } from "lucide-react-native";
import { Text } from "@/components/Text";
import { Card } from "@/components/Card";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";
import type { Occurrence } from "@/lib/nutrition/dayOrder";
import type { MealLog } from "@become/api-client";

export interface TagSectionProps {
  occurrence: Occurrence<MealLog, any>;
  empty?: boolean;
  removable?: boolean;
  onRemoveItem: (logId: string, itemId: string) => void;
  onRemoveTag?: (tag: string) => void;
  onAddFood: (tag: string) => void;
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
  testID,
}: TagSectionProps) {
  const { colors } = useThemeTokens();
  const sectionTag = occurrence.tag;
  const sectionTestId = testID ?? `nutrition-section-${sectionTag}`;

  let totalCals = 0;
  let totalProtein = 0;
  let totalCarbs = 0;
  let totalFats = 0;

  for (const log of occurrence.logs) {
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

  const firstLog = occurrence.logs[0];
  const timeLabel = occurrence.untimed ? "Untimed" : formatTimeString(firstLog?.loggedAt);

  return (
    <Card testID={sectionTestId}>
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
            {timeLabel ? (
              <Text className="text-muted-foreground text-xs font-medium">
                {timeLabel}
              </Text>
            ) : null}
          </View>
          {!empty && (
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
      {empty ? (
        <View style={{ paddingVertical: 12 }}>
          <Text className="text-muted-foreground text-sm italic">
            No foods logged yet
          </Text>
        </View>
      ) : (
        <View style={{ marginTop: 4 }}>
          {occurrence.logs.flatMap((log) => {
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
