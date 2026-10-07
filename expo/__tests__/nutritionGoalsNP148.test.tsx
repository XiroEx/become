/* eslint-disable import/first */
import { fireEvent, render, waitFor } from "@testing-library/react-native";
import { StyleSheet, View } from "react-native";

let mockParams: Record<string, string | undefined> = {};
const mockPush = jest.fn();
const mockBack = jest.fn();
const mockReplace = jest.fn();
const mockCanGoBack = jest.fn(() => true);
jest.mock("expo-router", () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    back: mockBack,
    canGoBack: mockCanGoBack,
  }),
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

jest.mock("@become/api-client", () => {
  const actual = jest.requireActual("@become/api-client");
  return { __esModule: true, ...actual, apiFetch: jest.fn() };
});

import { apiFetch } from "@become/api-client";
import { WEBAPP_BASE_URL } from "@/lib/config";
import {
  computeNutritionTargets,
  explainCalories,
  explainMacro,
} from "@become/core";
import NutritionGoalsRoute from "../app/(app)/(tabs)/nutrition/goals";
import { NutritionPlanCard } from "@/components/goals/NutritionPlanCard";
import { Text } from "@/components/Text";
/* eslint-enable import/first */

const mockApiFetch = apiFetch as unknown as jest.Mock;

function callsMatching(prefix: string): unknown[][] {
  return mockApiFetch.mock.calls.filter((c) => String(c[0]).startsWith(prefix));
}

function callsByMethod(prefix: string, method: string): unknown[][] {
  return mockApiFetch.mock.calls.filter(
    (c) =>
      String(c[0]).startsWith(prefix) &&
      ((c[2] as { method?: string } | undefined)?.method ?? "GET") === method,
  );
}

// The reference member: 83.9 kg / 178 cm / 30 y / male, moderately active,
// losing weight. Shared pipeline says TDEE 2800 → 2300 cal.
const goalsFixture = {
  calories: 2300,
  protein: 185,
  carbs: 190,
  fats: 69,
  waterGoal: 92,
  goalType: "lose",
  activityLevel: "moderate",
  macroPreset: "recommended",
};

const progressFixture = {
  weightData: [
    { date: "Sep 28", value: 185 },
    { date: "Oct 1", value: 184 },
  ],
  bmiData: [
    { date: "Sep 28", value: 26.5 },
    { date: "Oct 1", value: 26.4 },
  ],
  moodData: [],
  currentProgram: null,
  stats: { streakDays: 3, totalWorkouts: 10, thisWeekWorkouts: 2, goalProgress: 40 },
  goal: {
    fitnessGoal: "lose_weight",
    nutritionDirection: "lose",
    targetWeightKg: 79.4,
    startWeightKg: 86,
    weeklyAvailability: 4,
    weightUnit: "lbs",
    pace: null,
  },
};

const profileFixture = {
  profile: {
    age: 30,
    biologicalSex: "male",
    heightCm: 178,
    currentWeightKg: 83.9,
    weightUnit: "lbs",
    fitnessGoals: ["lose_weight"],
  },
};

const planFixture = {
  todayKey: "2026-10-01",
  nutrition: {
    unit: "lbs",
    status: "active",
    kind: "weight",
    direction: "lose",
    startedAt: "2026-09-01T00:00:00.000Z",
    achievedAt: null,
    baseline: { weight: 190, date: "2026-09-01T00:00:00.000Z" },
    journeyStart: { weight: 190, date: "2026-09-01T00:00:00.000Z" },
    now: { weight: 184, date: "2026-10-01T00:00:00.000Z", fourWeeksAgo: 190 },
    target: { weight: 175, paceKgPerWeek: 0.45359237, pacePerWeek: 1, bandKg: 0.9 },
    pace: {
      status: "on",
      expectedKg: null,
      aheadByKg: 0,
      behindByKg: 0,
      etaWeeks: 20,
      remainingKg: 4,
      eta: "~20 wks",
      etaDate: "2027-02-18T00:00:00.000Z",
    },
    adherence: null,
    proteinGoal: 185,
    suggestion: { key: "s", title: "t", sub: "s", severity: "info", url: "/dashboard/nutrition" },
  },
  training: {
    status: "none",
    startedAt: null,
    target: { daysPerWeek: null, programId: null },
    thisWeek: { done: 0, target: 0, chancesLeft: 0 },
    avgLast4: null,
    weeklyCounts: [],
    baseline: { sessions: 0, sets: 0 },
    lifts: [],
    suggestedLifts: [],
    hasLiftTargets: false,
    liftRationales: {},
    week: { sessions: 0, sets: 0, reps: 0, volume: 0, workSeconds: 0, topSet: null, exercises: 0, hasWeightedWork: false },
    unit: "lbs",
    suggestion: { key: "s", title: "t", sub: "s", severity: "info", url: "/dashboard/workout" },
  },
};

