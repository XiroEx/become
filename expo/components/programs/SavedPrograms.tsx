import { View, Text, Pressable } from "react-native";
import { Heart } from "lucide-react-native";
import { Card } from "@/components/Card";
import { resolveToken } from "@/lib/theme/tokens";
import type { ProgramSummary } from "./ProgramsList";

export interface SavedProgramsProps {
  programs: ProgramSummary[];
  onItemPress?: (id: string) => void;
  onToggleSave?: (id: string) => Promise<void> | void;
  testID?: string;
}

export function SavedPrograms({
  programs,
  onItemPress,
  onToggleSave,
  testID = "saved-programs",
}: SavedProgramsProps) {
  if (programs.length === 0) {
    return (
      <View testID={`${testID}-empty`} style={{ padding: 16 }}>
        <Text className="text-muted-foreground text-center">
          No saved programs yet. Browse to save one.
        </Text>
      </View>
    );
  }

  return (
    <View testID={testID} style={{ padding: 16, gap: 12 }}>
      {programs.map((p) => (
        <View key={p.id} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Pressable
            testID={`${testID}-item-${p.id}`}
            style={{ flex: 1 }}
            onPress={() => onItemPress?.(p.id)}
            accessibilityRole="button"
            accessibilityLabel={`Open program ${p.name}`}
          >
            <Card title={p.name} subtitle={p.description} />
          </Pressable>
          <Pressable
            testID={`${testID}-unsave-${p.id}`}
            onPress={() => onToggleSave?.(p.id)}
            accessibilityRole="button"
            accessibilityLabel={`Unsave program ${p.name}`}
            className="p-3"
          >
            <Heart
              color={resolveToken("primary", "dark")}
              fill={resolveToken("primary", "dark")}
              size={20}
              strokeWidth={1.5}
            />
          </Pressable>
        </View>
      ))}
    </View>
  );
}
