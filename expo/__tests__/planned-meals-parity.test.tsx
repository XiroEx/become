/* eslint-disable import/first */
import { fireEvent, render, waitFor, act } from "@testing-library/react-native";

const TODAY_MOCK = "2026-06-02";

let mockParams: Record<string, string | undefined> = {};
const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => mockParams,
}));

const mockToken = "test-jwt";
jest.mock("@/lib/auth/useAuth", () => ({
  useAuth: () => ({
    user: null,
    token: mockToken,
    loading: false,
    isAuthed: true,
    setToken: jest.fn(),
    refresh: jest.fn(),
    logout: jest.fn(),
  }),
}));

jest.mock("@/lib/time/localDay", () => {
  const actual = jest.requireActual("@/lib/time/localDay");
  return {
    __esModule: true,
    ...actual,
    useLocalDay: () => ({ day: TODAY_MOCK, tzOffset: 0 }),
  };
});

jest.mock("@become/api-client", () => {
  const actual = jest.requireActual("@become/api-client");
  return { __esModule: true, ...actual, apiFetch: jest.fn() };
});

import { apiFetch } from "@become/api-client";
import NutritionIndexRoute from "../app/(app)/(tabs)/nutrition/index";
/* eslint-enable import/first */

const mockApiFetch = apiFetch as unknown as jest.Mock;

function callsByMethod(prefix: string, method: string): unknown[][] {
  return mockApiFetch.mock.calls.filter(
    (c) =>
      String(c[0]).startsWith(prefix) &&
      ((c[2] as { method?: string } | undefined)?.method ?? "GET") === method,
  );
}

const activePlanFixture = {
  _id: "plan-1",
  plannedDate: "2026-06-02T00:00:00.000Z",
  plannedDateKey: TODAY_MOCK,
  tag: "breakfast",
  mealName: "Protein Oatmeal",
  status: "active",
  items: [
    {
      _id: "pi-1",
      name: "Rolled Oats",
      servings: 1,
      servingSize: "40",
      servingUnit: "g",
      nutrition: { calories: 150, protein: 5, carbs: 27, fats: 3, fiber: 4 },
    },
    {
      _id: "pi-2",
      name: "Whey Protein",
      servings: 1,
      servingSize: "30",
      servingUnit: "g",
      nutrition: { calories: 120, protein: 24, carbs: 2, fats: 1, fiber: 0 },
    },
  ],
  expectedNutrition: {
    calories: 270,
    protein: 29,
    carbs: 29,
    fats: 4,
    fiber: 4,
  },
};

const goalsFixture = {
  calories: 2000,
  protein: 150,
  carbs: 200,
  fats: 65,
};

const sideTablesFixture = {
  water: { current: 16, goal: 64 },
  quickAdds: [],
};

const scheduleFixture = {
  windows: [
    { tag: "breakfast", startMinutes: 420, endMinutes: 600 },
    { tag: "lunch", startMinutes: 720, endMinutes: 840 },
  ],
};

const tagsFixture = {
  defaults: ["breakfast", "lunch", "dinner", "snack"],
  userTags: [],
};

