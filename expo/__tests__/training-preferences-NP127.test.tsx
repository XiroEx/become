/* eslint-disable import/first */
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";

const mockToken = "test-jwt";
const mockRefresh = jest.fn(async () => {});
jest.mock("@/lib/auth/useAuth", () => ({
  useAuth: () => ({
    user: { _id: "u1", email: "jon@example.com" },
    token: mockToken,
    loading: false,
    isAuthed: true,
    setToken: jest.fn(),
    refresh: mockRefresh,
    logout: jest.fn(),
  }),
}));

jest.mock("@become/api-client", () => {
  const actual = jest.requireActual("@become/api-client");
  return { __esModule: true, ...actual, apiFetch: jest.fn() };
});

import { apiFetch } from "@become/api-client";
import { clearAll } from "@/lib/cache/lastKnown";
import { TrainingPreferencesScreen } from "@/components/settings/TrainingPreferences";
import {
  MAX_FITNESS_GOALS,
  buildTrainingProfilePatch,
  clampWeeklyAvailability,
  toggleFitnessGoals,
} from "@/lib/settings/trainingPreferences";
/* eslint-enable import/first */

const mockApiFetch = apiFetch as unknown as jest.Mock;

function callsByMethod(prefix: string, method: string): unknown[][] {
  return mockApiFetch.mock.calls.filter(
    (c) =>
      String(c[0]).startsWith(prefix) &&
      ((c[2] as { method?: string } | undefined)?.method ?? "GET") === method,
  );
}

let mockProfileData: Record<string, unknown>;

describe("Training preferences pure rules (NP-127)", () => {
  it("MAX_FITNESS_GOALS is 3, matching the web", () => {
    expect(MAX_FITNESS_GOALS).toBe(3);
  });

  it("toggleFitnessGoals keeps order, removes on re-tap, and swaps the last pick at the cap", () => {
    expect(toggleFitnessGoals([], "lose_weight")).toEqual(["lose_weight"]);
    expect(
      toggleFitnessGoals(["lose_weight", "gain_muscle"], "lose_weight"),
    ).toEqual(["gain_muscle"]);
    // At the cap the fourth pick swaps out the least important one.
    expect(
      toggleFitnessGoals(
        ["lose_weight", "gain_muscle", "maintain"],
        "general_health",
      ),
    ).toEqual(["lose_weight", "gain_muscle", "general_health"]);
  });

  it("clampWeeklyAvailability holds the web's 1–7 stepper bounds", () => {
    expect(clampWeeklyAvailability(0)).toBe(1);
    expect(clampWeeklyAvailability(8)).toBe(7);
    expect(clampWeeklyAvailability(4)).toBe(4);
  });

  it("buildTrainingProfilePatch mirrors the primary as fitnessGoal", () => {
    const patch = buildTrainingProfilePatch({
      fitnessGoals: ["gain_muscle", "lose_weight"],
      experienceLevel: "intermediate",
      weeklyAvailability: 4,
      equipmentAccess: ["dumbbells"],
      injuryNotes: "Bad left knee",
    });
    expect(patch.fitnessGoal).toBe("gain_muscle");
    expect(patch.fitnessGoals).toEqual(["gain_muscle", "lose_weight"]);
    expect(patch.experienceLevel).toBe("intermediate");
    expect(patch.weeklyAvailability).toBe(4);
    expect(patch.equipmentAccess).toEqual(["dumbbells"]);
    expect(patch.injuryNotes).toBe("Bad left knee");
    // NP-302: the Training tab no longer sends planPromoteMode — that
    // choice moved to Settings > Settings (NutritionPlanningSection).
    expect(patch.planPromoteMode).toBeUndefined();
  });

  it("buildTrainingProfilePatch still carries planPromoteMode when a caller supplies it", () => {
    const patch = buildTrainingProfilePatch({
      fitnessGoals: [],
      weeklyAvailability: 3,
      equipmentAccess: [],
      injuryNotes: "",
      planPromoteMode: "auto",
    });
    expect(patch.planPromoteMode).toBe("auto");
  });
});

