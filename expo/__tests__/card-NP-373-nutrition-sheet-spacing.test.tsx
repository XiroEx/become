// ─── NP-373: Nutrition sheets — Quick Add calories, header badges & footer
// buttons (native vs web) ────────────────────────────────────────────────
//
// Web's QuickAddSheet / EditLogItemSheet / EditLoggedMealSheet (web source:
// QuickAddModal / EditFoodModal / EditMealModal) standardize on:
//   1. A large, bold calorie input for Quick Add only (`text-lg font-bold`,
//      `rounded-xl` well) — not the same compact weight as the optional
//      macro fields beside it.
//   2. A square top-left icon badge (`h-9 w-9 rounded-lg`) in every sheet
//      header, replacing the old ad-hoc `width/height/borderRadius` inline
//      sizing.
//   3. A side-by-side footer pair: a bordered/card-filled `Cancel`
//      (`outline` variant) and an inverted `Save` / `Add` — both at the
//      `footer` size (`px-4 py-2.5`, `text-sm`) — not the flat `secondary`
//      Cancel used elsewhere in the app.
//
// This file does not touch the bottom-sheet presentation itself (native
// correctly keeps `BottomSheet`; only badge/button/input styling moved).

import { render } from "@testing-library/react-native";
import { View } from "react-native";

jest.mock("@become/api-client", () => {
  const actual = jest.requireActual("@become/api-client");
  return { __esModule: true, ...actual, apiFetch: jest.fn() };
});

jest.mock("@/lib/mind/sessionCache", () => ({
  invalidateMindSession: jest.fn(async () => {}),
}));

/* eslint-disable import/first */
import { QuickAddSheet } from "../components/nutrition/QuickAddSheet";
import { EditLogItemSheet } from "../components/nutrition/EditLogItemSheet";
import { EditLoggedMealSheet } from "../components/nutrition/EditLoggedMealSheet";
/* eslint-enable import/first */

function loggedItem(overrides: Record<string, unknown> = {}) {
  return {
    _id: "item-1",
    name: "Oats",
    brand: undefined,
    servingSize: 40,
    servingUnit: "g",
    servings: 2,
    nutrition: { calories: 150, protein: 5, carbs: 27, fats: 3, fiber: 2 },
    loggedQuantity: 80,
    loggedUnit: "g",
    ...overrides,
  };
}

describe("NP-373 (1): Quick Add's Calories input is visually prominent", () => {
  it("renders the Calories field with the prominent variant's text-lg font-bold rounded-xl well, while a macro field (Protein) stays the default size", () => {
    const { getByTestId } = render(
      <QuickAddSheet visible onClose={jest.fn()} onSubmit={jest.fn()} />,
    );
    const calories = getByTestId("quick-add-calories-input");
    expect(String(calories.props.className)).toContain("text-lg");
    expect(String(calories.props.className)).toContain("font-bold");
    expect(String(calories.props.className)).toContain("rounded-xl");

    const protein = getByTestId("quick-add-protein-input");
    expect(String(protein.props.className)).not.toContain("text-lg");
    expect(String(protein.props.className)).not.toContain("font-bold");
  });

  it("keeps the standard Input label weight for Note (optional), only Calories gets the heavier label", () => {
    const { getByTestId } = render(
      <QuickAddSheet visible onClose={jest.fn()} onSubmit={jest.fn()} />,
    );
    const caloriesLabel = getByTestId("quick-add-calories-input-label");
    expect(String(caloriesLabel.props.className)).toContain("font-semibold");

    const noteLabel = getByTestId("quick-add-note-input-label");
    expect(String(noteLabel.props.className)).toBe(
      "text-foreground text-sm font-medium mb-1",
    );
  });
});