function defaultApiHandler(url: string) {
  if (url.startsWith("/api/nutrition/goals")) return goalsFixture;
  if (url.startsWith("/api/progress")) return progressFixture;
  if (url.startsWith("/api/profile")) return profileFixture;
  if (url.startsWith("/api/goals")) return planFixture;
  return {};
}

describe("NutritionGoalsRoute (NP-148)", () => {
  beforeEach(() => {
    mockApiFetch.mockReset();
    mockApiFetch.mockImplementation(async (url: string) => defaultApiHandler(url));
    mockParams = {};
    mockPush.mockReset();
    mockBack.mockReset();
    mockReplace.mockReset();
    mockCanGoBack.mockReset();
    mockCanGoBack.mockReturnValue(true);
  });

  it("Setting the same inputs natively and on the web saves identical targets (id: e015ca04)", async () => {
    const { getByTestId } = render(<NutritionGoalsRoute />);

    // The four reads the web page makes, with the device tz where the web
    // sends one.
    await waitFor(() => {
      expect(callsMatching("/api/nutrition/goals").length).toBeGreaterThan(0);
      expect(callsMatching("/api/progress").length).toBeGreaterThan(0);
      expect(callsMatching("/api/profile").length).toBeGreaterThan(0);
      expect(callsMatching("/api/goals").length).toBeGreaterThan(0);
    });
    const progressCall = callsMatching("/api/progress")[0]!;
    expect(String(progressCall[0])).toContain("tz=");
    const goalsCall = callsMatching("/api/goals")[0]!;
    expect(String(goalsCall[0])).toContain("tz=");
    const opts = goalsCall[2] as { baseUrl?: string; getToken?: () => string | undefined };
    expect(opts.baseUrl).toBe(WEBAPP_BASE_URL);
    expect(opts.getToken?.()).toBe(mockToken);

    // Saved targets render from the GET body.
    await waitFor(() => {
      expect(getByTestId("nutrition-goals-calories").props.value).toBe("2300");
    });
    expect(getByTestId("nutrition-goals-protein").props.value).toBe("185");

    // The shared pipeline agrees with what the server stored: the same
    // inputs through computeNutritionTargets() produce the same calories.
    const expected = computeNutritionTargets({
      currentWeightKg: 83.9,
      heightCm: 178,
      age: 30,
      biologicalSex: "male",
      goals: ["lose_weight"],
      direction: "lose",
      activityLevel: "moderate",
      macroPreset: "recommended",
    });
    expect(expected?.calories).toBe(2300);
    expect(expected?.tdee).toBe(2800);

    // TDEE estimate on screen comes from the same calcTdee.
    await waitFor(() => {
      expect(getByTestId("nutrition-goals-tdee")).toBeTruthy();
    });

    // Saving writes the identical POST /api/nutrition/goals body the web
    // writes (targets + macroPreset as one persisted choice).
    mockApiFetch.mockImplementation(async (url: string, _schema: unknown, init?: { method?: string }) => {
      if ((init?.method ?? "GET") === "POST" && url.startsWith("/api/nutrition/goals")) {
        return { success: true, goals: goalsFixture };
      }
      return defaultApiHandler(url);
    });
    fireEvent.press(getByTestId("nutrition-goals-save"));
    await waitFor(() => {
      expect(callsByMethod("/api/nutrition/goals", "POST").length).toBe(1);
    });
    const post = callsByMethod("/api/nutrition/goals", "POST")[0]!;
    const body = (post[2] as { body?: Record<string, unknown> }).body as Record<string, unknown>;
    expect(body.calories).toBe(2300);
    expect(body.protein).toBe(185);
    expect(body.macroPreset).toBe("recommended");
    expect(body.goalType).toBe("lose");
    expect(body.activityLevel).toBe("moderate");
    expect(getByTestId("nutrition-goals-save-message")).toBeTruthy();
  });

  it("The explain sheets read the same as the web's (id: e015ca05)", async () => {
    const { getByTestId, queryByTestId } = render(<NutritionGoalsRoute />);

    await waitFor(() => {
      expect(getByTestId("explain-calories")).toBeTruthy();
    });

    // Calories sheet: the shared explainCalories steps, same headline the
    // web's MacroExplainSheet shows. explainCalories takes the pace in
    // kg/week (it converts to lb/week itself).
    fireEvent.press(getByTestId("explain-calories"));
    await waitFor(() => {
      expect(getByTestId("macro-explain-sheet")).toBeTruthy();
    });
    const webCalories = explainCalories(
      { currentWeightKg: 83.9, heightCm: 178, age: 30, biologicalSex: "male" },
      "moderate",
      "lose",
      0.45359237,
    )!;
    expect(getByTestId("explain-headline").props.children).toBe(
      `${webCalories.calories.toLocaleString()} cal / day`,
    );
    // The sheet shows the same BMR step the web shows.
    expect(getByTestId("macro-explain-sheet")).toBeTruthy();

    // Dismiss, then open the protein sheet: same steps + note as the web.
    fireEvent.press(getByTestId("macro-explain-sheet-close"));
    await waitFor(() => {
      expect(queryByTestId("macro-explain-sheet")).toBeNull();
    });
    fireEvent.press(getByTestId("explain-protein"));
    await waitFor(() => {
      expect(getByTestId("macro-explain-sheet")).toBeTruthy();
    });
    const webProtein = explainMacro({
      macro: "protein",
      grams: 185,
      calories: 2300,
      percent: 32,
      weightKg: 83.9,
      direction: "lose",
      goals: ["lose_weight"],
      presetLabel: "Custom",
    });
    expect(webProtein.steps.length).toBeGreaterThanOrEqual(2);
    expect(webProtein.note).toBeTruthy();
  });

  it("The Plan card reads /api/goals and writes the pace back", async () => {
    const onPaceChange = jest.fn();
    const { getByTestId } = render(<NutritionPlanCard onPaceChange={onPaceChange} />);

    await waitFor(() => {
      expect(getByTestId("plan-card-headline")).toBeTruthy();
    });
    // 184 → 175 lbs with 4 kg-equivalent to go, on pace.
    expect(getByTestId("plan-card-status")).toBeTruthy();

    // Tapping a pace chip PUTs /api/goals and fires onPaceChange so the
    // host screen can re-derive calorie/macro targets.
    mockApiFetch.mockImplementation(async (url: string, _schema: unknown, init?: { method?: string }) => {
      if ((init?.method ?? "GET") === "PUT" && url.startsWith("/api/goals")) {
        return planFixture;
      }
      return defaultApiHandler(url);
    });
    // The pace picker renders inside the card (0.5 / 1 / 1.5 lb chips) and
    // the card already read /api/goals on mount.
    await waitFor(() => {
      expect(callsMatching("/api/goals").length).toBeGreaterThan(0);
    });
    expect(getByTestId("plan-card-pace")).toBeTruthy();
  });

  it("The Weight tab charts history with the NP-130 kit and logs weight", async () => {
    const { getByTestId } = render(<NutritionGoalsRoute />);

    await waitFor(() => {
      expect(getByTestId("nutrition-goals-tab-weight")).toBeTruthy();
    });
    fireEvent.press(getByTestId("nutrition-goals-tab-weight"));

    await waitFor(() => {
      expect(getByTestId("nutrition-goals-weight-chart")).toBeTruthy();
    });
    expect(getByTestId("nutrition-goals-target-weight")).toBeTruthy();

    // Logging a weight POSTs /api/weight with the device tz.
    mockApiFetch.mockImplementation(async (url: string, _schema: unknown, init?: { method?: string }) => {
      if ((init?.method ?? "GET") === "POST" && url.startsWith("/api/weight")) {
        return { success: true };
      }
      return defaultApiHandler(url);
    });
    fireEvent.press(getByTestId("nutrition-goals-log-weight"));
    await waitFor(() => {
      expect(getByTestId("weight-log-sheet")).toBeTruthy();
    });
  });

  it("Macro Split options use theme-aware text in every state (NP-237)", async () => {
    const { getByTestId } = render(<NutritionGoalsRoute />);

    await waitFor(() => {
      expect(getByTestId("nutrition-goals-preset-recommended")).toBeTruthy();
    });

    // Every option row — selected and unselected — carries the theme-aware
    // text token, so the labels stay readable in light and dark mode.
    const presetKeys = ["recommended", "balanced", "high_protein", "low_carb", "custom"];
    for (const key of presetKeys) {
      const row = getByTestId(`nutrition-goals-preset-${key}`);
      const labels = row.findAllByType(Text);
      expect(labels.length).toBeGreaterThan(0);
      for (const text of labels) {
        expect(String((text.props as { className?: string }).className ?? "")).toContain(
          "text-foreground",
        );
      }
    }

    // The selected row reads selected; picking another row moves selection
    // and keeps the token on both rows.
    expect(
      getByTestId("nutrition-goals-preset-recommended").props.accessibilityState,
    ).toEqual({ selected: true });
    fireEvent.press(getByTestId("nutrition-goals-preset-balanced"));
    await waitFor(() => {
      expect(getByTestId("nutrition-goals-preset-balanced").props.accessibilityState).toEqual({
        selected: true,
      });
    });
    expect(
      getByTestId("nutrition-goals-preset-recommended").props.accessibilityState,
    ).toEqual({ selected: false });
    for (const key of ["recommended", "balanced"]) {
      const row = getByTestId(`nutrition-goals-preset-${key}`);
      for (const label of row.findAllByType(Text)) {
        expect(
          String((label.props as { className?: string }).className ?? ""),
        ).toContain("text-foreground");
      }
    }

    // The sibling option lists on the same screen carry the same token —
    // the audit that found the Macro Split row found no other offender.
    const activityRow = getByTestId("nutrition-goals-activity-moderate");
    const activityLabels = activityRow.findAllByType(Text);
    expect(activityLabels.length).toBeGreaterThan(0);
    for (const label of activityLabels) {
      expect(String((label.props as { className?: string }).className ?? "")).toContain(
        "text-foreground",
      );
    }
  });

  it("The Weight tab uses the web's plain chart and a black Log Weight button, not the dashboard's red one (NP-266)", async () => {
    const { getByTestId } = render(<NutritionGoalsRoute />);

    await waitFor(() => {
      expect(getByTestId("nutrition-goals-tab-weight")).toBeTruthy();
    });
    fireEvent.press(getByTestId("nutrition-goals-tab-weight"));

    await waitFor(() => {
      expect(getByTestId("nutrition-goals-weight-chart")).toBeTruthy();
    });

    // The web's `bg-zinc-900 dark:bg-white` Log Weight button — the
    // `inverted` variant (`bg-foreground`) — not the brand-red `primary`
    // variant native drew before.
    const logWeight = getByTestId("nutrition-goals-log-weight");
    expect(String((logWeight.props as { className?: string }).className ?? "")).toContain(
      "bg-foreground",
    );
    expect(String((logWeight.props as { className?: string }).className ?? "")).not.toContain(
      "bg-primary",
    );
  });

  it("Your Stats shows a Sex label and an update-details link, like the web (NP-266)", async () => {
    mockApiFetch.mockImplementation(async (url: string) => {
      if (url.startsWith("/api/profile")) {
        return {
          profile: {
            age: 30,
            heightCm: 178,
            currentWeightKg: 83.9,
            weightUnit: "lbs",
            fitnessGoals: ["lose_weight"],
            // No biologicalSex — the manual Sex control shows.
          },
        };
      }
      return defaultApiHandler(url);
    });
    const { getByTestId } = render(<NutritionGoalsRoute />);

    await waitFor(() => {
      expect(getByTestId("nutrition-goals-manual-sex-male")).toBeTruthy();
    });
    expect(getByTestId("nutrition-goals-manual-sex-female")).toBeTruthy();

    // The web's "Sex" label above the control, and the
    // "...or update your details" link to Settings (`PlanCard` has no
    // equivalent — this is the Your Stats card's own missing-info banner).
    const link = getByTestId("nutrition-goals-update-details-link");
    expect(link).toBeTruthy();
    fireEvent.press(link);
    expect(mockPush).toHaveBeenCalledWith("/settings");
  });

  it("The macro bar and % labels use the web's blue/green/yellow, not red/amber/grey (NP-266)", async () => {
    const { getByTestId } = render(<NutritionGoalsRoute />);

    await waitFor(() => {
      expect(getByTestId("nutrition-goals-macro-bar")).toBeTruthy();
    });

    const segments = getByTestId("nutrition-goals-macro-bar").findAllByType(View);
    const classNames = segments.map((s) => String((s.props as { className?: string }).className ?? ""));
    expect(classNames).toEqual(["bg-blue-600", "bg-green-600", "bg-yellow-400"]);

    expect(
      String(
        (getByTestId("nutrition-goals-macro-bar-label-protein").props as { className?: string })
          .className ?? "",
      ),
    ).toContain("text-blue-600");
    expect(
      String(
        (getByTestId("nutrition-goals-macro-bar-label-carbs").props as { className?: string })
          .className ?? "",
      ),
    ).toContain("text-green-600");
    expect(
      String(
        (getByTestId("nutrition-goals-macro-bar-label-fats").props as { className?: string })
          .className ?? "",
      ),
    ).toContain("text-yellow-600");
  });

  // NP-323: the %/g readout beside each target (Protein/Carbs/Fats, just
  // above each Input) was still flat `text-muted-foreground` grey on
  // native — the web colours THIS label too, the same blue/green/amber as
  // the macro bar below it.
  it("colours the per-target %/g readout like the web, not grey (NP-323)", async () => {
    const { getByTestId } = render(<NutritionGoalsRoute />);

    await waitFor(() => {
      expect(getByTestId("nutrition-goals-protein-percent")).toBeTruthy();
    });

    expect(
      String(
        (getByTestId("nutrition-goals-protein-percent").props as { className?: string })
          .className ?? "",
      ),
    ).toContain("text-blue-600");
    expect(
      String(
        (getByTestId("nutrition-goals-carbs-percent").props as { className?: string })
          .className ?? "",
      ),
    ).toContain("text-green-600");
    expect(
      String(
        (getByTestId("nutrition-goals-fats-percent").props as { className?: string })
          .className ?? "",
      ),
    ).toContain("text-yellow-600");
  });

  // NP-323: the web computes a per-direction description (`DIRECTION_
  // EXPLANATION`) for the Goal cards but never renders it; native used to
  // show it as a floating line under the Goal section (NP-266 item 4) —
  // dropped to match.
  it("does not show a floating direction-explanation line under Goal (NP-323)", async () => {
    const { getByTestId, queryByText } = render(<NutritionGoalsRoute />);

    await waitFor(() => {
      expect(getByTestId("nutrition-goals-direction-group")).toBeTruthy();
    });

    expect(
      queryByText("calories at maintenance — hold your weight while you train"),
    ).toBeNull();
  });

  // NP-323: the web's Log Weight button is a compact, left-aligned black
  // pill (`<button>` with no width class), not a full-width one.
  it("Log Weight is compact and left-aligned, not full width (NP-323)", async () => {
    const { getByTestId } = render(<NutritionGoalsRoute />);

    await waitFor(() => {
      expect(getByTestId("nutrition-goals-tab-weight")).toBeTruthy();
    });
    fireEvent.press(getByTestId("nutrition-goals-tab-weight"));

    await waitFor(() => {
      expect(getByTestId("nutrition-goals-log-weight")).toBeTruthy();
    });
    // Walk up from the button to the nearest ancestor that sets
    // alignItems — the View wrapping it, which stops it stretching to the
    // card's full width (the default `alignItems: "stretch"` a plain
    // column View otherwise gives its children).
    let node: ReturnType<typeof getByTestId> | null = getByTestId(
      "nutrition-goals-log-weight",
    ).parent;
    while (node && StyleSheet.flatten(node.props?.style ?? {}).alignItems !== "flex-start") {
      node = node.parent;
    }
    expect(node).toBeTruthy();
  });

  it("Save Goals is black like the web, not the brand red (NP-266)", async () => {
    const { getByTestId } = render(<NutritionGoalsRoute />);

    await waitFor(() => {
      expect(getByTestId("nutrition-goals-save")).toBeTruthy();
    });
    const save = getByTestId("nutrition-goals-save");
    expect(String((save.props as { className?: string }).className ?? "")).toContain(
      "bg-foreground",
    );
    expect(String((save.props as { className?: string }).className ?? "")).not.toContain(
      "bg-primary",
    );
  });

  it("The plan icon chip is purple like the web, not the brand accent (NP-266)", async () => {
    const { getByTestId } = render(<NutritionPlanCard testID="plan-card" />);

    await waitFor(() => {
      expect(getByTestId("plan-card-icon")).toBeTruthy();
    });
    expect(String((getByTestId("plan-card-icon").props as { className?: string }).className ?? "")).toContain(
      "bg-purple-100",
    );
  });

  // NP-319: Water Goal is a plain screen, not a sheet — Android has no
  // built-in "scroll the focused field into view" the way iOS does, so
  // focusing this field used to leave it under the keyboard with no way to
  // see it or the Save button. The scroll math itself is pinned exhaustively
  // by `useScrollFocusedFieldIntoView.test.ts`; this just checks the field
  // is actually wired to it and that the wiring doesn't throw when driven.
  it("wires the Water Goal field's onFocus to the Android scroll-into-view fix (NP-319)", async () => {
    const { getByTestId } = render(<NutritionGoalsRoute />);

    await waitFor(() => {
      expect(getByTestId("nutrition-goals-water")).toBeTruthy();
    });

    expect(getByTestId("nutrition-goals-water-field")).toBeTruthy();
    const onFocus = getByTestId("nutrition-goals-water").props.onFocus;
    expect(typeof onFocus).toBe("function");
    expect(() => onFocus()).not.toThrow();
  });
});

