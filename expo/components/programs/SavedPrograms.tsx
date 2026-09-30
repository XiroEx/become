import { View, Pressable } from "react-native";
import { Text } from "@/components/Text";
import { GripVertical, Heart } from "lucide-react-native";
import { Card } from "@/components/Card";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";
import DraggableFlatList, {
  ScaleDecorator,
  RenderItemParams,
} from "react-native-draggable-flatlist";
import type { ProgramSummary } from "./ProgramsList";

export interface SavedProgramsProps {
  programs: ProgramSummary[];
  onItemPress?: (id: string) => void;
  onToggleSave?: (id: string) => Promise<void> | void;
  onReorder?: (programs: ProgramSummary[]) => void | Promise<void>;
  scrollEnabled?: boolean;
  testID?: string;
}

export function SavedPrograms({
  programs,
  onItemPress,
  onToggleSave,
  onReorder,
  scrollEnabled = false,
  testID = "saved-programs",
}: SavedProgramsProps) {
  const { colors } = useThemeTokens();

  if (programs.length === 0) {
    return (
      <View testID={`${testID}-empty`} style={{ padding: 16 }}>
        <Text className="text-muted-foreground text-center">
          No saved programs yet. Browse to save one.
        </Text>
      </View>
    );
  }

  const renderItem = ({
    item: p,
    drag,
    isActive,
  }: RenderItemParams<ProgramSummary>) => {
    return (
      <ScaleDecorator>
        <View
          key={p.id}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            marginBottom: 12,
            opacity: isActive ? 0.7 : 1,
          }}
        >
          {onReorder ? (
            <Pressable
              testID={`${testID}-drag-handle-${p.id}`}
              onLongPress={drag}
              delayLongPress={100}
              accessibilityRole="button"
              accessibilityLabel={`Reorder program ${p.name}`}
              className="p-2"
            >
              <GripVertical
                color={colors["muted-foreground"]}
                size={20}
                strokeWidth={1.5}
              />
            </Pressable>
          ) : null}

          <Pressable
            testID={`${testID}-item-${p.id}`}
            style={{ flex: 1 }}
            onPress={() => onItemPress?.(p.id)}
            onLongPress={onReorder ? drag : undefined}
            accessibilityRole="button"
            accessibilityLabel={`Open program ${p.name}`}
          >
            <Card title={p.name} subtitle={p.description}>
              {p.targetUser ? (
                <Text className="text-muted-foreground text-xs">
                  {p.targetUser}
                  {p.durationWeeks ? ` · ${p.durationWeeks} weeks` : ""}
                  {p.trainingDaysPerWeek
                    ? ` · ${p.trainingDaysPerWeek}d / week`
                    : ""}
                </Text>
              ) : null}
            </Card>
          </Pressable>

          <Pressable
            testID={`${testID}-unsave-${p.id}`}
            onPress={() => onToggleSave?.(p.id)}
            accessibilityRole="button"
            accessibilityLabel={`Unsave program ${p.name}`}
            className="p-3"
          >
            <Heart
              color={colors.primary}
              fill={colors.primary}
              size={20}
              strokeWidth={1.5}
            />
          </Pressable>
        </View>
      </ScaleDecorator>
    );
  };

  return (
    <View testID={testID} style={{ padding: 16 }}>
      <DraggableFlatList
        data={programs}
        keyExtractor={(item) => item.id}
        onDragEnd={({ data }) => {
          onReorder?.(data);
        }}
        renderItem={renderItem}
        scrollEnabled={scrollEnabled}
      />
    </View>
  );
}
