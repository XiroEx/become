import { useMemo, useState } from "react";
import { View, Text } from "react-native";
import { Button } from "@/components/Button";
import { RecipeCard, type RecipeSummary } from "@/components/recipes/RecipeCard";

export interface RecipesListProps {
  recipes: RecipeSummary[];
  pageSize?: number;
  onItemPress?: (id: string) => void;
  testID?: string;
}

const DEFAULT_PAGE_SIZE = 10;

export function RecipesList({
  recipes,
  pageSize = DEFAULT_PAGE_SIZE,
  onItemPress,
  testID = "recipes-list",
}: RecipesListProps) {
  const [page, setPage] = useState<number>(1);
  const visible = useMemo(
    () => recipes.slice(0, page * pageSize),
    [recipes, page, pageSize],
  );
  const hasMore = visible.length < recipes.length;

  if (recipes.length === 0) {
    return (
      <View testID={testID}>
        <Text
          testID={`${testID}-empty`}
          className="text-muted-foreground text-center mt-6"
        >
          No recipes yet.
        </Text>
      </View>
    );
  }

  return (
    <View testID={testID} style={{ gap: 8 }}>
      {visible.map((r) => (
        <RecipeCard
          key={r.id}
          testID={`${testID}-item-${r.id}`}
          recipe={r}
          onPress={onItemPress}
        />
      ))}
      {hasMore ? (
        <Button
          testID={`${testID}-load-more`}
          variant="secondary"
          onPress={() => setPage((p) => p + 1)}
        >
          Load more
        </Button>
      ) : null}
    </View>
  );
}
