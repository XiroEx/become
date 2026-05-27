import { render, fireEvent } from "@testing-library/react-native";
import {
  RecipeCard,
  type RecipeSummary,
} from "@/components/recipes/RecipeCard";

const recipe: RecipeSummary = {
  id: "r1",
  name: "Banana oat smoothie",
  description: "Quick high-protein breakfast",
  thumbnailUrl: "https://example.com/smoothie.jpg",
  totalKcal: 420,
  servings: 1,
};

describe("RecipeCard", () => {
  it("renders name + description", () => {
    const { getByText } = render(<RecipeCard recipe={recipe} />);
    expect(getByText("Banana oat smoothie")).toBeTruthy();
    expect(getByText("Quick high-protein breakfast")).toBeTruthy();
  });

  it("renders thumbnail when thumbnailUrl is set", () => {
    const { getByTestId } = render(<RecipeCard recipe={recipe} />);
    expect(getByTestId("recipe-card-r1-thumb")).toBeTruthy();
  });

  it("omits thumbnail when thumbnailUrl is null", () => {
    const { queryByTestId } = render(
      <RecipeCard recipe={{ ...recipe, thumbnailUrl: null }} />,
    );
    expect(queryByTestId("recipe-card-r1-thumb")).toBeNull();
  });

  it("renders kcal + serving metadata when present", () => {
    const { getByTestId } = render(<RecipeCard recipe={recipe} />);
    expect(getByTestId("recipe-card-r1-meta")).toBeTruthy();
  });

  it("fires onPress with the recipe id", () => {
    const onPress = jest.fn();
    const { getByTestId } = render(
      <RecipeCard recipe={recipe} onPress={onPress} />,
    );
    fireEvent.press(getByTestId("recipe-card-r1"));
    expect(onPress).toHaveBeenCalledWith("r1");
  });
});
