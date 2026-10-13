// ─── NP-373: Nutrition Sheets — Quick Add calorie input prominence, Edit
// Food & Edit Meal modal header/footer styling ─────────────────────────────
//
// Spacing / typography / layout diff pass (native vs web): aligns Quick Add,
// EditLogItemSheet (web's EditFoodModal), and EditLoggedMealSheet (web's
// EditMealModal) on three points:
//
//   1. The Quick Add Calories field is visually prominent (18px bold text in
//      a rounded-xl well), not the same compact weight as the optional
//      macro fields beside it.
//   2. Every sheet's header icon badge is a square `h-9 w-9 rounded-lg`
//      (36x36, 8px corners) — not an ad hoc 36x36/10px-radius box.
//   3. Every sheet's footer is a standardized side-by-side Cancel (outlined,
//      card-coloured) + Save/Add (inverted, foreground) pair.

import { render, within } from "@testing-library/react-native";
import { View } from "react-native";
import { QuickAddSheet } from "@/components/nutrition/QuickAddSheet";
import { EditLogItemSheet } from "@/components/nutrition/EditLogItemSheet";
import { EditLoggedMealSheet } from "@/components/nutrition/EditLoggedMealSheet";
import { Input } from "@/components/Input";
import { Button } from "@/components/Button";

jest.mock("@become/api-client", () => {
  const actual = jest.requireActual("@become/api-client");
  return { __esModule: true, ...actual, apiFetch: jest.fn() };
});

jest.mock("@/lib/mind/sessionCache", () => ({
  invalidateMindSession: jest.fn(async () => {}),
}));

function badgeClassName(node: { props?: { className?: unknown } }): string {
  return String(node.props?.className ?? "");
}

describe("NP-373 (1): Quick Add's Calories input is visually prominent", () => {
  it("renders the Calories field with the Input's 'prominent' variant — 18px bold text, rounded-xl well", () => {
    const { getByTestId } = render(
      <QuickAddSheet visible onClose={jest.fn()} onSubmit={jest.fn()} />,
    );
    const calories = getByTestId("quick-add-calories-input");
    // NativeWind resolves the className into the rendered style; the
    // className itself still carries the literal utility classes this
    // assertion checks against.
    expect(String(calories.props.className)).toContain("rounded-xl");
    expect(String(calories.props.className)).toContain("text-lg");
    expect(String(calories.props.className)).toContain("font-bold");
    // Every other field on the sheet (Protein/Carbs/Fats/Note) stays the
    // compact default — only Calories gets the prominence.
    const protein = getByTestId("quick-add-protein-input");
    expect(String(protein.props.className)).not.toContain("text-lg");
    expect(String(protein.props.className)).not.toContain("font-bold");
  });

  it("the Input component's 'prominent' variant is 18px/bold in a 12px-radius (rounded-xl) container — the default variant is unaffected", () => {
    const { getByTestId: getProminent } = render(
      <Input testID="prominent-field" value="" onChangeText={() => {}} variant="prominent" />,
    );
    const prominentField = getProminent("prominent-field");
    expect(String(prominentField.props.className)).toContain("rounded-xl");
    expect(String(prominentField.props.className)).toContain("text-lg");
    expect(String(prominentField.props.className)).toContain("font-bold");

    const { getByTestId: getDefault } = render(
      <Input testID="default-field" value="" onChangeText={() => {}} />,
    );
    const defaultField = getDefault("default-field");
    expect(String(defaultField.props.className)).not.toContain("text-lg");
    expect(String(defaultField.props.className)).not.toContain("font-bold");
  });
});

