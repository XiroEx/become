// ─── Edit item sheet visual pass, natively (NP-264) ──────────────────────────
//
// Covers the gaps the card called out against the web: amount PRESET chips
// (as logged / half / double) + Custom, the "Updated macros" grid, "Fix these
// macros" wired to the existing FlagFoodSheet correction flow, the close X,
// and the 12-hour time display.

import React from "react";
import { fireEvent, render, waitFor } from "@testing-library/react-native";

jest.mock("@become/api-client", () => {
  const actual = jest.requireActual("@become/api-client");
  return { __esModule: true, ...actual, apiFetch: jest.fn() };
});

jest.mock("@/lib/mind/sessionCache", () => ({
  invalidateMindSession: jest.fn(async () => {}),
}));

/* eslint-disable import/first */
import { apiFetch } from "@become/api-client";
import { EditLogItemSheet } from "../components/nutrition/EditLogItemSheet";
/* eslint-enable import/first */

const mockApiFetch = apiFetch as unknown as jest.Mock;

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

beforeEach(() => {
  mockApiFetch.mockReset();
  mockApiFetch.mockResolvedValue({ success: true });
});

describe("EditLogItemSheet — web visual parity (NP-264)", () => {
  it("renders amount PRESET chips (as logged / half / double) + Custom, not unit chips", () => {
    const { getByTestId, queryByTestId } = render(
      <EditLogItemSheet
        visible
        logId="log-1"
        item={loggedItem()}
        onClose={jest.fn()}
        onSaved={jest.fn()}
      />,
    );

    expect(getByTestId("edit-log-item-amount-preset-primary")).toBeTruthy();
    expect(getByTestId("edit-log-item-amount-preset-half")).toBeTruthy();
    expect(getByTestId("edit-log-item-amount-preset-double")).toBeTruthy();
    expect(getByTestId("edit-log-item-amount-custom")).toBeTruthy();
    // The old unit-chip picker (serving(80g)/g/oz/lb/kg/ml) is gone from this sheet.
    expect(queryByTestId("edit-log-item-quantity")).toBeNull();
  });

  it("selecting the half preset halves the Updated macros grid", async () => {
    const { getByTestId } = render(
      <EditLogItemSheet
        visible
        logId="log-1"
        item={loggedItem()}
        onClose={jest.fn()}
        onSaved={jest.fn()}
      />,
    );

    // At 80 g (as logged, 2 servings of 40 g @ 150 cal/serving) -> 300 cal.
    expect(getByTestId("edit-log-item-macro-cal").props.children).toBe("300");

    fireEvent.press(getByTestId("edit-log-item-amount-preset-half"));

    await waitFor(() => {
      expect(getByTestId("edit-log-item-macro-cal").props.children).toBe("150");
    });
  });

  it("Custom reveals a free-typed amount and 'Back to presets' returns", () => {
    const { getByTestId, queryByTestId } = render(
      <EditLogItemSheet
        visible
        logId="log-1"
        item={loggedItem()}
        onClose={jest.fn()}
        onSaved={jest.fn()}
      />,
    );

    fireEvent.press(getByTestId("edit-log-item-amount-custom"));
    expect(getByTestId("edit-log-item-amount-custom-input")).toBeTruthy();
    expect(queryByTestId("edit-log-item-amount-preset-primary")).toBeNull();

    fireEvent.press(getByTestId("edit-log-item-amount-back-to-presets"));
    expect(getByTestId("edit-log-item-amount-preset-primary")).toBeTruthy();
  });

  it("shows the 12-hour time display and the X close button", () => {
    const onClose = jest.fn();
    const { getByTestId } = render(
      <EditLogItemSheet
        visible
        logId="log-1"
        item={loggedItem()}
        loggedAt="2026-10-01T04:00:00.000Z"
        onClose={onClose}
        onSaved={jest.fn()}
      />,
    );

    // 04:00 UTC — formatted as whatever the local 12-hour clock renders;
    // assert it parses back to a valid HH:mm rather than pin a TZ-dependent
    // string.
    const timeInput = getByTestId("edit-log-item-time");
    expect(String(timeInput.props.value)).toMatch(/^\d{1,2}:\d{2} (AM|PM)$/);

    fireEvent.press(getByTestId("edit-log-item-close"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("'Fix these macros' opens the correction sheet and threads the override back", async () => {
    const { getByTestId, getByText } = render(
      <EditLogItemSheet
        visible
        logId="log-1"
        item={loggedItem()}
        token="t"
        onClose={jest.fn()}
        onSaved={jest.fn()}
      />,
    );

    expect(getByText("Fix these macros")).toBeTruthy();

    fireEvent.press(getByTestId("edit-log-item-fix-macros"));
    fireEvent.press(getByTestId("edit-log-item-flag-fix-entry"));
    expect(getByTestId("flag-fix-back")).toBeTruthy();

    fireEvent.changeText(getByTestId("flag-fix-calories"), "400");
    fireEvent.press(getByTestId("flag-fix-apply"));

    // The correction is held until save, and the button's own label says so —
    // mirrors the web's `nutritionOverride ? 'Macros edited — save to apply'`.
    await waitFor(() => {
      expect(getByText("Macros edited — save to apply")).toBeTruthy();
    });
    // The macro grid already reflects the corrected calories (400 cal at the
    // currently-selected 80 g, i.e. the full corrected amount since the
    // logged amount preset is still 1x).
    expect(getByTestId("edit-log-item-macro-cal").props.children).toBe("400");
  });

  it("Save renders the web's black/inverted button, not the red primary", () => {
    const { getByTestId } = render(
      <EditLogItemSheet
        visible
        logId="log-1"
        item={loggedItem()}
        onClose={jest.fn()}
        onSaved={jest.fn()}
      />,
    );
    const save = getByTestId("edit-log-item-save");
    expect(save.props.className).toContain("bg-foreground");
  });
});
