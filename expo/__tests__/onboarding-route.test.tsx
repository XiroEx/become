/* eslint-disable import/first */
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";

const mockReplace = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ replace: mockReplace, push: jest.fn(), back: jest.fn() }),
}));

const mockRefresh = jest.fn(async () => {});
const mockToken = "test-jwt";
jest.mock("@/lib/auth/useAuth", () => ({
  useAuth: () => ({
    user: { _id: "u1", email: "jon@example.com", onboardingCompleted: false },
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
  });

  it("walks the 4 steps and PATCHes the profile with onboardingCompleted, then navigates", async () => {
    const { getByTestId } = render(<OnboardingRoute />);

    // Step 1: goal
    fireEvent.press(getByTestId("onboarding-goal-gain_muscle"));
    fireEvent.press(getByTestId("onboarding-next"));
    // Step 2: experience
    fireEvent.press(getByTestId("onboarding-experience-intermediate"));
    fireEvent.press(getByTestId("onboarding-next"));
    // Step 3: body stats
    fireEvent.press(getByTestId("onboarding-sex-male"));
    fireEvent.changeText(getByTestId("onboarding-birth-year"), "1990");
    fireEvent.press(getByTestId("onboarding-next"));
    // Step 4: equipment, then Finish
    fireEvent.press(getByTestId("onboarding-equipment-dumbbells"));
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
        onboardingCompleted?: boolean;
        profile?: Record<string, unknown>;
      };
    };
    expect(opts.method).toBe("PATCH");
    expect(opts.baseUrl).toBe(WEBAPP_BASE_URL);
    expect(opts.body?.onboardingCompleted).toBe(true);
    expect(opts.body?.profile).toEqual({
      fitnessGoal: "gain_muscle",
      experienceLevel: "intermediate",
      biologicalSex: "male",
      birthYear: 1990,
      equipmentAccess: ["dumbbells"],
    });

    // Gate cleared: user refreshed, then routed to the dashboard.
    await waitFor(() => {
      expect(mockRefresh).toHaveBeenCalled();
      expect(mockReplace).toHaveBeenCalledWith("/(tabs)/dashboard");
    });
  });

  it("does not advance past a step until a required choice is made", () => {
    const { getByTestId } = render(<OnboardingRoute />);
    // Next is disabled on step 1 until a goal is picked.
    expect(getByTestId("onboarding-next").props.accessibilityState?.disabled).toBe(
      true,
    );
    fireEvent.press(getByTestId("onboarding-goal-lose_weight"));
    expect(
      getByTestId("onboarding-next").props.accessibilityState?.disabled,
    ).toBe(false);
  });
});
