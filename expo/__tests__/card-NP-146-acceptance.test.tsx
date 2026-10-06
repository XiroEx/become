/* eslint-disable import/first */
// ─── Meal plan week + plan mode for future days (NP-146, umbrella) ───────────
//
// NP-146 was split into five slices, all of which are on beta: NP-229
// (`mealPlanApi.ts`), NP-230 (`PlanFoodSheet`), NP-231 (the Meal Plan week
// screen), NP-232 (plan mode on a future day + `MealLogSheet mode="plan"`) and
// NP-233 (edit a planned item / remove one plan or the series). Each slice has
// its own acceptance test for its own surface. This file is the umbrella's
// own evidence: the three NP-146 criteria, end to end, across the SAME
// boundary the web crosses.
//
// It is deliberately cross-client. The native screens run for real (mocked
// `apiFetch`), and the payload they produce is then pushed through the WEB's
// own server-side code — `webapp/lib/mealPlanDates.ts`, imported by relative
// path exactly like `webapp/tests/unit/contract/_contract.ts` imports the
// shared schemas — plus source assertions against the web surfaces this port
// mirrors (`app/dashboard/meal-plan/page.tsx`, `app/dashboard/timeline/page.tsx`,
// `app/dashboard/nutrition/page.tsx`, `app/api/meal-*`), which cannot be
// rendered from the expo suite.
//
// Criteria:
//   e015c9f7  a meal planned natively for Thursday shows on the web's meal
//             plan for Thursday
//   e015c9f8  planned meals do not change a day's logged totals on either
//             client
//   e015c9f9  a plan repeated every day for a week natively creates the same
//             series the web's planner creates

import fs from "fs";
import path from "path";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";

// A fixed day the `localDay` mock calls "today" for the nutrition screen. It
// is intentionally in the past of the real clock: "today" assertions then hold
// forever, and the future-day case derives its date from the real clock below
// (the screen's `isFuture` compares against the real clock, not this mock).
const TODAY_MOCK = "2026-06-02";

let mockParams: Record<string, string | undefined> = {};
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => mockParams,
}));

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

jest.mock("@/lib/entitlements", () => {
  const actual = jest.requireActual("@/lib/entitlements");
  return {
    __esModule: true,
    ...actual,
    useEntitlements: () => ({
      data: null,
      feature: () => ({ canCreate: true }),
      refresh: jest.fn(async () => {}),
      loading: false,
    }),
  };
});

jest.mock("@/lib/mind/sessionCache", () => ({
  invalidateMindSession: jest.fn(async () => {}),
}));

import { apiFetch } from "@become/api-client";
// The WEB's server-side plan-date helpers — the code that decides what a
// `plannedDate` becomes in the database and what the web reads back.
import {
  addDaysToKey as webAddDaysToKey,
  parsePlannedDateToUtcMidnight as webParsePlannedDate,
  plannedDateKey as webPlannedDateKey,
} from "../../webapp/lib/mealPlanDates";
import {
  addDays,
  groupPlansByDay,
  startOfWeek,
  weekDays,
  weekRangeKeys,
  ymd,
} from "../lib/nutrition/mealPlanWeek";
import {
  MAX_REPEAT_COUNT_BY_DAY,
  MAX_REPEAT_COUNT_BY_WEEK,
  clampRepeat,
} from "../lib/nutrition/mealPlanApi";
import { PlanFoodSheet } from "../components/nutrition/PlanFoodSheet";
import MealPlanRoute from "../app/(app)/(tabs)/nutrition/meal-plan";
import NutritionIndexRoute from "../app/(app)/(tabs)/nutrition/index";
/* eslint-enable import/first */

const mockApiFetch = apiFetch as unknown as jest.Mock;

const WEBAPP_DIR = path.join(__dirname, "..", "..", "webapp");
function readWeb(...segments: string[]): string {
  return fs.readFileSync(path.join(WEBAPP_DIR, ...segments), "utf8");
}

