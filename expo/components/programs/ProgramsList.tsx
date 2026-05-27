import { useMemo, useState } from "react";
import { View, Text, Pressable } from "react-native";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";

export interface ProgramSummary {
  id: string;
  name: string;
  description: string;
  durationWeeks?: number;
  trainingDaysPerWeek?: number;
  goal?: string;
  targetUser?: "Beginner" | "Intermediate" | "Advanced";
}

export interface ProgramsListProps {
  programs: ProgramSummary[];
  pageSize?: number;
  onItemPress?: (id: string) => void;
  testID?: string;
}

const DEFAULT_PAGE_SIZE = 10;

export function ProgramsList({
  programs,
  pageSize = DEFAULT_PAGE_SIZE,
  onItemPress,
  testID = "programs-list",
}: ProgramsListProps) {
  const [page, setPage] = useState<number>(1);
  const visible = useMemo(
    () => programs.slice(0, page * pageSize),
    [programs, page, pageSize],
  );
  const hasMore = visible.length < programs.length;

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
      {visible.map((item) => (
        <Pressable
          key={item.id}
          testID={`${testID}-item-${item.id}`}
          onPress={() => onItemPress?.(item.id)}
          accessibilityRole="button"
          accessibilityLabel={`Open program ${item.name}`}
          className="mb-2"
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
      ))}
      {hasMore ? (
        <View style={{ paddingVertical: 12 }}>
          <Button
            testID={`${testID}-load-more`}
            variant="secondary"
            onPress={() => setPage((p) => p + 1)}
          >
            Load more
          </Button>
        </View>
      ) : null}
    </View>
  );
}
