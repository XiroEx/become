import { View, Pressable } from "react-native";
import { Text } from "@/components/Text";
import { ExternalLink } from "lucide-react-native";
import { Card } from "@/components/Card";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";
import {
  adminExerciseEditUrl,
  openInBrowser,
} from "@/lib/admin/adminLinks";
import type { BrowserLauncher } from "@/lib/programs/browserLauncher";

export interface AdminExerciseRow {
  slug: string;
  name: string;
  category?: string;
  hasVideo: boolean;
}

export interface AdminExerciseListProps {
  exercises: AdminExerciseRow[];
  browserLauncher?: BrowserLauncher;
  testID?: string;
}

export function AdminExerciseList({
  exercises,
  browserLauncher,
  testID = "admin-exercises",
}: AdminExerciseListProps) {
  const { colors } = useThemeTokens();
  if (exercises.length === 0) {
    return (
      <View testID={`${testID}-empty`} style={{ padding: 16 }}>
        <Text className="text-muted-foreground text-center">
          No exercises yet.
        </Text>
      </View>
    );
  }
  return (
    <View testID={testID} style={{ gap: 8 }}>
      {exercises.map((ex) => (
        <Card
          key={ex.slug}
          testID={`${testID}-item-${ex.slug}`}
          title={ex.name}
          subtitle={ex.category ?? ""}
        >
          <Text className="text-muted-foreground text-xs mb-2">
            Video: {ex.hasVideo ? "yes" : "missing"}
          </Text>
          <Pressable
            testID={`${testID}-edit-${ex.slug}`}
            onPress={() => {
              void openInBrowser(adminExerciseEditUrl(ex.slug), browserLauncher);
            }}
            accessibilityRole="button"
            accessibilityLabel={`Edit ${ex.name} in browser`}
            accessibilityHint={adminExerciseEditUrl(ex.slug)}
            className="flex-row items-center gap-2 py-2"
          >
            <ExternalLink
              color={colors["muted-foreground"]}
              size={14}
              strokeWidth={1.5}
            />
            <Text className="text-muted-foreground text-xs">
              Edit in browser
            </Text>
          </Pressable>
        </Card>
      ))}
    </View>
  );
}