describe("NP-373 (2): every sheet's header icon badge is a square h-9 w-9 rounded-lg", () => {
  it("QuickAddSheet's lightning-bolt badge is h-9 w-9 rounded-lg", () => {
    const { UNSAFE_getAllByType } = render(
      <QuickAddSheet visible onClose={jest.fn()} onSubmit={jest.fn()} />,
    );
    const badges = UNSAFE_getAllByType(View).filter((n) =>
      badgeClassName(n).includes("rounded-lg"),
    );
    expect(
      badges.some(
        (n) => badgeClassName(n).includes("h-9") && badgeClassName(n).includes("w-9"),
      ),
    ).toBe(true);
  });

  it("EditLogItemSheet's pencil badge is h-9 w-9 rounded-lg", () => {
    const { UNSAFE_getAllByType } = render(
      <EditLogItemSheet
        visible
        logId="log-1"
        item={{
          _id: "item-1",
          name: "Oats",
          servingSize: 40,
          servingUnit: "g",
          servings: 2,
          nutrition: { calories: 150, protein: 5, carbs: 27, fats: 3 },
          loggedQuantity: 80,
          loggedUnit: "g",
        }}
        onClose={jest.fn()}
        onSaved={jest.fn()}
      />,
    );
    const badges = UNSAFE_getAllByType(View).filter((n) =>
      badgeClassName(n).includes("rounded-lg"),
    );
    expect(
      badges.some(
        (n) => badgeClassName(n).includes("h-9") && badgeClassName(n).includes("w-9"),
      ),
    ).toBe(true);
  });

  it("EditLoggedMealSheet's chef-hat badge is h-9 w-9 rounded-lg", () => {
    const { UNSAFE_getAllByType } = render(
      <EditLoggedMealSheet
        visible
        logId="log-1"
        mealName="Breakfast"
        currentTag="breakfast"
        onClose={jest.fn()}
        onSaved={jest.fn()}
      />,
    );
    const badges = UNSAFE_getAllByType(View).filter((n) =>
      badgeClassName(n).includes("rounded-lg"),
    );
    expect(
      badges.some(
        (n) => badgeClassName(n).includes("h-9") && badgeClassName(n).includes("w-9"),
      ),
    ).toBe(true);
  });
});

describe("NP-373 (3): every sheet's footer is a standardized Cancel + Save/Add pair", () => {
  it("Button's 'outline' variant draws bg-card + border-border (the standardized Cancel), not the plain bg-muted 'secondary'", () => {
    const { getByTestId } = render(
      <Button testID="btn" variant="outline" size="footer">
        Cancel
      </Button>,
    );
    const btn = getByTestId("btn");
    expect(String(btn.props.className)).toContain("bg-card");
    expect(String(btn.props.className)).toContain("border-border");
    const label = within(btn).getByText("Cancel");
    expect(String(label.props.className)).toContain("text-sm");
  });

  it("QuickAddSheet's Cancel is 'outline' and Add is 'inverted', both at the footer size (text-sm)", () => {
    const { getByTestId } = render(
      <QuickAddSheet visible onClose={jest.fn()} onSubmit={jest.fn()} />,
    );
    const cancel = getByTestId("quick-add-cancel-button");
    const add = getByTestId("quick-add-submit-button");
    expect(String(cancel.props.className)).toContain("bg-card");
    expect(String(cancel.props.className)).toContain("border-border");
    expect(String(within(cancel).getByText("Cancel").props.className)).toContain("text-sm");
    expect(String(add.props.className)).toContain("bg-foreground");
    expect(String(within(add).getByText("Add").props.className)).toContain("text-sm");
  });

  it("EditLogItemSheet's Cancel is 'outline' and Save is 'inverted', both at the footer size (text-sm)", () => {
    const { getByTestId } = render(
      <EditLogItemSheet
        visible
        logId="log-1"
        item={{
          _id: "item-1",
          name: "Oats",
          servingSize: 40,
          servingUnit: "g",
          servings: 2,
          nutrition: { calories: 150, protein: 5, carbs: 27, fats: 3 },
          loggedQuantity: 80,
          loggedUnit: "g",
        }}
        onClose={jest.fn()}
        onSaved={jest.fn()}
      />,
    );
    const cancel = getByTestId("edit-log-item-cancel");
    const save = getByTestId("edit-log-item-save");
    expect(String(cancel.props.className)).toContain("bg-card");
    expect(String(cancel.props.className)).toContain("border-border");
    expect(String(within(cancel).getByText("Cancel").props.className)).toContain("text-sm");
    expect(String(save.props.className)).toContain("bg-foreground");
    expect(String(within(save).getByText("Save").props.className)).toContain("text-sm");
  });

  it("EditLoggedMealSheet's Cancel is 'outline' and Save is 'inverted', both at the footer size (text-sm)", () => {
    const { getByTestId } = render(
      <EditLoggedMealSheet
        visible
        logId="log-1"
        mealName="Breakfast"
        currentTag="breakfast"
        onClose={jest.fn()}
        onSaved={jest.fn()}
      />,
    );
    const cancel = getByTestId("edit-logged-meal-cancel");
    const save = getByTestId("edit-logged-meal-save");
    expect(String(cancel.props.className)).toContain("bg-card");
    expect(String(cancel.props.className)).toContain("border-border");
    expect(String(within(cancel).getByText("Cancel").props.className)).toContain("text-sm");
    expect(String(save.props.className)).toContain("bg-foreground");
    expect(String(within(save).getByText("Save").props.className)).toContain("text-sm");
  });
});
