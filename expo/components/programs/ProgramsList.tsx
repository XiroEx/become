import { useState, useMemo } from "react";
import { View, Pressable } from "react-native";
import { Heart } from "lucide-react-native";
import { Text } from "@/components/Text";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";

export interface ProgramSummary {
  id: string;
  name: string;
  description: string;
  durationWeeks?: number;
  trainingDaysPerWeek?: number;
  goal?: string;
  targetUser?: "Beginner" | "Intermediate" | "Advanced";
  tags?: string[];
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
        return (
          <View
            key={item.id}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
              marginBottom: 8,
            }}
          >
            <Pressable
              testID={`${testID}-item-${item.id}`}
              onPress={() => onItemPress?.(item.id)}
              accessibilityRole="button"
              accessibilityLabel={`Open program ${item.name}`}
              style={{ flex: 1 }}
            >
              <Card title={item.name} subtitle={item.description}>
                {item.targetUser ? (
                  <Text className="text-muted-foreground text-xs">
                    {item.targetUser}
                    {item.durationWeeks
                      ? ` · ${item.durationWeeks} weeks`
                      : ""}
                    {item.trainingDaysPerWeek
                      ? ` · ${item.trainingDaysPerWeek}d / week`
                      : ""}
                  </Text>
                ) : null}
              </Card>
            </Pressable>
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
                className="p-3"
              >
                <Heart
                  color={
                    itemSaved ? colors.primary : colors["muted-foreground"]
                  }
                  fill={itemSaved ? colors.primary : "transparent"}
                  size={20}
                  strokeWidth={1.5}
                />
              </Pressable>
            ) : null}
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