describe("Planned Meals Native Parity (NP-147)", () => {
  let plansState: typeof activePlanFixture[] = [];
  let logsState: any[] = [];
  let profilePromoteMode: "manual" | "auto" = "manual";

  beforeEach(() => {
    jest.useRealTimers();
    mockApiFetch.mockReset();
    mockParams = { date: TODAY_MOCK };
    mockPush.mockReset();
    plansState = [{ ...activePlanFixture }];
    logsState = [];
    profilePromoteMode = "manual";

    mockApiFetch.mockImplementation(
      async (url: string, _schema: unknown, init?: { method?: string; body?: any }) => {
        const method = init?.method ?? "GET";

        if (url.startsWith("/api/profile")) {
          return {
            profile: {
              planPromoteMode: profilePromoteMode,
            },
          };
        }

        if (url.startsWith("/api/meal-plans")) {
          if (url.includes("/promote") && method === "POST") {
            const planId = url.split("/")[3];
            const found = plansState.find((p) => p._id === planId);
            if (!found || found.status !== "active") {
              const err = new Error("Plan already promoted");
              (err as any).status = 409;
              throw err;
            }
            found.status = "promoted";
            const newLog = {
              _id: `log-promoted-${planId}`,
              loggedAt: new Date().toISOString(),
              untimed: true,
              tags: [found.tag],
              mealName: found.mealName,
              items: found.items,
              fromPlanId: found._id,
            };
            logsState.push(newLog);
            return { success: true, log: newLog };
          }

          if (url.includes("/skip") && method === "POST") {
            const planId = url.split("/")[3];
            const found = plansState.find((p) => p._id === planId);
            if (found) {
              found.status = "skipped";
            }
            return { success: true, plan: found };
          }

          if (method === "DELETE") {
            const planId = url.split("/")[3];
            plansState = plansState.filter((p) => p._id !== planId);
            return { success: true };
          }

          // GET /api/meal-plans?from=...
          return {
            plans: plansState.filter((p) => p.status === "active"),
            days: [],
          };
        }

        if (url.startsWith("/api/meal-logs")) {
          if (method === "DELETE") {
            const logId = url.split("/")[3];
            const removed = logsState.find((l) => l._id === logId);
            logsState = logsState.filter((l) => l._id !== logId);
            if (removed?.fromPlanId) {
              const srcPlan = plansState.find((p) => p._id === removed.fromPlanId);
              if (srcPlan) srcPlan.status = "active";
            }
            return { success: true };
          }

          return {
            date: TODAY_MOCK,
            logs: logsState,
            dailyTotals: {
              calories: logsState.reduce(
                (sum, l) =>
                  sum +
                  (l.items ?? []).reduce(
                    (isum: number, it: any) =>
                      isum + (it.nutrition?.calories ?? 0) * (it.servings ?? 1),
                    0,
                  ),
                0,
              ),
              protein: 0,
              carbs: 0,
              fats: 0,
              fiber: 0,
            },
          };
        }

        if (url.startsWith("/api/nutrition/log")) return sideTablesFixture;
        if (url.startsWith("/api/nutrition/goals")) return goalsFixture;
        if (url.startsWith("/api/goals")) return { todayKey: TODAY_MOCK, nutrition: {} };
        if (url.startsWith("/api/nutrition/meal-schedule")) return scheduleFixture;
        if (url.startsWith("/api/tags")) return tagsFixture;

        return {};
      },
    );
  });

  it("e015c9fd: A plan made on the web for today shows natively, and Log it turns it into an untimed log on both", async () => {
    const { getByTestId, getByText, queryByTestId } = render(<NutritionIndexRoute />);

    // 1. Plan shows natively with "Planned" badge, title, and items
    await waitFor(() => {
      expect(getByTestId("nutrition-plan-plan-1")).toBeTruthy();
    });

    expect(getByTestId("nutrition-plan-title-plan-1")).toBeTruthy();
    expect(getByText("Protein Oatmeal")).toBeTruthy();
    expect(getByTestId("nutrition-plan-badge-plan-1")).toBeTruthy();
    expect(getByTestId("nutrition-plan-log-plan-1")).toBeTruthy();

    // 2. Press "Log it"
    await act(async () => {
      fireEvent.press(getByTestId("nutrition-plan-log-plan-1"));
    });

    // 3. Verify promote was called with untimed: true
    const promoteCalls = callsByMethod("/api/meal-plans/plan-1/promote", "POST");
    expect(promoteCalls.length).toBe(1);
    const promoteBody = (promoteCalls[0]?.[2] as { body?: any })?.body;
    expect(promoteBody).toEqual({ untimed: true });

    // 4. Plan is promoted and no longer in active plans
    await waitFor(() => {
      expect(queryByTestId("nutrition-plan-plan-1")).toBeNull();
    });
    // And now shows as a logged meal row
    expect(logsState.length).toBe(1);
    expect(logsState[0].untimed).toBe(true);
    expect(logsState[0].fromPlanId).toBe("plan-1");
  });

  it("e015c9fe: Tapping Log it twice logs once", async () => {
    const { getByTestId } = render(<NutritionIndexRoute />);

    await waitFor(() => {
      expect(getByTestId("nutrition-plan-log-plan-1")).toBeTruthy();
    });

    const logButton = getByTestId("nutrition-plan-log-plan-1");

    // Double tap
    await act(async () => {
      fireEvent.press(logButton);
      fireEvent.press(logButton);
    });

    // Only one promote call was dispatched
    const promoteCalls = callsByMethod("/api/meal-plans/plan-1/promote", "POST");
    expect(promoteCalls.length).toBe(1);

    // Exactly one log was created
    expect(logsState.length).toBe(1);
  });

  it("e015c9ff: With Auto on, opening today's native day promotes today's plans once, and Undo within 8 seconds removes the logs and restores the plans", async () => {
    profilePromoteMode = "auto";

    const { getByTestId } = render(<NutritionIndexRoute />);

    // Auto-promote sweep fires automatically
    await waitFor(() => {
      const promoteCalls = callsByMethod("/api/meal-plans/plan-1/promote", "POST");
      expect(promoteCalls.length).toBe(1);
      expect((promoteCalls[0]?.[2] as { body?: any })?.body).toEqual({ untimed: true });
    });

    // Undo banner is displayed
    await waitFor(() => {
      expect(getByTestId("nutrition-undo-banner")).toBeTruthy();
      expect(getByTestId("nutrition-undo-auto-promote")).toBeTruthy();
    });

    // Press Undo
    await act(async () => {
      fireEvent.press(getByTestId("nutrition-undo-auto-promote"));
    });

    // Verify DELETE was called on the created log
    await waitFor(() => {
      const deleteCalls = callsByMethod("/api/meal-logs/log-promoted-plan-1", "DELETE");
      expect(deleteCalls.length).toBe(1);
    });

    // Plan is restored back to active
    await waitFor(() => {
      expect(getByTestId("nutrition-plan-plan-1")).toBeTruthy();
    });
    expect(logsState.length).toBe(0);
    expect(plansState.find((p) => p._id === "plan-1")?.status).toBe("active");
  });

  it("e015ca00: Skipping a plan natively removes it from the web's day and timeline", async () => {
    const { getByTestId, queryByTestId } = render(<NutritionIndexRoute />);

    await waitFor(() => {
      expect(getByTestId("nutrition-plan-skip-plan-1")).toBeTruthy();
    });

    // Press Skip
    await act(async () => {
      fireEvent.press(getByTestId("nutrition-plan-skip-plan-1"));
    });

    // Verify POST /api/meal-plans/plan-1/skip was called
    const skipCalls = callsByMethod("/api/meal-plans/plan-1/skip", "POST");
    expect(skipCalls.length).toBe(1);

    // Plan status is now skipped on the server
    expect(plansState.find((p) => p._id === "plan-1")?.status).toBe("skipped");

    // Plan is removed from the active day view
    await waitFor(() => {
      expect(queryByTestId("nutrition-plan-plan-1")).toBeNull();
    });
  });

  it("Renders light shadow on today's calorie ring and macro bars for planned meals", async () => {
    const { getByTestId } = render(<NutritionIndexRoute />);

    await waitFor(() => {
      // Svg shadow circle rendered for planned calories
      expect(getByTestId("calorie-ring-planned-shadow")).toBeTruthy();
      // Planned extra badge rendered
      expect(getByTestId("calorie-ring-planned-extra")).toBeTruthy();
      // Macro bars have planned bars
      expect(getByTestId("macro-bar-protein-planned")).toBeTruthy();
    });
  });

  it("Renders planned meals on future days without 'Log it' button (today only)", async () => {
    mockParams = { date: "2026-06-03" }; // future day
    plansState = [
      {
        ...activePlanFixture,
        _id: "future-plan-1",
        plannedDate: "2026-06-03T00:00:00.000Z",
        plannedDateKey: "2026-06-03",
      },
    ];

    const { getByTestId, queryByTestId } = render(<NutritionIndexRoute />);

    await waitFor(() => {
      expect(getByTestId("nutrition-plan-future-plan-1")).toBeTruthy();
    });

    // Log it button is NOT rendered on future day
    expect(queryByTestId("nutrition-plan-log-future-plan-1")).toBeNull();

    // Skip and Remove buttons ARE rendered
    expect(getByTestId("nutrition-plan-skip-future-plan-1")).toBeTruthy();
    expect(getByTestId("nutrition-plan-remove-future-plan-1")).toBeTruthy();
  });

  it("Removing a plan calls DELETE /api/meal-plans/:id and removes it", async () => {
    const { getByTestId, queryByTestId } = render(<NutritionIndexRoute />);

    await waitFor(() => {
      expect(getByTestId("nutrition-plan-remove-plan-1")).toBeTruthy();
    });

    await act(async () => {
      fireEvent.press(getByTestId("nutrition-plan-remove-plan-1"));
    });

    const deleteCalls = callsByMethod("/api/meal-plans/plan-1", "DELETE");
    expect(deleteCalls.length).toBe(1);

    await waitFor(() => {
      expect(queryByTestId("nutrition-plan-plan-1")).toBeNull();
    });
  });
});