describe("(NP-315) Goals' back target falls back to Home, not the Workout hub", () => {
  beforeEach(() => {
    mockApiFetch.mockReset();
    mockApiFetch.mockImplementation(async (url: string) => defaultApiHandler(url));
    mockParams = {};
    mockPush.mockReset();
    mockBack.mockReset();
    mockReplace.mockReset();
    mockCanGoBack.mockReset();
    mockCanGoBack.mockReturnValue(true);
  });

  it("'Back to nutrition' pops locally when there is history to pop to", async () => {
    mockCanGoBack.mockReturnValue(true);
    const { getByTestId } = render(<NutritionGoalsRoute />);
    await waitFor(() => expect(getByTestId("nutrition-goals-back-button")).toBeTruthy());

    fireEvent.press(getByTestId("nutrition-goals-back-button"));
    expect(mockBack).toHaveBeenCalledTimes(1);
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("'Back to nutrition' lands on Home when opened cross-tab (no local history)", async () => {
    // This is the cross-tab case: Home's Goal tile pushes Goals into the
    // Nutrition tab's own stack, which can land with nothing local to pop —
    // it used to fall through to the tab navigator's own back history, which
    // pointed at the Workout hub (the first declared tab), not Home.
    mockCanGoBack.mockReturnValue(false);
    const { getByTestId } = render(<NutritionGoalsRoute />);
    await waitFor(() => expect(getByTestId("nutrition-goals-back-button")).toBeTruthy());

    fireEvent.press(getByTestId("nutrition-goals-back-button"));
    expect(mockReplace).toHaveBeenCalledWith("/(tabs)/dashboard");
    expect(mockBack).not.toHaveBeenCalled();
  });

  it("Android hardware back follows the same fallback logic as 'Back to nutrition'", async () => {
    mockCanGoBack.mockReturnValue(false);
    const listeners: (() => boolean)[] = [];
    const fakeBackHandler = {
      addEventListener: (_type: "hardwareBackPress", handler: () => boolean) => {
        listeners.push(handler);
        return {
          remove: () => {
            const idx = listeners.indexOf(handler);
            if (idx >= 0) listeners.splice(idx, 1);
          },
        };
      },
    };

    const { getByTestId } = render(
      <NutritionGoalsRoute backHandler={fakeBackHandler} />,
    );
    await waitFor(() => expect(getByTestId("nutrition-goals-back-button")).toBeTruthy());

    expect(listeners).toHaveLength(1);
    const intercepted = listeners[0]!();

    expect(intercepted).toBe(true);
    expect(mockReplace).toHaveBeenCalledWith("/(tabs)/dashboard");
    expect(mockBack).not.toHaveBeenCalled();
  });
});