describe("NP-373 (2): every nutrition sheet header carries a square h-9 w-9 rounded-lg icon badge", () => {
  it("QuickAddSheet's lightning badge is h-9 w-9 rounded-lg", () => {
    const { UNSAFE_getAllByType } = render(
      <QuickAddSheet visible onClose={jest.fn()} onSubmit={jest.fn()} />,
    );
    const badges = UNSAFE_getAllByType(View).filter((n) =>
      String(n.props.className ?? "").includes("rounded-lg"),
    );
    expect(
      badges.some((n) => String(n.props.className).includes("h-9 w-9")),
    ).toBe(true);
  });

  it("EditLogItemSheet's pencil badge is h-9 w-9 rounded-lg", () => {
    const { UNSAFE_getAllByType } = render(
      <EditLogItemSheet
        visible
        logId="log-1"
        item={loggedItem()}
        onClose={jest.fn()}
        onSaved={jest.fn()}
      />,
    );
    const badges = UNSAFE_getAllByType(View).filter((n) =>
      String(n.props.className ?? "").includes("rounded-lg"),
    );
    expect(
      badges.some((n) => String(n.props.className).includes("h-9 w-9")),
    ).toBe(true);
  });

  it("EditLoggedMealSheet's chef-hat badge is h-9 w-9 rounded-lg", () => {
    const { UNSAFE_getAllByType } = render(
      <EditLoggedMealSheet
        visible
        logId="log-1"
        mealName="Lunch"
        currentTag="lunch"
        onClose={jest.fn()}
        onSaved={jest.fn()}
      />,
    );
    const badges = UNSAFE_getAllByType(View).filter((n) =>
      String(n.props.className ?? "").includes("rounded-lg"),
    );
    expect(
      badges.some((n) => String(n.props.className).includes("h-9 w-9")),
    ).toBe(true);
  });
});

describe("NP-373 (3): every nutrition sheet's footer pairs an outline Cancel with an inverted Save/Add, both at the footer size", () => {
  it("QuickAddSheet: Cancel is outline+footer, Add is inverted+footer", () => {
    const { getByTestId } = render(
      <QuickAddSheet visible onClose={jest.fn()} onSubmit={jest.fn()} />,
    );
    const cancel = getByTestId("quick-add-cancel-button");
    expect(String(cancel.props.className)).toContain("bg-card");
    expect(String(cancel.props.className)).toContain("border-border");
    expect(String(cancel.props.className)).toContain("px-4 py-2.5");

    const submit = getByTestId("quick-add-submit-button");
    expect(String(submit.props.className)).toContain("bg-foreground");
    expect(String(submit.props.className)).toContain("px-4 py-2.5");
  });

  it("EditLogItemSheet: Cancel is outline+footer, Save is inverted+footer", () => {
    const { getByTestId } = render(
      <EditLogItemSheet
        visible
        logId="log-1"
        item={loggedItem()}
        onClose={jest.fn()}
        onSaved={jest.fn()}
      />,
    );
    const cancel = getByTestId("edit-log-item-cancel");
    expect(String(cancel.props.className)).toContain("bg-card");
    expect(String(cancel.props.className)).toContain("border-border");
    expect(String(cancel.props.className)).toContain("px-4 py-2.5");

    const save = getByTestId("edit-log-item-save");
    expect(String(save.props.className)).toContain("bg-foreground");
    expect(String(save.props.className)).toContain("px-4 py-2.5");
  });

  it("EditLoggedMealSheet: Cancel is outline+footer, Save is inverted+footer", () => {
    const { getByTestId } = render(
      <EditLoggedMealSheet
        visible
        logId="log-1"
        mealName="Lunch"
        currentTag="lunch"
        onClose={jest.fn()}
        onSaved={jest.fn()}
      />,
    );
    const cancel = getByTestId("edit-logged-meal-cancel");
    expect(String(cancel.props.className)).toContain("bg-card");
    expect(String(cancel.props.className)).toContain("border-border");
    expect(String(cancel.props.className)).toContain("px-4 py-2.5");

    const save = getByTestId("edit-logged-meal-save");
    expect(String(save.props.className)).toContain("bg-foreground");
    expect(String(save.props.className)).toContain("px-4 py-2.5");
  });
});
