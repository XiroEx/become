/* eslint-disable import/first */
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";

const mockToken = "test-jwt";
const mockRefresh = jest.fn();

jest.mock("@/lib/auth/secureStoreToken", () => {
  const actual = jest.requireActual("@/lib/auth/secureStoreToken");
  return {
    ...actual,
    sessionStore: {
      async get() {
        return mockToken;
      },
      async set() {},
      async clear() {},
    },
  };
});

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

import { apiFetch, ApiError } from "@become/api-client";
import { clearAll } from "@/lib/cache/lastKnown";
import HealthSettingsRoute from "../app/(app)/(tabs)/profile/health";
/* eslint-enable import/first */

const mockApiFetch = apiFetch as unknown as jest.Mock;

function callsByMethod(path: string, method: string): unknown[][] {
  return mockApiFetch.mock.calls.filter(
    (c) =>
      String(c[0]).startsWith(path) &&
      ((c[2] as { method?: string } | undefined)?.method ?? "GET") === method,
  );
}

describe("HealthSettingsRoute (profile, body stats & units)", () => {
  let mockProfileData: Record<string, unknown>;
  let mockGoalsData: Record<string, unknown>;

  beforeEach(async () => {
    await clearAll();
    mockApiFetch.mockReset();
    mockRefresh.mockClear();

    mockProfileData = {
      name: "Jon Runner",
      email: "jon@example.com",
      onboardingCompleted: true,
      profile: {
        weightUnit: "lbs",
        age: 30,
        biologicalSex: "male",
        heightCm: 182.88, // 6'0"
        currentWeightKg: 81.6466, // 180 lbs
        targetWeightKg: 77.1107, // 170 lbs
      },
    };

    mockGoalsData = {
      todayKey: "2026-09-30",
      nutrition: {
        unit: "lbs",
        status: "active",
        direction: "lose",
        target: {
          weight: 170,
          paceKgPerWeek: 0.45359237, // ~1 lb/wk
          pacePerWeek: 1,
          bandKg: 0.9,
        },
      },
    };

    mockApiFetch.mockImplementation((path: string, _s, init) => {
      const method = (init as { method?: string } | undefined)?.method ?? "GET";
      const cleanPath = String(path).split("?")[0];

      if (cleanPath === "/api/profile" && method === "GET") {
        return Promise.resolve(mockProfileData);
      }
      if (cleanPath === "/api/profile" && method === "PATCH") {
        const body = (init as { body?: Record<string, unknown> }).body;
        if (body?.name) mockProfileData.name = body.name;
        if (body?.profile) {
          mockProfileData.profile = {
            ...(mockProfileData.profile as object),
            ...(body.profile as object),
          };
        }
        return Promise.resolve(mockProfileData);
      }
      if (cleanPath === "/api/goals" && method === "GET") {
        return Promise.resolve(mockGoalsData);
      }
      if (cleanPath === "/api/goals" && method === "PUT") {
        return Promise.resolve(mockGoalsData);
      }
      return Promise.resolve({});
    });
  });

  it("removes the old weight log box from Settings (NP-048 / NP-105)", async () => {
    const { queryByTestId } = render(<HealthSettingsRoute />);
    await waitFor(() => {
      expect(queryByTestId("profile-name-input")).toBeTruthy();
    });
    // The old weight log box is removed:
    expect(queryByTestId("weight-input")).toBeNull();
    expect(queryByTestId("weight-log")).toBeNull();
    expect(queryByTestId("weight-skip")).toBeNull();
    expect(queryByTestId("weight-last")).toBeNull();
  });

  it("GETs /api/profile and seeds Account fields (name, email)", async () => {
    const { getByTestId } = render(<HealthSettingsRoute />);
    await waitFor(() => {
      expect(callsByMethod("/api/profile", "GET").length).toBeGreaterThan(0);
    });
    await waitFor(() => {
      expect(getByTestId("profile-name-input").props.value).toBe("Jon Runner");
      expect(getByTestId("profile-email-input").props.value).toBe(
        "jon@example.com",
      );
    });
  });

  it("(id: e015c7ac) A member who chose kilograms on the web sees kilograms natively, and a change made natively shows on the web", async () => {
    // 1. Member chose kg on web:
    mockProfileData.profile = {
      weightUnit: "kg",
      age: 28,
      biologicalSex: "female",
      heightCm: 175,
      currentWeightKg: 70,
      targetWeightKg: 65,
    };
    mockGoalsData.nutrition = {
      unit: "kg",
      status: "active",
      direction: "lose",
      target: {
        weight: 65,
        paceKgPerWeek: 0.5,
        pacePerWeek: 0.5,
        bandKg: 0.9,
      },
    };

    const { getByTestId } = render(<HealthSettingsRoute />);
    await waitFor(() => {
      // Metric fields populated:
      expect(getByTestId("profile-height-cm-input").props.value).toBe("175");
      expect(getByTestId("profile-current-weight-input").props.value).toBe("70");
      expect(getByTestId("profile-target-weight-input").props.value).toBe("65");
    });

    // 2. Change made natively (e.g. current weight to 69 kg) and save:
    fireEvent.changeText(getByTestId("profile-current-weight-input"), "69");
    await act(async () => {
      fireEvent.press(getByTestId("profile-save"));
    });

    await waitFor(() => {
      expect(callsByMethod("/api/profile", "PATCH").length).toBeGreaterThan(0);
    });

    const patchCall = callsByMethod("/api/profile", "PATCH")[0]!;
    const patchBody = (
      patchCall[2] as { body: { profile: { weightUnit: string; currentWeightKg: number } } }
    ).body;
    // Saves weightUnit: "kg" and weight in kg
    expect(patchBody.profile.weightUnit).toBe("kg");
    expect(patchBody.profile.currentWeightKg).toBe(69);

    // Shows on the web: the mock profile now contains weightUnit: 'kg' and currentWeightKg: 69
    expect((mockProfileData.profile as { weightUnit: string }).weightUnit).toBe(
      "kg",
    );
    expect(
      (mockProfileData.profile as { currentWeightKg: number }).currentWeightKg,
    ).toBe(69);
  });

  it("converts values between imperial and metric when toggling units", async () => {
    const { getByTestId, queryByTestId } = render(<HealthSettingsRoute />);
    await waitFor(() => {
      expect(getByTestId("profile-height-ft-input").props.value).toBe("6");
      expect(getByTestId("profile-height-in-input").props.value).toBe("0");
      expect(getByTestId("profile-current-weight-input").props.value).toBe("180");
    });

    // Toggle to Metric (kg)
    await act(async () => {
      fireEvent.press(getByTestId("unit-toggle-kg"));
    });

    // Now height is in cm and weight is in kg
    expect(queryByTestId("profile-height-ft-input")).toBeNull();
    expect(getByTestId("profile-height-cm-input").props.value).toBe("183");
    // 180 lbs = ~81.6 kg
    expect(getByTestId("profile-current-weight-input").props.value).toBe("81.6");

    // Toggle back to Imperial (lbs)
    await act(async () => {
      fireEvent.press(getByTestId("unit-toggle-lbs"));
    });
    expect(getByTestId("profile-height-ft-input").props.value).toBe("6");
    expect(getByTestId("profile-height-in-input").props.value).toBe("0");
    // 81.6 kg back to lbs is ~179.9 lbs
    expect(Number(getByTestId("profile-current-weight-input").props.value)).toBeCloseTo(180, 0);
  });

  it("(id: e015c7ad) A target weight and pace set natively show on the web's Settings and goals pages", async () => {
    const { getByTestId } = render(<HealthSettingsRoute />);
    await waitFor(() => {
      expect(getByTestId("profile-target-weight-input")).toBeTruthy();
    });

    // Target weight is 170 lbs, pace is 1 lb/wk
    // Change target weight to 165 lbs and select 0.5 lb/wk pace
    fireEvent.changeText(getByTestId("profile-target-weight-input"), "165");
    await act(async () => {
      fireEvent.press(getByTestId("pace-0.5"));
    });

    await act(async () => {
      fireEvent.press(getByTestId("profile-save"));
    });

    await waitFor(() => {
      expect(callsByMethod("/api/profile", "PATCH").length).toBeGreaterThan(0);
      expect(callsByMethod("/api/goals", "PUT").length).toBeGreaterThan(0);
    });

    // 1. Profile PATCH has targetWeightKg in kg
    const patchBody = (
      callsByMethod("/api/profile", "PATCH")[0]![2] as {
        body: { profile: { targetWeightKg: number } };
      }
    ).body;
    expect(patchBody.profile.targetWeightKg).toBeCloseTo(165 / 2.20462, 1);

    // 2. Goals PUT has paceKgPerWeek
    const goalsPutBody = (
      callsByMethod("/api/goals", "PUT")[0]![2] as {
        body: { pillar: string; paceKgPerWeek: number };
      }
    ).body;
    expect(goalsPutBody.pillar).toBe("nutrition");
    // 0.5 lb/wk in kg is 0.5 * 0.45359237 ≈ 0.226796
    expect(goalsPutBody.paceKgPerWeek).toBeCloseTo(0.5 * 0.45359237, 3);
  });

  it("(id: e015c7ae) An age under 13 shows the server's refusal and saves nothing", async () => {
    // Server rejects age < 13 with 400 age_below_minimum
    mockApiFetch.mockImplementation((path: string, _s, init) => {
      const method = (init as { method?: string } | undefined)?.method ?? "GET";
      const cleanPath = String(path).split("?")[0];

      if (cleanPath === "/api/profile" && method === "GET") {
        return Promise.resolve(mockProfileData);
      }
      if (cleanPath === "/api/goals" && method === "GET") {
        return Promise.resolve(mockGoalsData);
      }
      if (cleanPath === "/api/profile" && method === "PATCH") {
        const body = (init as { body?: { profile?: { age?: number } } }).body;
        if (body?.profile?.age !== undefined && body.profile.age < 13) {
          throw new ApiError(400, {
            error: "age_below_minimum",
            minimumAge: 13,
          });
        }
        return Promise.resolve(mockProfileData);
      }
      return Promise.resolve({});
    });

    const { getByTestId, queryByTestId } = render(<HealthSettingsRoute />);
    await waitFor(() => {
      expect(getByTestId("profile-age-input")).toBeTruthy();
    });

    // Enter age 12 (< 13)
    fireEvent.changeText(getByTestId("profile-age-input"), "12");
    await act(async () => {
      fireEvent.press(getByTestId("profile-save"));
    });

    // Shows server refusal:
    await waitFor(() => {
      const errorText = getByTestId("profile-age-input-error");
      expect(errorText.props.children).toBe(
        "You must be at least 13 years old",
      );
    });

    // Saves nothing: PUT /api/goals was never called
    expect(callsByMethod("/api/goals", "PUT").length).toBe(0);
    // Success toast is NOT shown
    expect(queryByTestId("profile-save-success")).toBeNull();
  });

  it("calculates and displays BMI badge correctly", async () => {
    const { getByTestId } = render(<HealthSettingsRoute />);
    await waitFor(() => {
      // 180 lbs (81.65 kg) and 6'0" (182.88 cm) -> BMI 24.4 (Normal)
      expect(getByTestId("bmi-badge")).toBeTruthy();
      const badgeText = String(getByTestId("bmi-badge").props.children);
      expect(badgeText).toContain("BMI 24.4");
      expect(badgeText).toContain("Normal");
    });
  });

  it("allows selecting biological sex", async () => {
    const { getByTestId } = render(<HealthSettingsRoute />);
    await waitFor(() => {
      expect(getByTestId("sex-option-female")).toBeTruthy();
    });

    await act(async () => {
      fireEvent.press(getByTestId("sex-option-female"));
    });

    await act(async () => {
      fireEvent.press(getByTestId("profile-save"));
    });

    await waitFor(() => {
      expect(callsByMethod("/api/profile", "PATCH").length).toBeGreaterThan(0);
    });
    const patchBody = (
      callsByMethod("/api/profile", "PATCH")[0]![2] as {
        body: { profile: { biologicalSex: string } };
      }
    ).body;
    expect(patchBody.profile.biologicalSex).toBe("female");
  });
});
