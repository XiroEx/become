/* eslint-disable import/first */
// ─── Plan-a-food sheet, natively (NP-230) ────────────────────────────────────
//
// The native plan-mode tail of the web's `FoodSearchModal`
// (`webapp/components/nutrition/FoodSearchModal.tsx`): portion + tag via
// `QuantityPicker` (time/date controls hidden), a Repeat… disclosure (every
// day/week + count, default week x 6, clamped 30 by day / 52 by week, sent
// only when open with count > 1), and a `Plan <Tag>` CTA that submits through
// `createMealPlan`, retrying a 409 `plan_exists` once with `mode: 'merge'`.

import { fireEvent, render, waitFor } from "@testing-library/react-native";
import { ApiError } from "@become/api-client";

jest.mock("@/lib/auth/useAuth", () => ({
  useAuth: () => ({
    user: null,
    token: "test-jwt",
    loading: false,
    isAuthed: true,
    setToken: jest.fn(),
    refresh: jest.fn(),
    logout: jest.fn(),
  }),
}));

import { PlanFoodSheet } from "@/components/nutrition/PlanFoodSheet";
/* eslint-enable import/first */

const basePlan = {
  _id: "plan-1",
  plannedDate: "2026-10-08T00:00:00.000Z",
  plannedDateKey: "2026-10-08",
  tag: "lunch",
  items: [],
  status: "active" as const,
};

const OATS = {
  _id: "food-oats-1",
  name: "Rolled Oats",
  servingSize: 50,
  servingUnit: "g",
  gramsPerServing: 50,
  nutrition: { calories: 190, protein: 6, carbs: 33, fats: 3 },
};

function renderSheet(overrides: {
  apiFetch: jest.Mock;
  onPlanned?: jest.Mock;
  tag?: string;
}) {
  const onPlanned = overrides.onPlanned ?? jest.fn();
  const utils = render(
    <PlanFoodSheet
      visible
      food={OATS}
      plannedDate="2026-10-08"
      tag={overrides.tag ?? "lunch"}
      onClose={() => {}}
      onPlanned={onPlanned}
      apiFetch={overrides.apiFetch as any}
    />,
  );
  return { ...utils, onPlanned };
}

async function waitForEnabled(getByTestId: (id: string) => any) {
  await waitFor(() => {
    expect(
      getByTestId("plan-food-submit").props.accessibilityState?.disabled,
    ).toBe(false);
  });
}

describe("Card NP-230 acceptance", () => {
  it("Repeat every day x 7 posts one request with repeat {every:'day',count:7} and plannedDate 2026-10-08", async () => {
    const apiFetch = jest.fn(async () => ({ plan: basePlan }));
    const { getByTestId, onPlanned } = renderSheet({ apiFetch });
    await waitForEnabled(getByTestId);

    fireEvent.press(getByTestId("plan-repeat-toggle"));
    fireEvent.press(getByTestId("plan-repeat-every-day"));
    fireEvent.changeText(getByTestId("plan-repeat-count"), "7");
    fireEvent.press(getByTestId("plan-food-submit"));

    await waitFor(() => expect(onPlanned).toHaveBeenCalled());
    expect(apiFetch).toHaveBeenCalledTimes(1);
    const [path, , init] = apiFetch.mock.calls[0] as any[];
    expect(path).toBe("/api/meal-plans");
    expect(init.method).toBe("POST");
    expect(init.body).toMatchObject({
      plannedDate: "2026-10-08",
      tag: "lunch",
      repeat: { every: "day", count: 7 },
    });
    expect(Array.isArray(init.body.items)).toBe(true);
    expect(init.body.items).toHaveLength(1);
    expect(onPlanned).toHaveBeenCalledWith("Planned for Lunch");
  });

  it("a 409 plan_exists retries once with mode 'merge' and reports the toast", async () => {
    const existingPlan = { ...basePlan, _id: "existing-1" };
    const apiFetch = jest.fn();
    apiFetch.mockImplementationOnce(async () => {
      throw new ApiError(409, { error: "plan_exists", existingPlan });
    });
    apiFetch.mockImplementationOnce(async () => ({
      plan: basePlan,
      merged: true,
    }));
    const { getByTestId, onPlanned } = renderSheet({ apiFetch });
    await waitForEnabled(getByTestId);

    fireEvent.press(getByTestId("plan-food-submit"));

    await waitFor(() => expect(onPlanned).toHaveBeenCalled());
    expect(apiFetch).toHaveBeenCalledTimes(2);
    expect((apiFetch.mock.calls[1] as any[])[2].body.mode).toBe("merge");
    expect(onPlanned).toHaveBeenCalledWith("Added to existing Lunch plan");
  });

  it("Repeat closed sends no repeat; the count clamps at 30/day and 52/week", async () => {
    const apiFetch = jest.fn(async () => ({ plan: basePlan }));
    const { getByTestId, onPlanned } = renderSheet({ apiFetch });
    await waitForEnabled(getByTestId);

    // Repeat closed: no `repeat` key at all.
    fireEvent.press(getByTestId("plan-food-submit"));
    await waitFor(() => expect(onPlanned).toHaveBeenCalled());
    expect(apiFetch).toHaveBeenCalledTimes(1);
    expect((apiFetch.mock.calls[0] as any[])[2].body).not.toHaveProperty(
      "repeat",
    );

    // Clamps: 99 by day -> 30, 99 by week -> 52.
    fireEvent.press(getByTestId("plan-repeat-toggle"));
    fireEvent.press(getByTestId("plan-repeat-every-day"));
    fireEvent.changeText(getByTestId("plan-repeat-count"), "99");
    expect(getByTestId("plan-repeat-count").props.value).toBe("30");
    fireEvent.press(getByTestId("plan-repeat-every-week"));
    fireEvent.changeText(getByTestId("plan-repeat-count"), "99");
    expect(getByTestId("plan-repeat-count").props.value).toBe("52");
    // Switching week x 52 back to day clamps down to 30.
    fireEvent.press(getByTestId("plan-repeat-every-day"));
    expect(getByTestId("plan-repeat-count").props.value).toBe("30");
  });

  it("Plan mode hides the time and date controls; the CTA reads Plan <Tag>", async () => {
    const apiFetch = jest.fn(async () => ({ plan: basePlan }));
    const { getByTestId, queryByTestId } = renderSheet({ apiFetch });
    await waitForEnabled(getByTestId);

    expect(queryByTestId("time-mode-now")).toBeNull();
    expect(queryByTestId("time-mode-picked")).toBeNull();
    expect(queryByTestId("time-mode-none")).toBeNull();
    expect(queryByTestId("picked-time-input")).toBeNull();
    expect(queryByTestId("date-input")).toBeNull();

    expect(getByTestId("plan-food-submit-label").props.children).toBe(
      "Plan Lunch",
    );
    fireEvent.press(getByTestId("tag-chip-dinner"));
    expect(getByTestId("plan-food-submit-label").props.children).toBe(
      "Plan Dinner",
    );
  });
});
