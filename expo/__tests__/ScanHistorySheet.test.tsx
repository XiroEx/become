/* eslint-disable import/first */
import { fireEvent, render, waitFor } from "@testing-library/react-native";

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
}));

jest.mock("@/lib/theme/useThemeTokens", () => {
  const actual = jest.requireActual("@/lib/theme/useThemeTokens");
  return {
    ...actual,
    useThemeTokens: () => ({
      mode: "light" as const,
      isDark: false,
      colors: {
        background: "rgb(255 255 255)",
        card: "rgb(255 255 255)",
        foreground: "rgb(0 0 0)",
        border: "rgb(200 200 200)",
        muted: "rgb(240 240 240)",
        "muted-foreground": "rgb(100 100 100)",
        success: "rgb(0 150 0)",
        primary: "rgb(200 0 0)",
        "primary-foreground": "rgb(255 255 255)",
        destructive: "rgb(200 0 0)",
      },
      tint: () => "rgb(240 240 240)",
      scrim: "rgba(0,0,0,0.4)",
      statusBarStyle: "dark" as const,
    }),
  };
});

jest.mock("@/lib/auth/useAuth", () => ({
  useAuth: () => ({ token: "test-token" }),
}));

jest.mock("@/components/media/AuthedImage", () => {
  const RN = jest.requireActual("react-native");
  return {
    AuthedImage: ({ testID }: { testID?: string }) => (
      <RN.View testID={testID} />
    ),
  };
});

jest.mock("@become/api-client", () => {
  const actual = jest.requireActual("@become/api-client");
  return { __esModule: true, ...actual, apiFetch: jest.fn() };
});

import { apiFetch } from "@become/api-client";
import { ScanHistorySheet } from "@/components/nutrition/ScanHistorySheet";
/* eslint-enable import/first */

const mockApiFetch = apiFetch as unknown as jest.Mock;

const SCAN = {
  _id: "scan-1",
  source: "photo",
  tag: "lunch",
  thumb: "data:image/jpeg;base64,AAA",
  imageUrl: "/api/blob/scans/abc",
  items: [
    {
      name: "Chicken bowl",
      servingSize: 1,
      servingUnit: "bowl",
      servings: 2,
      nutrition: { calories: 250, protein: 20, carbs: 20, fats: 8 },
    },
  ],
  totalNutrition: { calories: 500, protein: 40, carbs: 40, fats: 16 },
  createdAt: "2026-10-02T12:00:00.000Z",
};

const WINDOWS = [{ tag: "lunch", startMinutes: 720, endMinutes: 840 }];

function renderSheet(overrides?: Partial<Parameters<typeof ScanHistorySheet>[0]>) {
  return render(
    <ScanHistorySheet
      visible
      onClose={() => {}}
      token="test-token"
      todayKey="2026-10-03"
      windows={WINDOWS}
      tagOptions={["breakfast", "lunch", "dinner", "snack"]}
      onReopen={() => {}}
      onLogged={() => {}}
      {...overrides}
    />,
  );
}

beforeEach(() => {
  mockApiFetch.mockReset();
  mockApiFetch.mockImplementation(async (path: string) => {
    if (String(path).startsWith("/api/nutrition/scans?")) {
      return { scans: [SCAN], total: 1, offset: 0, limit: 60 };
    }
    if (String(path).startsWith("/api/meal-logs")) {
      return { log: { _id: "log-9" } };
    }
    return {};
  });
});

