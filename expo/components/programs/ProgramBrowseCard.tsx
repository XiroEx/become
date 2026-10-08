import { View, Pressable } from "react-native";
import { Bookmark, ChevronRight } from "lucide-react-native";
import { Text } from "@/components/Text";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";
import type { ProgramSummary } from "./ProgramsList";

export interface ProgramBrowseCardProps {
  item: ProgramSummary;
  onItemPress?: (id: string) => void;
  onToggleSave?: (id: string) => void | Promise<void>;
  isSaved?: boolean;
  isSaving?: boolean;
  testID?: string;
}

export function ProgramBrowseCard({
  item,
  onItemPress,
  onToggleSave,
  isSaved = false,
  isSaving = false,
  testID = "program-browse-card",
}: ProgramBrowseCardProps) {
  const { colors } = useThemeTokens();
  const visibleTags = item.tags?.slice(0, 4) ?? [];
  const extraTags = (item.tags?.length ?? 0) - visibleTags.length;

  return (
    <View
      testID={testID}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        marginBottom: 12,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: 16,
        backgroundColor: colors.card,
        padding: 16,
      }}
    >
      {onToggleSave ? (
        <Pressable
          testID={`${testID}-save-${item.id}`}
          onPress={() => onToggleSave(item.id)}
          disabled={isSaving}
          accessibilityRole="button"
          accessibilityLabel={
            isSaved
              ? `Unsave program ${item.name}`
              : `Save program ${item.name}`
          }
          className="p-1 shrink-0"
        >
          <Bookmark
            color={isSaved ? colors.success : colors["muted-foreground"]}
            fill={isSaved ? colors.success : "transparent"}
            size={20}
            strokeWidth={1.5}
          />
        </Pressable>
      ) : null}

      <Pressable
        testID={`${testID}-item-${item.id}`}
        onPress={() => onItemPress?.(item.id)}
        accessibilityRole="button"
        accessibilityLabel={`Open program ${item.name}`}
        style={{ flex: 1 }}
      >
        <Text
          testID={`${testID}-title-${item.id}`}
          className="text-foreground text-base font-semibold leading-snug"
          numberOfLines={1}
        >
          {item.name}
        </Text>
        {item.durationWeeks || item.trainingDaysPerWeek ? (
          <View
            style={{
              flexDirection: "row",
              flexWrap: "wrap",
              gap: 6,
              marginTop: 4,
            }}
          >
            {item.durationWeeks ? (
              <View className="rounded-full bg-muted px-2 py-0.5">
                <Text className="text-muted-foreground text-xs font-medium">
                  {item.durationWeeks}w
                </Text>
              </View>
            ) : null}
            {item.trainingDaysPerWeek ? (
              <View className="rounded-full bg-muted px-2 py-0.5">
                <Text className="text-muted-foreground text-xs font-medium">
                  {item.trainingDaysPerWeek}x/wk
                </Text>
              </View>
            ) : null}
          </View>
        ) : null}
        {item.targetUser ? (
          <Text className="text-muted-foreground text-sm mt-1">
            {item.targetUser}
          </Text>
        ) : null}
        {visibleTags.length > 0 ? (
          <View
            style={{
              flexDirection: "row",
              flexWrap: "wrap",
              gap: 4,
              marginTop: 6,
            }}
          >
            {visibleTags.map((tag) => (
              <View
                key={tag}
                className="rounded-full bg-success/10 px-2 py-0.5"
              >
                <Text className="text-success text-xs font-medium">{tag}</Text>
              </View>
            ))}
            {extraTags > 0 ? (
              <Text className="text-muted-foreground text-xs">
                +{extraTags} more
              </Text>
            ) : null}
          </View>
        ) : null}
      </Pressable>

      <ChevronRight
        color={colors["muted-foreground"]}
        size={20}
        strokeWidth={1.5}
      />
    </View>
  );
}