describe("Training preferences screen (NP-127)", () => {
  beforeEach(async () => {
    await clearAll();
    mockApiFetch.mockReset();
    mockRefresh.mockClear();
    mockProfileData = {
      name: "Jon Runner",
      email: "jon@example.com",
      onboardingCompleted: true,
      profile: {
        fitnessGoal: "lose_weight",
        fitnessGoals: ["lose_weight", "gain_muscle"],
        experienceLevel: "beginner",
        weeklyAvailability: 3,
        equipmentAccess: ["dumbbells"],
        injuryNotes: "Bad left knee",
        // NP-302: still present on the profile (the Settings tab owns it
        // now), kept here to prove the Training tab no longer reads or
        // writes it.
        planPromoteMode: "manual",
      },
    };
    mockApiFetch.mockImplementation((url: string, _s: unknown, init?: { method?: string; body?: unknown }) => {
      const method = init?.method ?? "GET";
      const cleanPath = String(url).split("?")[0];
      if (cleanPath === "/api/profile" && method === "GET") {
        return Promise.resolve(mockProfileData);
      }
      if (cleanPath === "/api/profile" && method === "PATCH") {
        const body = init?.body as { profile?: Record<string, unknown> };
        if (body?.profile) {
          mockProfileData.profile = {
            ...(mockProfileData.profile as object),
            ...body.profile,
          };
        }
        return Promise.resolve(mockProfileData);
      }
      return Promise.resolve({});
    });
  });

  it("(id: e015c98d) every Training-tab field seeds from GET /api/profile and PATCHes back through the same route, and never touches planPromoteMode", async () => {
    const { getByTestId } = render(<TrainingPreferencesScreen />);

    // The Training tab is its own self-contained screen (Settings >
    // Training, NP-302).
    await waitFor(() => {
      expect(getByTestId("training-preferences-route")).toBeTruthy();
    });

    // Seeded from the profile: goals, experience, schedule, equipment and
    // injury notes. No promotion-choice control lives here any more.
    await waitFor(() => {
      expect(
        getByTestId("training-preferences-goal-lose_weight").props
          .accessibilityState?.checked,
      ).toBe(true);
      expect(
        getByTestId("training-preferences-experience-beginner").props
          .accessibilityState?.selected,
      ).toBe(true);
      expect(getByTestId("training-preferences-weekly-value").props.children).toBe(3);
      expect(
        getByTestId("training-preferences-equipment-dumbbells").props
          .accessibilityState?.checked,
      ).toBe(true);
      expect(getByTestId("training-preferences-injury-notes").props.value).toBe(
        "Bad left knee",
      );
    });
    expect(() => getByTestId("training-preferences-promote-manual")).toThrow();
    expect(() => getByTestId("training-preferences-promote-auto")).toThrow();

    // Change every remaining field: swap primary goal, experience,
    // schedule, equipment and injury notes.
    fireEvent.press(getByTestId("training-preferences-goal-maintain"));
    fireEvent.press(getByTestId("training-preferences-experience-advanced"));
    fireEvent.press(getByTestId("training-preferences-weekly-increase"));
    fireEvent.press(getByTestId("training-preferences-equipment-barbell"));
    fireEvent.changeText(
      getByTestId("training-preferences-injury-notes"),
      "Shoulder impingement",
    );

    await act(async () => {
      fireEvent.press(getByTestId("training-preferences-save"));
    });

    await waitFor(() => {
      expect(callsByMethod("/api/profile", "PATCH").length).toBeGreaterThan(0);
    });

    const patchBody = (
      callsByMethod("/api/profile", "PATCH")[0]![2] as {
        body: { profile: Record<string, unknown> };
      }
    ).body;
    // Ordered goals with the primary mirrored, exactly the web's keys.
    expect(patchBody.profile.fitnessGoals).toEqual([
      "lose_weight",
      "gain_muscle",
      "maintain",
    ]);
    expect(patchBody.profile.fitnessGoal).toBe("lose_weight");
    expect(patchBody.profile.experienceLevel).toBe("advanced");
    expect(patchBody.profile.weeklyAvailability).toBe(4);
    expect(patchBody.profile.equipmentAccess).toEqual([
      "dumbbells",
      "barbell",
    ]);
    expect(patchBody.profile.injuryNotes).toBe("Shoulder impingement");
    // NP-302: the Training tab's save never sends planPromoteMode, and the
    // profile's existing value survives untouched (merged by the mock,
    // exactly like the real PATCH route merges partial profile updates).
    expect(patchBody.profile.planPromoteMode).toBeUndefined();
    expect(
      (mockProfileData.profile as Record<string, unknown>).planPromoteMode,
    ).toBe("manual");

    // Reads back identically on the web: the mock store now holds the PATCH.
    const stored = mockProfileData.profile as Record<string, unknown>;
    expect(stored.fitnessGoals).toEqual([
      "lose_weight",
      "gain_muscle",
      "maintain",
    ]);
    expect(stored.fitnessGoal).toBe("lose_weight");
    expect(stored.experienceLevel).toBe("advanced");
    expect(stored.weeklyAvailability).toBe(4);
    expect(stored.equipmentAccess).toEqual(["dumbbells", "barbell"]);
    expect(stored.injuryNotes).toBe("Shoulder impingement");
  });

  it("(id: e015c98e) a fourth fitness goal cannot be added — it swaps the last pick, as on the web", async () => {
    const { getByTestId } = render(<TrainingPreferencesScreen />);

    await waitFor(() => {
      expect(getByTestId("training-preferences-route")).toBeTruthy();
    });
    await waitFor(() => {
      expect(
        getByTestId("training-preferences-goal-lose_weight").props
          .accessibilityState?.checked,
      ).toBe(true);
    });

    // Two goals stored; add a third, then a fourth.
    fireEvent.press(getByTestId("training-preferences-goal-maintain"));
    fireEvent.press(getByTestId("training-preferences-goal-general_health"));

    // Still three: the fourth swapped out the least important pick.
    await waitFor(() => {
      expect(
        getByTestId("training-preferences-goal-lose_weight").props
          .accessibilityState?.checked,
      ).toBe(true);
      expect(
        getByTestId("training-preferences-goal-gain_muscle").props
          .accessibilityState?.checked,
      ).toBe(true);
      expect(
        getByTestId("training-preferences-goal-maintain").props
          .accessibilityState?.checked,
      ).toBe(false);
      expect(
        getByTestId("training-preferences-goal-general_health").props
          .accessibilityState?.checked,
      ).toBe(true);
    });

    await act(async () => {
      fireEvent.press(getByTestId("training-preferences-save"));
    });

    await waitFor(() => {
      expect(callsByMethod("/api/profile", "PATCH").length).toBeGreaterThan(0);
    });
    const patchBody = (
      callsByMethod("/api/profile", "PATCH")[0]![2] as {
        body: { profile: Record<string, unknown> };
      }
    ).body;
    expect(
      (patchBody.profile.fitnessGoals as unknown[]).length,
    ).toBeLessThanOrEqual(3);
    expect(patchBody.profile.fitnessGoals).toEqual([
      "lose_weight",
      "gain_muscle",
      "general_health",
    ]);
  });

  it("embedded (Settings > Training): no SafeAreaView chrome, no 'Training' title, no planPromoteMode UI", async () => {
    const { getByTestId, queryByText } = render(
      <TrainingPreferencesScreen embedded />,
    );
    await waitFor(() => {
      expect(getByTestId("training-preferences-route")).toBeTruthy();
    });
    expect(queryByText("Training")).toBeNull();
    expect(queryByText("Nutrition Planning")).toBeNull();
  });
});