describe("ScanHistorySheet (NP-141)", () => {
  it("lists saved estimates with thumbnails and per-item calories", async () => {
    const { getByTestId } = renderSheet();
    await waitFor(() => {
      expect(getByTestId("scan-history-list")).toBeTruthy();
    });
    expect(getByTestId("scan-history-scan-scan-1")).toBeTruthy();
    expect(getByTestId("scan-history-scan-scan-1-thumb")).toBeTruthy();
    expect(getByTestId("scan-history-scan-scan-1-item-0")).toBeTruthy();
    expect(
      mockApiFetch.mock.calls.some((c) =>
        String(c[0]).startsWith("/api/nutrition/scans?limit=60"),
      ),
    ).toBe(true);
  });

  it("reopens a scan in the native review with its saved items", async () => {
    const onReopen = jest.fn();
    const { getByTestId } = renderSheet({ onReopen });
    await waitFor(() => {
      expect(getByTestId("scan-history-scan-scan-1-reopen")).toBeTruthy();
    });
    fireEvent.press(getByTestId("scan-history-scan-scan-1-reopen"));
    expect(onReopen).toHaveBeenCalledWith(
      expect.objectContaining({ _id: "scan-1" }),
    );
  });

  it("(id: e015c9da) re-logs to yesterday at lunch, untimed on the tag anchor", async () => {
    const onLogged = jest.fn();
    const { getByTestId } = renderSheet({ onLogged });
    await waitFor(() => {
      expect(getByTestId("scan-history-scan-scan-1-log-again")).toBeTruthy();
    });
    fireEvent.press(getByTestId("scan-history-scan-scan-1-log-again"));
    expect(getByTestId("scan-history-log-sheet")).toBeTruthy();
    // Yesterday at lunch: the day chip for 2026-10-02, tag already lunch.
    fireEvent.press(getByTestId("scan-history-log-day-2026-10-02"));
    fireEvent.press(getByTestId("scan-history-log-submit"));
    await waitFor(() => {
      expect(
        mockApiFetch.mock.calls.some((c) => c[0] === "/api/meal-logs"),
      ).toBe(true);
    });
    const post = mockApiFetch.mock.calls.find((c) => c[0] === "/api/meal-logs")!;
    const body = (post[2] as { body: Record<string, unknown> }).body;
    expect(body.tags).toEqual(["lunch"]);
    expect(body.untimed).toBe(true);
    expect(body.loggedAt).toBe(new Date(2026, 9, 2, 12, 0, 0, 0).toISOString());
    expect(onLogged).toHaveBeenCalled();
  });

  it("(id: e015c9db) deleting removes the row optimistically and DELETEs it", async () => {
    const { getByTestId, queryByTestId } = renderSheet();
    await waitFor(() => {
      expect(getByTestId("scan-history-scan-scan-1-delete")).toBeTruthy();
    });
    fireEvent.press(getByTestId("scan-history-scan-scan-1-delete"));
    expect(getByTestId("scan-history-delete-confirm")).toBeTruthy();
    fireEvent.press(getByTestId("scan-history-delete-confirm-button"));
    await waitFor(() => {
      expect(
        mockApiFetch.mock.calls.some(
          (c) =>
            c[0] === "/api/nutrition/scans/scan-1" &&
            (c[2] as { method?: string })?.method === "DELETE",
        ),
      ).toBe(true);
    });
    // Optimistic removal: the row is gone without a refetch.
    expect(queryByTestId("scan-history-scan-scan-1")).toBeNull();
  });

  it("restores the row when the DELETE fails", async () => {
    mockApiFetch.mockImplementation(async (path: string) => {
      if (String(path).startsWith("/api/nutrition/scans?")) {
        return { scans: [SCAN], total: 1, offset: 0, limit: 60 };
      }
      throw new Error("offline");
    });
    const { getByTestId } = renderSheet();
    await waitFor(() => {
      expect(getByTestId("scan-history-scan-scan-1-delete")).toBeTruthy();
    });
    fireEvent.press(getByTestId("scan-history-scan-scan-1-delete"));
    fireEvent.press(getByTestId("scan-history-delete-confirm-button"));
    await waitFor(() => {
      expect(getByTestId("scan-history-notice")).toBeTruthy();
    });
    expect(getByTestId("scan-history-scan-scan-1")).toBeTruthy();
  });
});
