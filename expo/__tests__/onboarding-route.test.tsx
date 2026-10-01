/* eslint-disable import/first */
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";

const mockReplace = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ replace: mockReplace, push: jest.fn(), back: jest.fn() }),
}));

const mockRefresh = jest.fn(async () => {});
const mockToken = "test-jwt";
let mockCurrentUser = {
  _id: "u1",
  email: "jon@example.com",
  name: "jon",
  onboardingCompleted: false,
};

jest.mock("@/lib/auth/useAuth", () => ({
  useAuth: () => ({
    user: mockCurrentUser,
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
import { WEBAPP_BASE_URL } from "@/lib/config";
import OnboardingRoute from "../app/onboarding";
/* eslint-enable import/first */

const mockApiFetch = apiFetch as unknown as jest.Mock;

describe("OnboardingRoute", () => {
  beforeEach(() => {
    mockReplace.mockReset();
    mockRefresh.mockReset();
    mockRefresh.mockResolvedValue(undefined);
    mockApiFetch.mockReset();
    mockApiFetch.mockResolvedValue({ profile: {}, onboardingCompleted: true });
    mockCurrentUser = {
      _id: "u1",
      email: "jon@example.com",
      name: "jon",
      onboardingCompleted: false,
    };
  });

  it("walks the 5 steps and PATCHes the profile with onboardingCompleted, then navigates", async () => {
    const { getByTestId } = render(<OnboardingRoute />);

    // Step 1: Goals (multi-select, up to 3 ordered)
    fireEvent.press(getByTestId("onboarding-goal-gain_muscle"));
    fireEvent.press(getByTestId("onboarding-goal-lose_weight"));
    expect(getByTestId("primary-goal-badge")).toBeTruthy();
    fireEvent.press(getByTestId("onboarding-next"));

    // Step 2: About you (Name, Age with 13+ minimum, Sex, Experience)
    fireEvent.changeText(getByTestId("onboarding-name"), "Alex Smith");
    fireEvent.changeText(getByTestId("onboarding-age"), "25");
    fireEvent.press(getByTestId("onboarding-sex-male"));
    fireEvent.press(getByTestId("onboarding-experience-intermediate"));
    fireEvent.press(getByTestId("onboarding-next"));

    // Step 3: Body & nutrition (frame)
    fireEvent.press(getByTestId("onboarding-next"));

    // Step 4: Equipment
    fireEvent.press(getByTestId("onboarding-equipment-dumbbells"));
    fireEvent.press(getByTestId("onboarding-equipment-barbell"));
    fireEvent.press(getByTestId("onboarding-next"));

    // Step 5: Review, then Finish
    expect(getByTestId("review-step")).toBeTruthy();
    await act(async () => {
      fireEvent.press(getByTestId("onboarding-next"));
    });

    await waitFor(() => {
      const patch = mockApiFetch.mock.calls.find(
        (c) =>
          String(c[0]) === "/api/profile" &&
          (c[2] as { method?: string }).method === "PATCH",
      );
      expect(patch).toBeTruthy();
    });

    const patch = mockApiFetch.mock.calls.find(
      (c) =>
        String(c[0]) === "/api/profile" &&
        (c[2] as { method?: string }).method === "PATCH",
    )!;
    const opts = patch[2] as {
      method?: string;
      baseUrl?: string;
      body?: {
        name?: string;
        onboardingCompleted?: boolean;
        profileIcon?: string;
        profile?: Record<string, unknown>;
      };
    };

    expect(opts.method).toBe("PATCH");
    expect(opts.baseUrl).toBe(WEBAPP_BASE_URL);
    expect(opts.body?.name).toBe("Alex Smith");
    expect(opts.body?.onboardingCompleted).toBe(true);
    expect(opts.body?.profileIcon).toBe("strength");
    expect(opts.body?.profile).toEqual({
      fitnessGoals: ["gain_muscle", "lose_weight"],
      fitnessGoal: "gain_muscle",
      experienceLevel: "intermediate",
      age: 25,
      biologicalSex: "male",
      equipmentAccess: ["dumbbells", "barbell"],
      nutritionDirection: "gain",
      weightUnit: "lbs",
    });

    // Gate cleared: user refreshed, then routed to the dashboard.
    await waitFor(() => {
      expect(mockRefresh).toHaveBeenCalled();
      expect(mockReplace).toHaveBeenCalledWith("/(tabs)/dashboard");
    });
  });

  describe("Card NP-055 Acceptance Criteria", () => {
    it("(id: e015c7d6) A new member who signs up natively goes through onboarding before Home", async () => {
      // User with onboardingCompleted: false mounts the route
      const { getByTestId } = render(<OnboardingRoute />);

      // Verify onboarding flow is presented
      expect(getByTestId("onboarding-goal-gain_muscle")).toBeTruthy();

      // Complete all 5 steps
      fireEvent.press(getByTestId("onboarding-goal-gain_muscle"));
      fireEvent.press(getByTestId("onboarding-next"));

      fireEvent.changeText(getByTestId("onboarding-name"), "Morgan");
      fireEvent.changeText(getByTestId("onboarding-age"), "24");
      fireEvent.press(getByTestId("onboarding-sex-female"));
      fireEvent.press(getByTestId("onboarding-next"));

      fireEvent.press(getByTestId("onboarding-next"));

      fireEvent.press(getByTestId("onboarding-equipment-full_gym"));
      fireEvent.press(getByTestId("onboarding-next"));

      await act(async () => {
        fireEvent.press(getByTestId("onboarding-next"));
      });

      // Assert onboardingCompleted was marked true and router heads to dashboard
      await waitFor(() => {
        expect(mockReplace).toHaveBeenCalledWith("/(tabs)/dashboard");
      });
    });

    it("(id: e015c7d7) Their profile on the web shows the name, age, goals and equipment they chose natively", async () => {
      const { getByTestId } = render(<OnboardingRoute />);

      // Step 1: Goals
      fireEvent.press(getByTestId("onboarding-goal-gain_muscle"));
      fireEvent.press(getByTestId("onboarding-goal-improve_performance"));
      fireEvent.press(getByTestId("onboarding-next"));

      // Step 2: About you (name and age)
      fireEvent.changeText(getByTestId("onboarding-name"), "Jordan Taylor");
      fireEvent.changeText(getByTestId("onboarding-age"), "30");
      fireEvent.press(getByTestId("onboarding-sex-prefer_not_to_say"));
      fireEvent.press(getByTestId("onboarding-next"));

      // Step 3: Body & nutrition
      fireEvent.press(getByTestId("onboarding-next"));

      // Step 4: Equipment
      fireEvent.press(getByTestId("onboarding-equipment-dumbbells"));
      fireEvent.press(getByTestId("onboarding-equipment-cables"));
      fireEvent.press(getByTestId("onboarding-next"));

      // Step 5: Finish
      await act(async () => {
        fireEvent.press(getByTestId("onboarding-next"));
      });

      await waitFor(() => {
        expect(mockApiFetch).toHaveBeenCalled();
      });

      const patch = mockApiFetch.mock.calls.find(
        (c) =>
          String(c[0]) === "/api/profile" &&
          (c[2] as { method?: string }).method === "PATCH",
      )!;
      const body = (patch[2] as { body: any }).body;

      // Check name, age, goals, equipment match what was chosen natively
      expect(body.name).toBe("Jordan Taylor");
      expect(body.profile.age).toBe(30);
      expect(body.profile.fitnessGoals).toEqual([
        "gain_muscle",
        "improve_performance",
      ]);
      expect(body.profile.fitnessGoal).toBe("gain_muscle");
      expect(body.profile.equipmentAccess).toEqual(["dumbbells", "cables"]);
      expect(body.profileIcon).toBe("strength");
    });

    it("(id: e015c7d8) An age under 13 cannot be submitted", async () => {
      const { getByTestId, queryByTestId, queryByText } = render(<OnboardingRoute />);

      // Step 1: Goal
      fireEvent.press(getByTestId("onboarding-goal-lose_weight"));
      fireEvent.press(getByTestId("onboarding-next"));

      // Step 2: About you
      fireEvent.changeText(getByTestId("onboarding-name"), "Young Person");
      fireEvent.press(getByTestId("onboarding-sex-female"));

      // Enter age under 13 (e.g. 12)
      fireEvent.changeText(getByTestId("onboarding-age"), "12");

      // Verify inline validation error is shown
      expect(getByTestId("onboarding-age-error")).toBeTruthy();
      expect(queryByText("Must be at least 13 years old")).toBeTruthy();

      // Verify Next button is disabled
      expect(
        getByTestId("onboarding-next").props.accessibilityState?.disabled,
      ).toBe(true);

      // Attempting to advance anyway does not advance to step 3
      fireEvent.press(getByTestId("onboarding-next"));
      expect(queryByTestId("onboarding-step-3")).toBeNull();

      // Now enter valid age 13
      fireEvent.changeText(getByTestId("onboarding-age"), "13");

      // Verify error is cleared and Next button is enabled
      expect(queryByTestId("onboarding-age-error")).toBeNull();
      expect(
        getByTestId("onboarding-next").props.accessibilityState?.disabled,
      ).toBe(false);

      // Successfully advance to step 3
      fireEvent.press(getByTestId("onboarding-next"));
      expect(getByTestId("onboarding-step-3")).toBeTruthy();
    });
  });

  it("does not advance past step 1 until a required goal is picked", () => {
    const { getByTestId } = render(<OnboardingRoute />);
    expect(
      getByTestId("onboarding-next").props.accessibilityState?.disabled,
    ).toBe(true);
    fireEvent.press(getByTestId("onboarding-goal-lose_weight"));
    expect(
      getByTestId("onboarding-next").props.accessibilityState?.disabled,
    ).toBe(false);
  });

  it("does not advance past step 2 without name, valid age, and sex", () => {
    const { getByTestId } = render(<OnboardingRoute />);
    fireEvent.press(getByTestId("onboarding-goal-lose_weight"));
    fireEvent.press(getByTestId("onboarding-next"));

    // Step 2 starts invalid (empty name, age, sex)
    expect(
      getByTestId("onboarding-next").props.accessibilityState?.disabled,
    ).toBe(true);

    fireEvent.changeText(getByTestId("onboarding-name"), "User");
    expect(
      getByTestId("onboarding-next").props.accessibilityState?.disabled,
    ).toBe(true);

    fireEvent.changeText(getByTestId("onboarding-age"), "20");
    expect(
      getByTestId("onboarding-next").props.accessibilityState?.disabled,
    ).toBe(true);

    fireEvent.press(getByTestId("onboarding-sex-male"));
    expect(
      getByTestId("onboarding-next").props.accessibilityState?.disabled,
    ).toBe(false);
  });

  it("allows navigating back to edit steps from the review step", async () => {
    const { getByTestId, getByLabelText } = render(<OnboardingRoute />);

    // Step 1
    fireEvent.press(getByTestId("onboarding-goal-gain_muscle"));
    fireEvent.press(getByTestId("onboarding-next"));

    // Step 2
    fireEvent.changeText(getByTestId("onboarding-name"), "Robin");
    fireEvent.changeText(getByTestId("onboarding-age"), "22");
    fireEvent.press(getByTestId("onboarding-sex-female"));
    fireEvent.press(getByTestId("onboarding-next"));

    // Step 3
    fireEvent.press(getByTestId("onboarding-next"));

    // Step 4
    fireEvent.press(getByTestId("onboarding-equipment-none"));
    fireEvent.press(getByTestId("onboarding-next"));

    // Step 5: Review
    expect(getByTestId("review-step")).toBeTruthy();

    // Click Edit on "Your goals" (Step 1)
    fireEvent.press(getByLabelText("Edit Your goals"));

    // Now on Step 1 again
    expect(getByTestId("onboarding-goal-gain_muscle")).toBeTruthy();
  });
});
