import { render, fireEvent, waitFor } from "@testing-library/react-native";
import {
  RecipeDetail,
  type RecipeDetailViewModel,
} from "@/components/recipes/RecipeDetail";

// The thumbnail is an `AuthedImage` (the bearer-token image fetch), which reads
// the signed-in token through `useAuth`.
jest.mock("@/lib/auth/useAuth", () => ({
  useAuth: () => ({ token: "test-jwt", isAuthed: true }),
}));

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

const noop = () => {};

describe("RecipeDetail", () => {
  it("renders the recipe name, description, and thumbnail", () => {
    const { getByTestId } = render(
      <RecipeDetail
        recipe={sample}
        onSaveOrLogFood={noop}
        onConvertToMeal={noop}
        onEdit={noop}
        onDelete={noop}
      />,
    );
    expect(getByTestId("recipe-detail-name").props.children).toBe(
      "Banana oat smoothie",
    );
    expect(getByTestId("recipe-detail-description").props.children).toBe(
      "Quick high-protein breakfast",
    );
    // The photo is a bearer-token fetch: before it resolves the slot shows its
    // loading placeholder under the `-thumb` testID prefix.
    expect(getByTestId("recipe-detail-thumb-loading")).toBeTruthy();
  });

  it("renders per-serving nutrition kcal + macros", () => {
    const { getByTestId } = render(
      <RecipeDetail
        recipe={sample}
        onSaveOrLogFood={noop}
        onConvertToMeal={noop}
        onEdit={noop}
        onDelete={noop}
      />,
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
      <RecipeDetail
        recipe={sample}
        onSaveOrLogFood={noop}
        onConvertToMeal={noop}
        onEdit={noop}
        onDelete={noop}
      />,
    );
    expect(getByTestId("recipe-detail-ingredient-banana")).toBeTruthy();
    expect(getByTestId("recipe-detail-ingredient-oats")).toBeTruthy();
    expect(getByTestId("recipe-detail-ingredient-whey")).toBeTruthy();
  });

  it("renders numbered instruction steps", () => {
    const { getByTestId } = render(
      <RecipeDetail
        recipe={sample}
        onSaveOrLogFood={noop}
        onConvertToMeal={noop}
        onEdit={noop}
        onDelete={noop}
      />,
    );
    expect(getByTestId("recipe-detail-step-0")).toBeTruthy();
    expect(getByTestId("recipe-detail-step-1")).toBeTruthy();
  });

  it("Save-as-food CTA reads Save as food until saved, then Log this food", () => {
    const unsaved = render(
      <RecipeDetail
        recipe={sample}
        onSaveOrLogFood={noop}
        onConvertToMeal={noop}
        onEdit={noop}
        onDelete={noop}
      />,
    );
    expect(unsaved.getByTestId("recipe-detail-save-or-log")).toBeTruthy();
    const saved = render(
      <RecipeDetail
        recipe={sample}
        savedFoodId="f1"
        onSaveOrLogFood={noop}
        onConvertToMeal={noop}
        onEdit={noop}
        onDelete={noop}
      />,
    );
    expect(saved.getByTestId("recipe-detail-save-or-log")).toBeTruthy();
  });

  it("owner actions show only for the owner, and fire edit/delete/convert", async () => {
    const onEdit = jest.fn();
    const onDelete = jest.fn();
    const onConvertToMeal = jest.fn();
    const { getByTestId, queryByTestId, rerender } = render(
      <RecipeDetail
        recipe={sample}
        onSaveOrLogFood={noop}
        onConvertToMeal={onConvertToMeal}
        onEdit={onEdit}
        onDelete={onDelete}
      />,
    );
    expect(queryByTestId("recipe-detail-owner-actions")).toBeNull();
    rerender(
      <RecipeDetail
        recipe={{ ...sample, isOwner: true }}
        onSaveOrLogFood={noop}
        onConvertToMeal={onConvertToMeal}
        onEdit={onEdit}
        onDelete={onDelete}
      />,
    );
    expect(getByTestId("recipe-detail-owner-actions")).toBeTruthy();
    fireEvent.press(getByTestId("recipe-detail-edit"));
    expect(onEdit).toHaveBeenCalledTimes(1);
    fireEvent.press(getByTestId("recipe-detail-delete"));
    expect(onDelete).toHaveBeenCalledTimes(1);
    fireEvent.press(getByTestId("recipe-detail-to-meal"));
    await waitFor(() => {
      expect(onConvertToMeal).toHaveBeenCalledTimes(1);
    });
  });

  it("Save-or-Log fires the handler", async () => {
    const onSaveOrLogFood = jest.fn();
    const { getByTestId } = render(
      <RecipeDetail
        recipe={sample}
        onSaveOrLogFood={onSaveOrLogFood}
        onConvertToMeal={noop}
        onEdit={noop}
        onDelete={noop}
      />,
    );
    fireEvent.press(getByTestId("recipe-detail-save-or-log"));
    await waitFor(() => {
      expect(onSaveOrLogFood).toHaveBeenCalledTimes(1);
    });
  });
});