// ── Dates ────────────────────────────────────────────────────────────────────
// NEXT week's Thursday: always a future day (so the real API would accept it),
// and always a Thursday, whatever day the suite runs on.
const NEXT_WEEK_START = startOfWeek(addDays(new Date(), 7));
const THURSDAY = ymd(addDays(NEXT_WEEK_START, 4));
// A day that is future against the REAL clock, for the nutrition screen's
// plan mode (`isFutureLocalDate`).
const FUTURE_DAY = ymd(addDays(new Date(), 4));

// ── Fixtures ─────────────────────────────────────────────────────────────────

const OATS = {
  _id: "6512c0ffee11111111111111",
  name: "Rolled Oats",
  brand: "Test",
  servingSize: 50,
  servingUnit: "g",
  gramsPerServing: 50,
  nutrition: { calories: 190, protein: 6, carbs: 33, fats: 3 },
  variants: [
    {
      _id: "6512c0ffee11111111111112",
      name: "Default",
      isDefault: true,
      servingSize: 50,
      servingUnit: "g",
      gramsPerServing: 50,
      nutrition: { calories: 190, protein: 6, carbs: 33, fats: 3 },
    },
  ],
};

const goalsFixture = {
  calories: 2000,
  protein: 150,
  carbs: 200,
  fats: 65,
  fiber: 30,
};
const sideTablesFixture = { water: { current: 16, goal: 64 }, quickAdds: [] };
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

/** One logged sitting worth 300 kcal on `TODAY_MOCK`. */
const LOGGED_SITTING = {
  _id: "log-today-1",
  user: "user-1",
  loggedAt: `${TODAY_MOCK}T08:30:00.000Z`,
  untimed: false,
  tags: ["breakfast"],
  items: [
    {
      _id: "li-1",
      name: "Toast",
      servings: 1,
      servingSize: 40,
      servingUnit: "g",
      nutrition: { calories: 300, protein: 10, carbs: 40, fats: 8, fiber: 2 },
    },
  ],
  totalNutrition: { calories: 300, protein: 10, carbs: 40, fats: 8, fiber: 2 },
};

/** An ACTIVE plan worth 700 kcal on `TODAY_MOCK` — never a logged total. */
const TODAY_PLAN = {
  _id: "plan-today-1",
  plannedDate: `${TODAY_MOCK}T00:00:00.000Z`,
  plannedDateKey: TODAY_MOCK,
  tag: "lunch",
  mealName: "Chicken & Rice",
  status: "active" as const,
  items: [
    {
      _id: "pi-1",
      name: "Chicken Breast",
      servings: 1,
      servingSize: "200",
      servingUnit: "g",
      nutrition: { calories: 700, protein: 60, carbs: 50, fats: 20, fiber: 3 },
    },
  ],
  expectedNutrition: {
    calories: 700,
    protein: 60,
    carbs: 50,
    fats: 20,
    fiber: 3,
  },
};

// Mutable server state for the week screen.
type PlanRow = Record<string, unknown> & { _id: string; status: string };
let plansState: PlanRow[] = [];
let logsState: (typeof LOGGED_SITTING)[] = [];

function postPlanCalls(): unknown[][] {
  return mockApiFetch.mock.calls.filter(
    (c) =>
      c[0] === "/api/meal-plans" &&
      ((c[2] as { method?: string } | undefined)?.method ?? "GET") === "POST",
  );
}

function postLogCalls(): unknown[][] {
  return mockApiFetch.mock.calls.filter(
    (c) =>
      (String(c[0]).startsWith("/api/meal-logs") ||
        (String(c[0]).startsWith("/api/meals/") &&
          String(c[0]).endsWith("/log"))) &&
      ((c[2] as { method?: string } | undefined)?.method ?? "GET") === "POST",
  );
}

function weekGetCalls(): string[] {
  return mockApiFetch.mock.calls
    .map((c) => String(c[0]))
    .filter((u) => u.startsWith("/api/meal-plans?from="));
}

function bodyOf(call: unknown[] | undefined): Record<string, unknown> {
  return ((call?.[2] as { body?: unknown })?.body ?? {}) as Record<
    string,
    unknown
  >;
}

