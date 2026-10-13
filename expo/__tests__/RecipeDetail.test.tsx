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
    { slug: "banana", name: "Banana", amount: "1 medium", calories: 105 },
    { slug: "oats", name: "Rolled oats", amount: "40g", calories: 150 },
    { slug: "whey", name: "Whey protein", amount: "30g", calories: 120 },
  ],
  instructions: [
    "Blend everything for 30 seconds.",
    "Serve immediately.",
  ],
};

const noop = () => {};

describe("RecipeDetail", () => {
  it("renders the recipe name and thumbnail — the web hides the description entirely (NP-271)", () => {
    const { getByTestId, queryByTestId } = render(
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
    // `webapp/app/dashboard/recipes/[id]/page.tsx` never renders `description`
    // at all — native used to show it, which is the gap this card closes.
    expect(queryByTestId("recipe-detail-description")).toBeNull();
    // The photo is a bearer-token fetch: before it resolves the slot shows its
    // loading placeholder under the `-thumb` testID prefix.
    expect(getByTestId("recipe-detail-thumb-loading")).toBeTruthy();
    // A real photo means no gradient hero placeholder.
    expect(queryByTestId("recipe-detail-hero-placeholder")).toBeNull();
  });

  it("shows the web's gradient hero when there is no photo", () => {
    const { getByTestId, queryByTestId } = render(
      <RecipeDetail
        recipe={{ ...sample, thumbnailUrl: null }}
        onSaveOrLogFood={noop}
        onConvertToMeal={noop}
        onEdit={noop}
        onDelete={noop}
      />,
    );
    expect(getByTestId("recipe-detail-hero-placeholder")).toBeTruthy();
    expect(queryByTestId("recipe-detail-thumb")).toBeNull();
  });

  it("shows Prep/Cook/servings with icons, and hides an empty Instructions card (the web hides it too)", () => {
    const rendered = render(
      <RecipeDetail
        recipe={{ ...sample, prepTime: 10, cookTime: 20, servings: 2, instructions: [] }}
        onSaveOrLogFood={noop}
        onConvertToMeal={noop}
        onEdit={noop}
        onDelete={noop}
      />,
    );
    const { queryByTestId } = rendered;
    // `.toJSON()` is the plain, serialisable render tree (unlike the fiber
    // node a query returns), so it can safely be stringified.
    const tree = JSON.stringify(rendered.toJSON());
    // Each row is its own `<Text>Prep {n}m</Text>`, which RN splits into
    // separate children ("Prep ", 10, "m") rather than one joined string.
    expect(tree).toContain("Prep ");
    expect(tree).toContain("Cook ");
    expect(tree).toContain(" serving");
    expect(tree).toContain("lucide-clock");
    expect(tree).toContain("lucide-users");
    expect(queryByTestId("recipe-detail-instructions")).toBeNull();
  });

  it("shows each ingredient's calories figure alongside its amount subline", () => {
    const { getByTestId } = render(
      <RecipeDetail
        recipe={sample}
        onSaveOrLogFood={noop}
        onConvertToMeal={noop}
        onEdit={noop}
        onDelete={noop}
      />,
    );
    expect(getByTestId("recipe-detail-ingredient-banana-calories").props.children).toBe(105);
    expect(getByTestId("recipe-detail-ingredient-oats-calories").props.children).toBe(150);
    expect(getByTestId("recipe-detail-ingredient-whey-calories").props.children).toBe(120);
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
