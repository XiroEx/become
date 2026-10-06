import { useState, useMemo } from "react";
import { View, Pressable } from "react-native";
import { Bookmark, ChevronRight } from "lucide-react-native";
import { Text } from "@/components/Text";
import { Button } from "@/components/Button";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";

export interface ProgramSummary {
  id: string;
  name: string;
  description: string;
  durationWeeks?: number;
  trainingDaysPerWeek?: number;
  goal?: string;
  /**
   * Display copy, not an id — any of BROWSE_LEVELS
   * ("Beginner" … "Intermediate to Advanced"), matched against the raw
   * webapp `target_user` string. NP-278: narrowed to only 3 of the 5 values
   * for a while, which dropped the level line for every "X to Y" program.
   */
  targetUser?: string;
  tags?: string[];
  /** True only for a program created by the viewer (api-client's `isCustom`
   * on ProgramCatalogItem). NP-278: the browse catalog excludes these — a
   * member's own custom program belongs in "My Programs", not Browse. */
  isCustom?: boolean;
}

export interface ProgramsListProps {
  programs: ProgramSummary[];
  pageSize?: number;
  onItemPress?: (id: string) => void;
  onToggleSave?: (id: string) => void | Promise<void>;
  isSaved?: (id: string) => boolean;
  savedProgramIds?: Set<string>;
  hasMore?: boolean;
  onLoadMore?: () => void;
  serverPaging?: boolean;
  savingProgramId?: string | null;
  testID?: string;
}

const DEFAULT_PAGE_SIZE = 10;

export function ProgramsList({
  programs,
  pageSize = DEFAULT_PAGE_SIZE,
  onItemPress,
  onToggleSave,
  isSaved,
  savedProgramIds,
  hasMore,
  onLoadMore,
  serverPaging = false,
  savingProgramId,
  testID = "programs-list",
}: ProgramsListProps) {
  const { colors } = useThemeTokens();
  const [page, setPage] = useState<number>(1);
  const visible = useMemo(
    () => (serverPaging ? programs : programs.slice(0, page * pageSize)),
    [serverPaging, programs, page, pageSize],
  );
  const showHasMore = serverPaging
    ? Boolean(hasMore)
    : visible.length < programs.length;
  const handleLoadMore = serverPaging
    ? onLoadMore
    : () => setPage((p) => p + 1);

  if (programs.length === 0) {
    return (
      <View testID={testID}>
        <Text
          testID={`${testID}-empty`}
          className="text-muted-foreground text-center mt-6"
        >
          No programs yet.
        </Text>
      </View>
    );
  }

  return (
    <View testID={testID}>
      {visible.map((item) => {
        const itemSaved = Boolean(
          savedProgramIds?.has(item.id) || isSaved?.(item.id),
        );
        const isSaving = savingProgramId === item.id;
        const visibleTags = item.tags?.slice(0, 4) ?? [];
        const extraTags = (item.tags?.length ?? 0) - visibleTags.length;
        return (
          <View
            key={item.id}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 10,
              marginBottom: 12,
              borderWidth: 1,
              borderLeftWidth: 4,
              borderColor: colors.border,
              borderLeftColor: colors.success,
              borderRadius: 16,
              backgroundColor: colors.card,
              padding: 12,
            }}
          >
            {onToggleSave ? (
              <Pressable
                testID={`${testID}-save-${item.id}`}
                onPress={() => onToggleSave(item.id)}
                disabled={isSaving}
                accessibilityRole="button"
                accessibilityLabel={
                  itemSaved
                    ? `Unsave program ${item.name}`
                    : `Save program ${item.name}`
                }
                className="p-1 shrink-0"
              >
                <Bookmark
                  color={
                    itemSaved ? colors.success : colors["muted-foreground"]
                  }
                  fill={itemSaved ? colors.success : "transparent"}
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
              <View
                style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
              >
                <Text
                  testID={`${testID}-title-${item.id}`}
                  className="text-foreground text-base font-semibold flex-1"
                  numberOfLines={1}
                >
                  {item.name}
                </Text>
                <View style={{ flexDirection: "row", gap: 6, flexShrink: 0 }}>
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
              </View>
              {item.targetUser ? (
                <Text className="text-muted-foreground text-sm mt-0.5">
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
                      <Text className="text-success text-xs">{tag}</Text>
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
              size={18}
              strokeWidth={1.5}
            />
          </View>
        );
      })}
      {showHasMore && handleLoadMore ? (
        <View style={{ paddingVertical: 12 }}>
          <Button
            testID={`${testID}-load-more`}
            variant="secondary"
            onPress={handleLoadMore}
          >
            Load more
          </Button>
        </View>
      ) : null}
    </View>
  );
}