function installHandler() {
  mockApiFetch.mockImplementation(
    async (
      url: string,
      _schema: unknown,
      init?: { method?: string; body?: unknown },
    ) => {
      const method = init?.method ?? "GET";

      if (url === "/api/meal-plans" && method === "POST") {
        const body = (init?.body ?? {}) as {
          plannedDate?: string;
          tag?: string;
          items?: Record<string, unknown>[];
          mealId?: string;
        };
        // The server stores items with a string `servingSize` (the wire shape
        // `MealPlanItemSchema` reads); echo that, not the picker's number.
        const created: PlanRow = {
          _id: `plan-created-${plansState.length + 1}`,
          plannedDate: `${body.plannedDate ?? THURSDAY}T00:00:00.000Z`,
          plannedDateKey: body.plannedDate ?? THURSDAY,
          tag: body.tag ?? "lunch",
          items: (body.items ?? []).map((it) => ({
            ...it,
            servingSize: String(it.servingSize ?? ""),
          })),
          status: "active",
          expectedNutrition: { calories: 190 },
        };
        plansState.push(created);
        return { plan: created };
      }
      if (url.startsWith("/api/meal-plans/") && method === "DELETE") {
        const planId = decodeURIComponent(url.split("/")[3] ?? "");
        plansState = plansState.filter((p) => p._id !== planId);
        return { success: true, deletedCount: 1 };
      }
      if (url.startsWith("/api/meal-plans?from=")) {
        return { plans: plansState.filter((p) => p.status === "active"), days: [] };
      }
      if (url.startsWith("/api/meal-logs")) {
        if (method === "POST") return { success: true, log: { _id: "log-new" } };
        const m = url.match(/date=(\d{4}-\d{2}-\d{2})/);
        const dayKey = m?.[1] ?? TODAY_MOCK;
        const logs = dayKey === TODAY_MOCK ? logsState : [];
        const dailyTotals = logs.reduce(
          (acc, l) => ({
            calories: acc.calories + (l.totalNutrition.calories ?? 0),
            protein: acc.protein + (l.totalNutrition.protein ?? 0),
            carbs: acc.carbs + (l.totalNutrition.carbs ?? 0),
            fats: acc.fats + (l.totalNutrition.fats ?? 0),
            fiber: acc.fiber + (l.totalNutrition.fiber ?? 0),
          }),
          { calories: 0, protein: 0, carbs: 0, fats: 0, fiber: 0 },
        );
        return { date: dayKey, logs, dailyTotals };
      }
      if (url.startsWith("/api/meals/") && url.endsWith("/log") && method === "POST") {
        return { success: true, log: { _id: "log-meal" } };
      }
      if (url.startsWith("/api/nutrition/foods/overview")) {
        return { foods: [OATS], meals: [], recent: [], frequent: [] };
      }
      if (url.startsWith("/api/nutrition/foods/search")) return { foods: [OATS] };
      if (url.startsWith("/api/nutrition/foods/recent")) return { foods: [] };
      if (url.startsWith("/api/nutrition/foods/frequent")) return { foods: [] };
      if (url.startsWith("/api/me/foods")) return { foods: [] };
      if (url.startsWith("/api/meals")) return { meals: [], total: 0 };
      if (url.startsWith("/api/nutrition/log")) return sideTablesFixture;
      if (url.startsWith("/api/nutrition/goals")) return goalsFixture;
      if (url.startsWith("/api/goals")) return { todayKey: TODAY_MOCK, nutrition: {} };
      if (url.startsWith("/api/nutrition/meal-schedule")) return scheduleFixture;
      if (url.startsWith("/api/tags")) return tagsFixture;
      if (url.startsWith("/api/profile")) return { profile: {} };
      return {};
    },
  );
}

beforeEach(() => {
  mockApiFetch.mockReset();
  mockParams = {};
  plansState = [];
  logsState = [];
  installHandler();
});

