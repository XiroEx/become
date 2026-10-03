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

// The permission hook is a no-op until NP-065 fills it; spy on the module so
// the hand-off order is observable without a device.
const mockAskPermission = jest.fn(async () => {});
const mockTrialHook = jest.fn(async () => {});
jest.mock("@/lib/push/afterOnboarding", () => ({
  askNotificationPermissionAfterOnboarding: (...args: unknown[]) =>
    (mockAskPermission as (...a: unknown[]) => Promise<void>)(...args),
  maybeShowTrialPromptAfterOnboarding: (...args: unknown[]) =>
    (mockTrialHook as (...a: unknown[]) => Promise<void>)(...args),
}));

import { apiFetch } from "@become/api-client";
import OnboardingRoute from "../app/onboarding";
/* eslint-enable import/first */

const mockApiFetch = apiFetch as unknown as jest.Mock;

const RECOMMENDATION = {
  basedOn: {
    goals: ["gain_muscle"],
    experienceLevel: "intermediate",
    weeklyAvailability: null,
    equipmentAccess: ["dumbbells", "barbell"],
  },
  recommendations: [
    {
      program_id: "prog-1",
      name: "Muscle Builder",
      description: "Build muscle",
      goal: "gain_muscle",
      target_user: "Intermediate",
      training_days_per_week: 4,
      duration_weeks: 8,
      tags: [],
      coverImage: null,
      score: 9.5,
      reasons: ["Matches your goal", "Fits your equipment"],
    },
  ],
};

const ENROLL_OK = {
  message: "Enrolled",
  activeProgram: {
    programId: "prog-1",
    programName: "Muscle Builder",
    startDate: "2026-10-03",
    currentPhase: 1,
    currentDay: "Day 1",
    completedWorkouts: 0,
    totalWorkouts: 24,
    status: "active",
  },
};

function mockApiFetchImpl(path: string, _schema: unknown, init?: any) {
  if (String(path).startsWith("/api/programs/recommend")) {
    return Promise.resolve(RECOMMENDATION);
  }
  if (String(path) === "/api/programs/enroll") {
    return Promise.resolve(ENROLL_OK);
  }
  return Promise.resolve({ profile: {}, onboardingCompleted: true });
}

async function walkToReview(getByTestId: (id: string) => any) {
  fireEvent.press(getByTestId("onboarding-goal-gain_muscle"));
  fireEvent.press(getByTestId("onboarding-next"));

  await walkToReviewSteps(getByTestId);
}

async function walkToReviewSteps(getByTestId: (id: string) => any) {

  fireEvent.changeText(getByTestId("onboarding-name"), "Alex Smith");
  fireEvent.changeText(getByTestId("onboarding-age"), "25");
  fireEvent.press(getByTestId("onboarding-sex-male"));
  fireEvent.press(getByTestId("onboarding-experience-intermediate"));
  fireEvent.press(getByTestId("onboarding-next"));

  fireEvent.changeText(getByTestId("stat-height-ft"), "5");
  fireEvent.changeText(getByTestId("stat-height-in"), "10");
  fireEvent.changeText(getByTestId("stat-current-weight"), "180");
  fireEvent.changeText(getByTestId("stat-target-weight"), "165");
  fireEvent.press(getByTestId("onboarding-next"));

  fireEvent.press(getByTestId("onboarding-equipment-dumbbells"));
  fireEvent.press(getByTestId("onboarding-equipment-barbell"));
  fireEvent.press(getByTestId("onboarding-next"));

  // The recommendation fetch is debounced; let it land.
  await waitFor(() => {
    expect(getByTestId("onboarding-recommended-program")).toBeTruthy();
  });
}

