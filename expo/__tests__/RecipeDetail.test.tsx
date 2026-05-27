import { render, fireEvent, waitFor } from "@testing-library/react-native";
import {
  RecipeDetail,
  type RecipeDetailViewModel,
} from "@/components/recipes/RecipeDetail";
import { recipeEditUrl } from "@/lib/nutrition/recipeLinks";

const sample: RecipeDetailViewModel = {
  id: "rec-1",
  name: "Banana oat smoothie",
  description: "Quick high-protein breakfast",
  thumbnailUrl: "https://example.com/smoothie.jpg",
  servings: 1,
  perServing: { kcal: 420, protein: 30, carbs: 55, fat: 9 },
  ingredients: [
    { slug: "banana", name: "Banana", amount: "1 medium" },
    { slug: "oats", name: "Rolled oats", amount: "40g" },
    { slug: "whey", name: "Whey protein", amount: "30g" },
  ],
  instructions: [
    "Blend everything for 30 seconds.",
    "Serve immediately.",
  ],
};

describe("RecipeDetail", () => {
  it("renders the recipe name, description, and thumbnail", () => {
    const { getByTestId } = render(
      <RecipeDetail recipe={sample} onSaveAsMeal={() => {}} />,
    );
    expect(getByTestId("recipe-detail-name").props.children).toBe(
      "Banana oat smoothie",
    );
    expect(getByTestId("recipe-detail-description").props.children).toBe(
      "Quick high-protein breakfast",
    );
    expect(getByTestId("recipe-detail-thumb")).toBeTruthy();
  });

  it("renders per-serving nutrition kcal + macros", () => {
    const { getByTestId } = render(
      <RecipeDetail recipe={sample} onSaveAsMeal={() => {}} />,
    );
    expect(
      getByTestId("recipe-detail-nutrition-kcal").props.children,
    ).toEqual([420, " kcal"]);
    expect(
      getByTestId("recipe-detail-nutrition-protein").props.children,
    ).toEqual([30, "g P"]);
    expect(
      getByTestId("recipe-detail-nutrition-carbs").props.children,
    ).toEqual([55, "g C"]);
    expect(
      getByTestId("recipe-detail-nutrition-fat").props.children,
    ).toEqual([9, "g F"]);
  });

  it("renders one row per ingredient", () => {
    const { getByTestId } = render(
      <RecipeDetail recipe={sample} onSaveAsMeal={() => {}} />,
    );
    expect(getByTestId("recipe-detail-ingredient-banana")).toBeTruthy();
    expect(getByTestId("recipe-detail-ingredient-oats")).toBeTruthy();
    expect(getByTestId("recipe-detail-ingredient-whey")).toBeTruthy();
  });

  it("renders numbered instruction steps", () => {
    const { getByTestId } = render(
      <RecipeDetail recipe={sample} onSaveAsMeal={() => {}} />,
    );
    expect(getByTestId("recipe-detail-step-0")).toBeTruthy();
    expect(getByTestId("recipe-detail-step-1")).toBeTruthy();
  });

  it("Edit-in-browser button fires the launcher with the correct URL", async () => {
    const launcher = jest.fn(async () => undefined);
    const { getByTestId } = render(
      <RecipeDetail
        recipe={sample}
        onSaveAsMeal={() => {}}
        browserLauncher={launcher}
      />,
    );
    fireEvent.press(getByTestId("recipe-detail-edit-in-browser"));
    await waitFor(() => {
      expect(launcher).toHaveBeenCalledWith(recipeEditUrl("rec-1"));
    });
    expect(recipeEditUrl("rec-1")).toBe(
      "https://become.redbtn.io/dashboard/nutrition/recipes/rec-1/edit",
    );
  });

  it("recipeEditUrl URL-encodes the id", () => {
    expect(recipeEditUrl("a b/c")).toBe(
      "https://become.redbtn.io/dashboard/nutrition/recipes/a%20b%2Fc/edit",
    );
  });
});
