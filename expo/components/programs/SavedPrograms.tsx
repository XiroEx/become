import { View, Pressable } from "react-native";
import { Text } from "@/components/Text";
import { GripVertical, Bookmark } from "lucide-react-native";
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

/**
 * The web's "Saved for Later" row (NP-278): a COMPACT drag-to-reorder list —
 * drag handle, name, `Nw`/`Nx` chips, up to 3 amber tag chips, amber bookmark
 * to unsave. Not the large description-card layout the rest of the catalog
 * uses; the web never shows a saved program's description here.
 */
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
    const tags = p.tags?.slice(0, 3) ?? [];
    return (
      <ScaleDecorator>
        <View
          key={p.id}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
            marginBottom: 8,
            opacity: isActive ? 0.7 : 1,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: 12,
            backgroundColor: colors.card,
            paddingVertical: 8,
            paddingHorizontal: 8,
          }}
        >
          {onReorder ? (
            <Pressable
              testID={`${testID}-drag-handle-${p.id}`}
              onLongPress={drag}
              delayLongPress={100}
              accessibilityRole="button"
              accessibilityLabel={`Reorder program ${p.name}`}
              className="p-1.5 shrink-0"
            >
              <GripVertical
                color={colors["muted-foreground"]}
                size={18}
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
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
            >
              <Text
                className="text-foreground text-sm font-semibold flex-1"
                numberOfLines={1}
              >
                {p.name}
              </Text>
              <View style={{ flexDirection: "row", gap: 4, flexShrink: 0 }}>
                {p.durationWeeks ? (
                  <View className="rounded-full bg-muted px-1.5 py-0.5">
                    <Text className="text-muted-foreground text-xs font-medium">
                      {p.durationWeeks}w
                    </Text>
                  </View>
                ) : null}
                {p.trainingDaysPerWeek ? (
                  <View className="rounded-full bg-muted px-1.5 py-0.5">
                    <Text className="text-muted-foreground text-xs font-medium">
                      {p.trainingDaysPerWeek}x
                    </Text>
                  </View>
                ) : null}
              </View>
            </View>
            {tags.length > 0 ? (
              <View
                style={{
                  flexDirection: "row",
                  flexWrap: "wrap",
                  gap: 4,
                  marginTop: 4,
                }}
              >
                {tags.map((tag) => (
                  <View
                    key={tag}
                    className="rounded-full bg-accent/10 px-1.5 py-0.5"
                  >
                    <Text className="text-accent text-xs">{tag}</Text>
                  </View>
                ))}
              </View>
            ) : null}
          </Pressable>

          <Pressable
            testID={`${testID}-unsave-${p.id}`}
            onPress={() => onToggleSave?.(p.id)}
            accessibilityRole="button"
            accessibilityLabel={`Unsave program ${p.name}`}
            className="p-1.5 shrink-0"
          >
            <Bookmark
              color={colors.accent}
              fill={colors.accent}
              size={18}
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
