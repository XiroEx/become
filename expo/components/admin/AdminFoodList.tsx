import { View, Pressable } from "react-native";
import { Text } from "@/components/Text";
import { ExternalLink } from "lucide-react-native";
import { Card } from "@/components/Card";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";
import {
  adminFoodReviewUrl,
  openInBrowser,
} from "@/lib/admin/adminLinks";
import type { BrowserLauncher } from "@/lib/programs/browserLauncher";

export interface AdminFoodRow {
  id: string;
  name: string;
  brand?: string | null;
  source: "custom" | "usda" | "off";
  pendingReview: boolean;
}

export interface AdminFoodListProps {
  foods: AdminFoodRow[];
  browserLauncher?: BrowserLauncher;
  testID?: string;
}

export function AdminFoodList({
  foods,
  browserLauncher,
  testID = "admin-foods",
}: AdminFoodListProps) {
  const { colors } = useThemeTokens();
  if (foods.length === 0) {
    return (
      <View testID={`${testID}-empty`} style={{ padding: 16 }}>
        <Text className="text-muted-foreground text-center">
          No foods to review.
        </Text>
      </View>
    );
  }
  return (
    <View testID={testID} style={{ gap: 8 }}>
      {foods.map((f) => (
        <Card
          key={f.id}
          testID={`${testID}-item-${f.id}`}
          title={f.name}
          subtitle={f.brand ? `${f.brand} · ${f.source.toUpperCase()}` : f.source.toUpperCase()}
        >
          {f.pendingReview ? (
            <Text className="text-accent text-xs mb-2">Pending review</Text>
          ) : null}
          <Pressable
            testID={`${testID}-edit-${f.id}`}
            onPress={() => {
              void openInBrowser(adminFoodReviewUrl(f.id), browserLauncher);
            }}
            accessibilityRole="button"
            accessibilityLabel={`Edit ${f.name} in browser`}
            accessibilityHint={adminFoodReviewUrl(f.id)}
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
