import { render, fireEvent } from "@testing-library/react-native";
import { RecipesList } from "@/components/recipes/RecipesList";
import type { RecipeSummary } from "@/components/recipes/RecipeCard";

function makeRecipes(count: number): RecipeSummary[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `r-${i}`,
    name: `Recipe ${i}`,
    description: `Desc ${i}`,
  }));
}

describe("RecipesList", () => {
  it("renders an item per recipe up to pageSize", () => {
    const list = makeRecipes(5);
    const { getByTestId } = render(<RecipesList recipes={list} pageSize={10} />);
    for (let i = 0; i < 5; i++) {
      expect(getByTestId(`recipes-list-item-r-${i}`)).toBeTruthy();
    }
  });

  it("shows empty state when the list is empty", () => {
    const { getByTestId } = render(<RecipesList recipes={[]} />);
    expect(getByTestId("recipes-list-empty")).toBeTruthy();
  });

  it("paginates: Load more reveals the next page", () => {
    const list = makeRecipes(15);
    const { getByTestId, queryByTestId } = render(
      <RecipesList recipes={list} pageSize={10} />,
    );
    expect(queryByTestId("recipes-list-item-r-10")).toBeNull();
    fireEvent.press(getByTestId("recipes-list-load-more"));
    expect(getByTestId("recipes-list-item-r-10")).toBeTruthy();
    expect(getByTestId("recipes-list-item-r-14")).toBeTruthy();
  });

  it("hides Load more once everything is shown", () => {
    const list = makeRecipes(3);
    const { queryByTestId } = render(<RecipesList recipes={list} pageSize={10} />);
    expect(queryByTestId("recipes-list-load-more")).toBeNull();
  });

  it("fires onItemPress with the recipe id", () => {
    const onItemPress = jest.fn();
    const list = makeRecipes(2);
    const { getByTestId } = render(
      <RecipesList recipes={list} onItemPress={onItemPress} />,
    );
    fireEvent.press(getByTestId("recipes-list-item-r-1"));
    expect(onItemPress).toHaveBeenCalledWith("r-1");
  });
});
