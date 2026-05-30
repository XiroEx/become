/* eslint-disable import/first */
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";

let mockParams: Record<string, string | undefined> = {};
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
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
import NutritionIndexRoute from "../app/(tabs)/nutrition/index";
import DayLogRoute from "../app/(tabs)/nutrition/log/[date]";
/* eslint-enable import/first */

const mockApiFetch = apiFetch as unknown as jest.Mock;

function logCalls(): unknown[][] {
  return mockApiFetch.mock.calls.filter((c) =>
    String(c[0]).startsWith("/api/nutrition/log"),
  );
}
function logCallsByMethod(method: string): unknown[][] {
  return mockApiFetch.mock.calls.filter(
    (c) =>
      String(c[0]).startsWith("/api/nutrition/log") &&
      ((c[2] as { method?: string } | undefined)?.method ?? "GET") === method,
  );
}

const mealLog = {
  date: "2026-06-01",
  meals: [
    {
      mealType: "breakfast",
      foods: [
        { id: "f1", name: "Oats", nutrition: { calories: 300, protein: 10, carbs: 50, fats: 5 } },
      ],
    },
    {
      mealType: "lunch",
      foods: [
        { id: "f2", name: "Chicken", nutrition: { calories: 400, protein: 40, carbs: 0, fats: 8 } },
      ],
    },
  ],
  goals: { calories: 2200 },
};

describe("NutritionIndexRoute", () => {
  beforeEach(() => {
    mockApiFetch.mockReset();
    mockApiFetch.mockResolvedValue(mealLog);
  });

  it("GETs /api/nutrition/log?date=… with baseUrl + token and totals render", async () => {
    const { getByTestId } = render(<NutritionIndexRoute />);
    await waitFor(() => {
      expect(logCalls().length).toBeGreaterThan(0);
    });
    const call = logCalls()[0]!;
    expect(String(call[0])).toMatch(/^\/api\/nutrition\/log\?date=\d{4}-\d{2}-\d{2}$/);
    const opts = call[2] as {
      baseUrl?: string;
      getToken?: () => string | undefined;
    };
    expect(opts).toEqual(expect.objectContaining({ baseUrl: WEBAPP_BASE_URL }));
    expect(opts.getToken?.()).toBe(mockToken);

    // 300 + 400 = 700 kcal from the response.
    await waitFor(() => {
      const kcal = getByTestId("day-totals-kcal").props.children;
      expect(Array.isArray(kcal) ? kcal[0] : kcal).toBe(700);
    });
  });
});

describe("DayLogRoute", () => {
  beforeEach(() => {
    mockApiFetch.mockReset();
    mockApiFetch.mockResolvedValue(mealLog);
    mockParams = { date: "2026-06-01" };
  });

  it("GETs the log for the route's date and renders totals", async () => {
    const { getByTestId } = render(<DayLogRoute />);
    await waitFor(() => {
      expect(logCalls().length).toBeGreaterThan(0);
    });
    expect(String(logCalls()[0]![0])).toBe(
      "/api/nutrition/log?date=2026-06-01",
    );
    await waitFor(() => {
      const kcal = getByTestId("day-totals-kcal").props.children;
      expect(Array.isArray(kcal) ? kcal[0] : kcal).toBe(700);
    });
  });

  it("removes a food entry (DELETE with foodEntryId+date) and refetches the overview", async () => {
    const { getByTestId } = render(<DayLogRoute />);
    await waitFor(() => {
      expect(getByTestId("day-totals-entry-f1-remove")).toBeTruthy();
    });
    const getsBefore = logCallsByMethod("GET").length;

    await act(async () => {
      fireEvent.press(getByTestId("day-totals-entry-f1-remove"));
    });

    // DELETE fires with the entry id + date as query params.
    await waitFor(() => {
      expect(logCallsByMethod("DELETE").length).toBeGreaterThan(0);
    });
    const del = logCallsByMethod("DELETE")[0]!;
    expect(String(del[0])).toBe(
      "/api/nutrition/log?foodEntryId=f1&date=2026-06-01",
    );

    // …then the overview re-pulls so totals reflect the removal.
    await waitFor(() => {
      expect(logCallsByMethod("GET").length).toBeGreaterThan(getsBefore);
    });
  });
});
