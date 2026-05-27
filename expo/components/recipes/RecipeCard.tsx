import { Pressable, Text, View, Image } from "react-native";
import { Card } from "@/components/Card";

export interface RecipeSummary {
  id: string;
  name: string;
  description: string;
  thumbnailUrl?: string | null;
  totalKcal?: number;
  servings?: number;
}

export interface RecipeCardProps {
  recipe: RecipeSummary;
  onPress?: (id: string) => void;
  testID?: string;
}

export function RecipeCard({
  recipe,
  onPress,
  testID,
}: RecipeCardProps) {
  const tid = testID ?? `recipe-card-${recipe.id}`;
  return (
    <Pressable
      testID={tid}
      onPress={() => onPress?.(recipe.id)}
      accessibilityRole="button"
      accessibilityLabel={`Open recipe ${recipe.name}`}
    >
      <Card title={recipe.name} subtitle={recipe.description}>
        {recipe.thumbnailUrl ? (
          <Image
            testID={`${tid}-thumb`}
            source={{ uri: recipe.thumbnailUrl }}
            style={{ width: "100%", height: 120, borderRadius: 12 }}
            accessibilityLabel={`${recipe.name} thumbnail`}
          />
        ) : null}
        {typeof recipe.totalKcal === "number" ? (
          <View
            testID={`${tid}-meta`}
            style={{ flexDirection: "row", gap: 8, marginTop: 6 }}
          >
            <Text className="text-muted-foreground text-xs">
              {Math.round(recipe.totalKcal)} kcal
            </Text>
            {recipe.servings ? (
              <Text className="text-muted-foreground text-xs">
                {recipe.servings} serving{recipe.servings === 1 ? "" : "s"}
              </Text>
            ) : null}
          </View>
        ) : null}
      </Card>
    </Pressable>
  );
}