describe("Card NP-146 acceptance (umbrella)", () => {
  it("(id: e015c9f7) a meal planned natively for Thursday is stored at that Thursday's UTC midnight and buckets into the web's Thursday column", async () => {
    // The date under test really is a Thursday, on any run date.
    const [ty, tm, td] = THURSDAY.split("-").map(Number);
    expect(new Date(ty ?? 0, (tm ?? 1) - 1, td ?? 1).getDay()).toBe(4);

    const first = render(<MealPlanRoute />);
    await waitFor(() => {
      expect(weekGetCalls().length).toBeGreaterThan(0);
    });
    // Step to next week so the Thursday under test is a future day.
    await act(async () => {
      fireEvent.press(first.getByTestId("meal-plan-next-week"));
    });
    await waitFor(() => {
      expect(first.getByTestId(`meal-plan-day-${THURSDAY}`)).toBeTruthy();
    });
    // The week GET uses the Sunday → Saturday keys of that week.
    expect(weekGetCalls()).toContain(
      `/api/meal-plans?from=${ymd(NEXT_WEEK_START)}&to=${ymd(addDays(NEXT_WEEK_START, 6))}`,
    );

    // Reveal Thursday's lunch slot and plan a food into it.
    await act(async () => {
      fireEvent.press(first.getByTestId(`meal-plan-add-meal-${THURSDAY}`));
    });
    await act(async () => {
      fireEvent.press(first.getByTestId(`meal-plan-add-tag-${THURSDAY}-lunch`));
    });
    await act(async () => {
      fireEvent.press(first.getByTestId(`meal-plan-add-${THURSDAY}-lunch`));
    });
    expect(first.getByTestId("meal-plan-food-search")).toBeTruthy();
    await waitFor(() => {
      expect(first.getByTestId(`food-search-result-${OATS._id}`)).toBeTruthy();
    });
    await act(async () => {
      fireEvent.press(first.getByTestId(`food-search-result-${OATS._id}`));
    });
    await waitFor(() => {
      expect(first.getByTestId("plan-food-sheet")).toBeTruthy();
    });
    // The sheet is rooted at Thursday, not at today.
    expect(first.getByTestId("plan-food-sheet-date").props.children).toEqual(
      expect.arrayContaining([THURSDAY]),
    );
    await waitFor(() => {
      expect(
        first.getByTestId("plan-food-submit").props.accessibilityState?.disabled,
      ).toBe(false);
    });
    await act(async () => {
      fireEvent.press(first.getByTestId("plan-food-submit"));
    });
    await waitFor(() => {
      expect(postPlanCalls().length).toBe(1);
    });

    // 1. What the native client sent: a LOCAL calendar date, never a timestamp.
    const body = bodyOf(postPlanCalls()[0]);
    expect(body.plannedDate).toBe(THURSDAY);
    expect(String(body.plannedDate)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(body.tag).toBe("lunch");
    expect(Array.isArray(body.items)).toBe(true);

    // 2. What the WEB SERVER makes of it — its own code, not a re-implementation:
    //    UTC midnight of that calendar day, and the same key back out.
    const stored = webParsePlannedDate(String(body.plannedDate));
    expect(stored.toISOString()).toBe(`${THURSDAY}T00:00:00.000Z`);
    expect(webPlannedDateKey(stored)).toBe(THURSDAY);
    expect(stored.getUTCDay()).toBe(4); // Thursday in storage too

    // 3. Where the WEB's meal plan puts it: `plannedDateKey` buckets, in a
    //    Sunday-start week whose from/to are the same keys the native screen
    //    asked for (webapp/app/dashboard/meal-plan/page.tsx).
    const webMealPlanPage = readWeb("app", "dashboard", "meal-plan", "page.tsx");
    expect(webMealPlanPage).toContain(
      "x.setDate(x.getDate() - x.getDay()) // Sunday start",
    );
    expect(webMealPlanPage).toContain("const arr = m.get(p.plannedDateKey)");
    expect(webMealPlanPage).toContain("const from = ymd(days[0])");
    expect(webMealPlanPage).toContain("const to = ymd(days[6])");
    // The web's Thursday column key is `ymd(days[4])` of the Sunday-start week
    // — the native week math lands on exactly that, and the stored plan's key
    // equals it.
    const nativeWeek = weekDays(NEXT_WEEK_START).map(ymd);
    expect(nativeWeek[4]).toBe(THURSDAY);
    expect(weekRangeKeys(NEXT_WEEK_START)).toEqual({
      from: nativeWeek[0],
      to: nativeWeek[6],
    });
    const serialized = {
      ...TODAY_PLAN,
      _id: "plan-serialized",
      plannedDate: stored.toISOString(),
      plannedDateKey: webPlannedDateKey(stored),
      tag: "lunch",
    };
    expect([...groupPlansByDay([serialized]).keys()]).toEqual([THURSDAY]);

    // 4. And the plan comes back natively in the same Thursday lunch slot.
    first.unmount();
    const again = render(<MealPlanRoute />);
    await act(async () => {
      fireEvent.press(again.getByTestId("meal-plan-next-week"));
    });
    await waitFor(() => {
      expect(again.getByTestId(`meal-plan-slot-${THURSDAY}-lunch`)).toBeTruthy();
    });
    expect(again.getByText("Rolled Oats")).toBeTruthy();
  });

  it("(id: e015c9f8) planned meals never reach a day's logged totals — natively, and by the web's own rules", async () => {
    // ── Native, today: 300 kcal logged, a 700 kcal ACTIVE plan on screen.
    plansState = [{ ...TODAY_PLAN }];
    logsState = [{ ...LOGGED_SITTING }];
    mockParams = { date: TODAY_MOCK };

    const today = render(<NutritionIndexRoute />);
    await waitFor(() => {
      expect(today.getByTestId("nutrition-plan-plan-today-1")).toBeTruthy();
    });
    // The ring reads REMAINING = goal - consumed. Logged only: 2000 - 300.
    // If the plan counted it would read 2000 - 1000 = 1000.
    await waitFor(() => {
      expect(today.getByTestId("day-totals-kcal").props.children).toBe(1700);
    });
    expect(today.getByTestId("day-totals-target").props.children).toEqual(
      expect.arrayContaining([2000, 300]),
    );
    // Macros likewise: protein 10 logged, not 70.
    expect(today.getByTestId("day-totals-protein").props.children).toEqual([
      10,
      "g / ",
      150,
      "g",
    ]);
    today.unmount();

    // ── Native, a future day: planning writes a plan and nothing else. No
    //    `/api/meal-logs` POST, no `/api/meals/{id}/log`, so no logged total
    //    and no streak activity can move.
    plansState = [];
    logsState = [];
    mockParams = { date: FUTURE_DAY };
    const future = render(<NutritionIndexRoute />);
    await waitFor(() => {
      expect(future.getByTestId("nutrition-fab-add")).toBeTruthy();
    });
    // Plan mode, not log mode: the web relabels the same control
    // (`page.tsx:860-868`).
    expect(future.getByTestId("nutrition-fab-add").props.accessibilityLabel).toBe(
      "Schedule food",
    );
    await act(async () => {
      fireEvent.press(future.getByTestId("nutrition-fab-add"));
    });
    await waitFor(() => {
      expect(future.getByTestId(`food-search-result-${OATS._id}`)).toBeTruthy();
    });
    await act(async () => {
      fireEvent.press(future.getByTestId(`food-search-result-${OATS._id}`));
    });
    await waitFor(() => {
      expect(
        future.getByTestId("plan-food-submit").props.accessibilityState?.disabled,
      ).toBe(false);
    });
    await act(async () => {
      fireEvent.press(future.getByTestId("plan-food-submit"));
    });
    await waitFor(() => {
      expect(postPlanCalls().length).toBe(1);
    });
    expect(bodyOf(postPlanCalls()[0]).plannedDate).toBe(FUTURE_DAY);
    // Not one write to the log: no `/api/meal-logs`, no `/api/meals/{id}/log`.
    expect(postLogCalls().length).toBe(0);
    // So the day's LOGGED totals — the ones GET /api/meal-logs answers with —
    // are still empty after planning. (The ring itself previews PLANNED totals
    // on a future day, which is the web's own behaviour:
    // `totalConsumedCalories = viewingFuture ? plannedTotals.calories :
    // dailyTotals.calories + quickAddCalories`. Parity, not leakage — the
    // today case above is where a leak would have shown.)
    const dayAfterPlanning = (await mockApiFetch(
      `/api/meal-logs?date=${FUTURE_DAY}&tz=0`,
      null,
    )) as { logs: unknown[]; dailyTotals: { calories: number } };
    expect(dayAfterPlanning.logs).toEqual([]);
    expect(dayAfterPlanning.dailyTotals.calories).toBe(0);

    // ── The web client and the API, by their own source.
    // `dailyTotals` — the only logged total either client renders — is produced
    // by GET /api/meal-logs, which never reads the MealPlan collection.
    const mealLogsRoute = readWeb("app", "api", "meal-logs", "route.ts");
    expect(mealLogsRoute).not.toMatch(/MealPlan/);
    // POST /api/meal-plans writes no log and records no streak activity.
    const mealPlansRoute = readWeb("app", "api", "meal-plans", "route.ts");
    expect(mealPlansRoute).not.toMatch(/import\s+MealLog/);
    expect(mealPlansRoute).not.toMatch(/MealLog\.(create|updateOne|findOne)/);
    expect(mealPlansRoute).not.toMatch(/recordStreakActivity/);
    // Promotion is the one path that turns a plan into logged food.
    const promoteRoute = readWeb(
      "app",
      "api",
      "meal-plans",
      "[id]",
      "promote",
      "route.ts",
    );
    expect(promoteRoute).toMatch(/import MealLog from '@\/models\/MealLog'/);
    expect(promoteRoute).toMatch(/recordStreakActivity/);
    // The GET keeps plan nutrition in its own `expectedTotals`, and only for
    // active plans (a promoted plan lives in the log now).
    expect(mealPlansRoute).toContain("expectedTotals: emptyNutrition()");
    expect(mealPlansRoute).toContain("if (p.status === 'active') {");
    // The web nutrition page: the ring's consumed value is `dailyTotals` +
    // quick adds, while plans ride along as a separate shadow.
    const webNutritionPage = readWeb("app", "dashboard", "nutrition", "page.tsx");
    expect(webNutritionPage).toContain(
      "calories: Math.round(data.dailyTotals?.calories ?? 0),",
    );
    expect(webNutritionPage).toContain("const totalConsumedCalories = viewingFuture");
    expect(webNutritionPage).toContain(": dailyTotals.calories + quickAddCalories");
    expect(webNutritionPage).toContain("plannedExtra={todayPlannedExtra?.calories}");
  });

  it("(id: e015c9f9) Repeat every day for a week posts the web planner's exact body and expands to the web's series", async () => {
    const onPlanned = jest.fn();
    mockApiFetch.mockReset();
    // The series answer the route sends for `repeat` (route.ts:234-242).
    mockApiFetch.mockResolvedValue({
      seriesId: "6ac1d7b2947b0354e5cecfeb",
      created: 7,
      merged: 0,
      replaced: 0,
      conflicts: [],
      plans: [],
    });

    const { getByTestId } = render(
      <PlanFoodSheet
        visible
        food={OATS}
        plannedDate={THURSDAY}
        tag="lunch"
        onClose={() => {}}
        onPlanned={onPlanned}
        apiFetch={mockApiFetch as never}
      />,
    );
    await waitFor(() => {
      expect(
        getByTestId("plan-food-submit").props.accessibilityState?.disabled,
      ).toBe(false);
    });

    fireEvent.press(getByTestId("plan-repeat-toggle"));
    fireEvent.press(getByTestId("plan-repeat-every-day"));
    fireEvent.changeText(getByTestId("plan-repeat-count"), "7");
    // The CTA counts the series, like the web's `Plan <Tag> ×N`.
    expect(getByTestId("plan-food-submit-label").props.children).toBe(
      "Plan Lunch ×7",
    );
    await act(async () => {
      fireEvent.press(getByTestId("plan-food-submit"));
    });
    await waitFor(() => {
      expect(onPlanned).toHaveBeenCalled();
    });

    expect(mockApiFetch).toHaveBeenCalledTimes(1);
    const [path0, , init] = mockApiFetch.mock.calls[0] as [
      string,
      unknown,
      { method?: string; body?: Record<string, unknown> },
    ];
    expect(path0).toBe("/api/meal-plans");
    expect(init.method).toBe("POST");
    const body = init.body ?? {};

    // 1. The web planner's body, key for key: `{ plannedDate, tag, items }`
    //    plus `repeat` when a recurrence was chosen, and nothing else — no
    //    `mode` (`webapp/app/dashboard/timeline/page.tsx:772-781`).
    const webTimelinePage = readWeb("app", "dashboard", "timeline", "page.tsx");
    expect(webTimelinePage).toContain(
      "const body: Record<string, unknown> = { plannedDate, tag: useTag, items: [item] }",
    );
    expect(webTimelinePage).toContain("if (planOptions?.repeat) body.repeat = planOptions.repeat");
    expect(Object.keys(body).sort()).toEqual([
      "items",
      "plannedDate",
      "repeat",
      "tag",
    ]);
    expect(body.plannedDate).toBe(THURSDAY);
    expect(body.tag).toBe("lunch");
    expect(body.repeat).toEqual({ every: "day", count: 7 });

    // 2. The item carries the web planner's fields and no others.
    const WEB_PLAN_ITEM_KEYS = [
      "foodId",
      "variantId",
      "variantName",
      "name",
      "brand",
      "servingSize",
      "servingUnit",
      "servings",
      "nutrition",
      "servingLabel",
      "loggedQuantity",
      "loggedUnit",
      "loggedGramsPerServing",
      "loggedMlPerServing",
    ];
    for (const key of WEB_PLAN_ITEM_KEYS) {
      expect(webTimelinePage).toContain(`${key}:`);
    }
    const items = body.items as Record<string, unknown>[];
    expect(items).toHaveLength(1);
    for (const key of Object.keys(items[0] ?? {})) {
      expect(WEB_PLAN_ITEM_KEYS).toContain(key);
    }
    expect(items[0]).toMatchObject({
      name: "Rolled Oats",
      servingUnit: "g",
      servings: 1,
    });

    // 3. The series that body creates: the route steps the key by 1 day (7 for
    //    a weekly repeat) `count` times under ONE seriesId. Expanded with the
    //    WEB's own `addDaysToKey`, that is the seven consecutive days from
    //    Thursday.
    const mealPlansRoute = readWeb("app", "api", "meal-plans", "route.ts");
    expect(mealPlansRoute).toContain("const step = repeat.every === 'day' ? 1 : 7");
    expect(mealPlansRoute).toContain(
      "const key = addDaysToKey(plannedDate, i * step)",
    );
    expect(mealPlansRoute).toContain(
      "const seriesId = new mongoose.Types.ObjectId()",
    );
    const repeat = body.repeat as { every: "day" | "week"; count: number };
    const step = repeat.every === "day" ? 1 : 7;
    const seriesKeys = Array.from({ length: repeat.count }, (_, i) =>
      webAddDaysToKey(THURSDAY, i * step),
    );
    expect(seriesKeys).toHaveLength(7);
    expect(seriesKeys[0]).toBe(THURSDAY);
    expect(new Set(seriesKeys).size).toBe(7);
    for (let i = 1; i < seriesKeys.length; i += 1) {
      expect(seriesKeys[i]).toBe(webAddDaysToKey(seriesKeys[i - 1] as string, 1));
    }

    // 4. The same clamps the route enforces, and the web's own toast wording.
    expect(mealPlansRoute).toContain("const max = every === 'day' ? 30 : 52");
    expect(MAX_REPEAT_COUNT_BY_DAY).toBe(30);
    expect(MAX_REPEAT_COUNT_BY_WEEK).toBe(52);
    expect(clampRepeat({ every: "day", count: 99 })).toEqual({
      every: "day",
      count: 30,
    });
    expect(clampRepeat({ every: "week", count: 99 })).toEqual({
      every: "week",
      count: 52,
    });
    expect(webTimelinePage).toContain(
      "plans created (${parts.join(', ')})",
    );
    const parts = ["7 new"];
    expect(onPlanned).toHaveBeenCalledWith(
      `7 Lunch plans created (${parts.join(", ")})`,
    );
  });
});