describe("Onboarding review step — program recommendation and enrolment (NP-057)", () => {
  beforeEach(() => {
    mockReplace.mockReset();
    mockRefresh.mockReset();
    mockRefresh.mockResolvedValue(undefined);
    mockApiFetch.mockReset();
    mockApiFetch.mockImplementation(mockApiFetchImpl);
    mockAskPermission.mockClear();
    mockTrialHook.mockClear();
    mockCurrentUser = {
      _id: "u1",
      email: "jon@example.com",
      name: "jon",
      onboardingCompleted: false,
    };
    jest.useRealTimers();
  });

  it("(id: e015c7e2) A member who enrols on the review step lands on Home enrolled in the recommended program", async () => {
    const { getByTestId } = render(<OnboardingRoute />);
    await walkToReview(getByTestId);

    // The server-driven recommendation renders with the web's query shape.
    const recCall = mockApiFetch.mock.calls.find((c) =>
      String(c[0]).startsWith("/api/programs/recommend"),
    );
    expect(recCall).toBeTruthy();
    const recPath = String(recCall![0]);
    expect(recPath).toContain("goals=gain_muscle");
    expect(recPath).toContain("limit=1");
    expect(recPath).toContain("profile=0");
    expect(recPath).toContain("level=intermediate");
    expect(recPath).toContain("equipment=");
    expect(getByTestId("onboarding-recommended-program-name")).toBeTruthy();

    // Enrol from the review step via the web's endpoint.
    await act(async () => {
      fireEvent.press(getByTestId("onboarding-recommended-program-enroll"));
    });
    await waitFor(() => {
      expect(getByTestId("onboarding-recommended-program-enrolled")).toBeTruthy();
    });
    const enroll = mockApiFetch.mock.calls.find(
      (c) =>
        String(c[0]) === "/api/programs/enroll" &&
        (c[2] as { method?: string }).method === "POST",
    );
    expect(enroll).toBeTruthy();
    expect((enroll![2] as any).body).toEqual({ programId: "prog-1" });

    // Finish: profile saved, permission asked, trial hook run, then Home.
    await act(async () => {
      fireEvent.press(getByTestId("onboarding-next"));
    });
    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith("/(tabs)/dashboard");
    });
    const patch = mockApiFetch.mock.calls.find(
      (c) =>
        String(c[0]) === "/api/profile" &&
        (c[2] as { method?: string }).method === "PATCH",
    );
    expect(patch).toBeTruthy();
    expect((patch![2] as any).body?.onboardingCompleted).toBe(true);
    expect(mockAskPermission).toHaveBeenCalledTimes(1);
    expect(mockTrialHook).toHaveBeenCalledTimes(1);
  });

  it("(id: e015c7e3) A member who does not enrol, or whose enrolment fails, still finishes onboarding", async () => {
    // Case 1: no enrolment at all.
    const first = render(<OnboardingRoute />);
    await walkToReview(first.getByTestId);
    await act(async () => {
      fireEvent.press(first.getByTestId("onboarding-next"));
    });
    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith("/(tabs)/dashboard");
    });
    expect(
      mockApiFetch.mock.calls.filter(
        (c) => String(c[0]) === "/api/programs/enroll",
      ),
    ).toHaveLength(0);
    first.unmount();

    // Case 2: enrolment fails — finishing still proceeds.
    mockReplace.mockReset();
    mockApiFetch.mockImplementation((path: string, _s: unknown, init?: any) => {
      if (String(path).startsWith("/api/programs/recommend")) {
        return Promise.resolve(RECOMMENDATION);
      }
      if (String(path) === "/api/programs/enroll") {
        return Promise.reject(new Error("enroll failed"));
      }
      return Promise.resolve({ profile: {}, onboardingCompleted: true });
    });
    const second = render(<OnboardingRoute />);
    await walkToReview(second.getByTestId);
    await act(async () => {
      fireEvent.press(
        second.getByTestId("onboarding-recommended-program-enroll"),
      );
    });
    // No enrolled state on failure…
    expect(() =>
      second.getByTestId("onboarding-recommended-program-enrolled"),
    ).toThrow();
    // …but Finish still lands Home.
    await act(async () => {
      fireEvent.press(second.getByTestId("onboarding-next"));
    });
    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith("/(tabs)/dashboard");
    });
    const patch = mockApiFetch.mock.calls.find(
      (c) =>
        String(c[0]) === "/api/profile" &&
        (c[2] as { method?: string }).method === "PATCH",
    );
    expect(patch).toBeTruthy();
  });

  it("(id: e015c7e4) Notification permission is asked here, not at first launch", async () => {
    const { getByTestId } = render(<OnboardingRoute />);
    // Walking the wizard fires no permission ask…
    fireEvent.press(getByTestId("onboarding-goal-gain_muscle"));
    fireEvent.press(getByTestId("onboarding-next"));
    expect(mockAskPermission).not.toHaveBeenCalled();
    await walkToReviewSteps(getByTestId);
    // …the ask fires exactly once, after Finish, before Home.
    expect(mockAskPermission).not.toHaveBeenCalled();
    await act(async () => {
      fireEvent.press(getByTestId("onboarding-next"));
    });
    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith("/(tabs)/dashboard");
    });
    expect(mockAskPermission).toHaveBeenCalledTimes(1);
  });
});
