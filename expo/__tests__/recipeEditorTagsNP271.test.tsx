/**
 * NP-271 — RECIPE EDITOR TAGS AND HEADER CANCEL.
 *
 * Full visual pass found two editor bugs shared by New and Edit recipe:
 *
 *   1. Tags sat behind an "Edit" tap. A brand-new recipe (no tags picked yet)
 *      showed NOTHING until the member tapped Edit; an existing recipe with
 *      one tag showed only that one chip. The web shows every tag chip
 *      inline always (`RecipeForm.tsx`'s `allTagOptions.map`), toggling on
 *      tap — no Edit/Done mode at all.
 *   2. The sheet had no way back except scrolling to the footer's Cancel —
 *      the web's header is `← Cancel  Edit recipe`.
 */
import { fireEvent, render } from "@testing-library/react-native";
import { RecipeEditorSheet } from "@/components/recipes/RecipeEditorSheet";

// The sheet mounts `FoodSearchSheet` (the web's `FoodSearchModal`) for its
// "Add ingredient" flow, which reads the signed-in token through `useAuth`.
jest.mock("@/lib/auth/useAuth", () => ({
  useAuth: () => ({ token: "test-jwt", isAuthed: true }),
}));

const noop = () => {};

describe("RecipeEditorSheet tags (NP-271)", () => {
  it("New recipe: all default tag chips show inline with no tags picked — no Edit tap required", () => {
    const { getByTestId, queryByTestId } = render(
      <RecipeEditorSheet visible onClose={noop} onSubmit={noop} testID="recipe-editor" />,
    );
    // The old UI had no way to see any of these without tapping "Edit" first.
    expect(queryByTestId("recipe-editor-tags-toggle")).toBeNull();
    for (const tag of ["breakfast", "lunch", "dinner", "snack", "pre-workout", "post-workout"]) {
      expect(getByTestId(`recipe-editor-tag-${tag}`)).toBeTruthy();
    }
  });

  it("Edit recipe: the recipe's own tag is shown selected, and the other five chips are still visible", () => {
    const { getByTestId } = render(
      <RecipeEditorSheet
        visible
        recipeId="r1"
        initial={{
          name: "Turkey Chili",
          servings: 4,
          instructions: [],
          tags: ["dinner"],
          ingredients: [],
        }}
        onClose={noop}
        onSubmit={noop}
        testID="recipe-editor"
      />,
    );
    expect(getByTestId("recipe-editor-tag-dinner").props.accessibilityState).toEqual({
      selected: true,
    });
    expect(getByTestId("recipe-editor-tag-breakfast").props.accessibilityState).toEqual({
      selected: false,
    });
    expect(getByTestId("recipe-editor-tag-snack")).toBeTruthy();
  });

  it("tapping an unselected chip selects it, and tapping it again deselects it", () => {
    const { getByTestId } = render(
      <RecipeEditorSheet visible onClose={noop} onSubmit={noop} testID="recipe-editor" />,
    );
    const chip = getByTestId("recipe-editor-tag-snack");
    expect(chip.props.accessibilityState).toEqual({ selected: false });
    fireEvent.press(chip);
    expect(getByTestId("recipe-editor-tag-snack").props.accessibilityState).toEqual({
      selected: true,
    });
    fireEvent.press(getByTestId("recipe-editor-tag-snack"));
    expect(getByTestId("recipe-editor-tag-snack").props.accessibilityState).toEqual({
      selected: false,
    });
  });

  it("a legacy tag not in the default/user options still shows, selected, and stays visible (just unselected) after untoggling", () => {
    const { getByTestId } = render(
      <RecipeEditorSheet
        visible
        recipeId="r1"
        initial={{
          name: "Grandma's Stew",
          servings: 4,
          instructions: [],
          tags: ["holiday-special"],
          ingredients: [],
        }}
        onClose={noop}
        onSubmit={noop}
        testID="recipe-editor"
      />,
    );
    expect(getByTestId("recipe-editor-tag-holiday-special").props.accessibilityState).toEqual({
      selected: true,
    });
    fireEvent.press(getByTestId("recipe-editor-tag-holiday-special"));
    // Untoggling it must not make the chip disappear — every other chip
    // stays put when deselected, and this one should too.
    expect(getByTestId("recipe-editor-tag-holiday-special").props.accessibilityState).toEqual({
      selected: false,
    });
  });

  it("a custom tag typed into Add becomes a chip that survives a later untoggle", () => {
    const { getByTestId } = render(
      <RecipeEditorSheet visible onClose={noop} onSubmit={noop} testID="recipe-editor" />,
    );
    fireEvent.changeText(getByTestId("recipe-editor-custom-tag"), "High Protein");
    fireEvent.press(getByTestId("recipe-editor-custom-tag-add"));
    expect(getByTestId("recipe-editor-tag-high-protein").props.accessibilityState).toEqual({
      selected: true,
    });
    fireEvent.press(getByTestId("recipe-editor-tag-high-protein"));
    expect(getByTestId("recipe-editor-tag-high-protein").props.accessibilityState).toEqual({
      selected: false,
    });
  });

  it("has a header Cancel control beside the title, matching the web's ← Cancel row", () => {
    const onClose = jest.fn();
    const { getByTestId } = render(
      <RecipeEditorSheet visible onClose={onClose} onSubmit={noop} testID="recipe-editor" />,
    );
    fireEvent.press(getByTestId("recipe-editor-header-cancel"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
