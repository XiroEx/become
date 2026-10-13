/* eslint-disable import/first */
import { fireEvent, render, waitFor } from "@testing-library/react-native";
import { StyleSheet } from "react-native";

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
        info: "rgb(0 0 200)",
      },
      // Distinguishable from a flat `colors.*` value so a test can tell a
      // tinted surface apart from a plain muted one.
      tint: (name: string, alpha: number) => `tint:${name}:${alpha}`,
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

  // --- NP-274: match the web's row colours/icon/date, and give the
  // re-log sheet the web's ADDING TO control, calendar day picker and
  // time field. -----------------------------------------------------

  it("(id: NP-274-row) the no-photo tile is a success tint (not grey), and the date reads 'Oct 5, 10:27 PM' with a comma", async () => {
    mockApiFetch.mockImplementation(async (path: string) => {
      if (String(path).startsWith("/api/nutrition/scans?")) {
        return {
          scans: [
            {
              ...SCAN,
              _id: "scan-nophoto",
              thumb: undefined,
              imageUrl: undefined,
              createdAt: "2026-10-05T22:27:00.000Z",
            },
          ],
          total: 1,
          offset: 0,
          limit: 60,
        };
      }
      return {};
    });
    const { getByTestId, getByText } = renderSheet();
    await waitFor(() => {
      expect(getByTestId("scan-history-scan-scan-nophoto-icon")).toBeTruthy();
    });
    const tile = StyleSheet.flatten(
      getByTestId("scan-history-scan-scan-nophoto-icon").props.style,
    );
    // The web's `bg-emerald-100 ... dark:bg-emerald-900/30` — a tinted
    // SUCCESS surface, not the flat `colors.muted` grey the native tile
    // used before this card.
    expect(tile.backgroundColor).toBe("tint:success:0.15");
    // Date and time are formatted separately and joined with a literal
    // ", " so the string can't drift to "Oct 5 at 10:27 PM" on an engine
    // whose Intl joins a combined date+time call with "at" instead.
    expect(getByText("Oct 5, 10:27 PM")).toBeTruthy();
  });

  it("(id: NP-274-tag) the log sheet's tag control is the web's one ADDING TO pill, not a heading above a plain toggle", async () => {
    const { getByTestId } = renderSheet();
    await waitFor(() => {
      expect(getByTestId("scan-history-scan-scan-1-log-again")).toBeTruthy();
    });
    fireEvent.press(getByTestId("scan-history-scan-scan-1-log-again"));
    const toggle = getByTestId("scan-history-log-tag-toggle");
    expect(toggle.props.accessibilityLabel).toBe(
      "Adding to lunch, tap to change",
    );
  });

  it("(id: NP-274-calendar) the day picker is a month calendar: it steps back a month and picks a day the old 7-day chip row never reached", async () => {
    const onLogged = jest.fn();
    const { getByTestId } = renderSheet({ onLogged });
    await waitFor(() => {
      expect(getByTestId("scan-history-scan-scan-1-log-again")).toBeTruthy();
    });
    fireEvent.press(getByTestId("scan-history-scan-scan-1-log-again"));
    expect(getByTestId("scan-history-log-sheet")).toBeTruthy();
    // todayKey is 2026-10-03 — step back a month and pick 2026-09-10,
    // 23 days ago, well past the old chip row's 7-day reach.
    fireEvent.press(getByTestId("scan-history-log-calendar-prev-month"));
    fireEvent.press(getByTestId("scan-history-log-day-2026-09-10"));
    fireEvent.press(getByTestId("scan-history-log-submit"));
    await waitFor(() => {
      expect(
        mockApiFetch.mock.calls.some((c) => c[0] === "/api/meal-logs"),
      ).toBe(true);
    });
    const post = mockApiFetch.mock.calls.find((c) => c[0] === "/api/meal-logs")!;
    const body = (post[2] as { body: Record<string, unknown> }).body;
    expect(body.untimed).toBe(true);
    expect(body.loggedAt).toBe(new Date(2026, 8, 10, 12, 0, 0, 0).toISOString());
    expect(onLogged).toHaveBeenCalled();
  });

  it("(id: NP-274-time) the time field: typing a time makes it custom, and the clear X returns it to untimed", async () => {
    const { getByTestId } = renderSheet();
    await waitFor(() => {
      expect(getByTestId("scan-history-scan-scan-1-log-again")).toBeTruthy();
    });

    fireEvent.press(getByTestId("scan-history-scan-scan-1-log-again"));
    fireEvent.press(getByTestId("scan-history-log-day-2026-10-02"));
    // The field starts disabled ("no time", matching the web's default) —
    // Now enables it (pre-filled with the current clock time) before a typed
    // value can turn it into a custom one.
    fireEvent.press(getByTestId("scan-history-log-time-now"));
    fireEvent.changeText(getByTestId("scan-history-log-time-input"), "08:15");
    fireEvent.press(getByTestId("scan-history-log-submit"));
    await waitFor(() => {
      expect(
        mockApiFetch.mock.calls.some((c) => c[0] === "/api/meal-logs"),
      ).toBe(true);
    });
    let post = mockApiFetch.mock.calls
      .filter((c) => c[0] === "/api/meal-logs")
      .pop()!;
    let body = (post[2] as { body: Record<string, unknown> }).body;
    expect(body.untimed).toBe(false);
    expect(body.loggedAt).toBe(new Date(2026, 9, 2, 8, 15, 0, 0).toISOString());

    // Re-open — openLogSheet resets to the defaults — set a custom time
    // again, then clear it with the X. That logs untimed, like "no time".
    fireEvent.press(getByTestId("scan-history-scan-scan-1-log-again"));
    fireEvent.press(getByTestId("scan-history-log-day-2026-10-02"));
    fireEvent.press(getByTestId("scan-history-log-time-now"));
    fireEvent.changeText(getByTestId("scan-history-log-time-input"), "08:15");
    fireEvent.press(getByTestId("scan-history-log-time-clear"));
    fireEvent.press(getByTestId("scan-history-log-submit"));
    await waitFor(() => {
      expect(
        mockApiFetch.mock.calls.filter((c) => c[0] === "/api/meal-logs")
          .length,
      ).toBe(2);
    });
    post = mockApiFetch.mock.calls
      .filter((c) => c[0] === "/api/meal-logs")
      .pop()!;
    body = (post[2] as { body: Record<string, unknown> }).body;
    expect(body.untimed).toBe(true);
  });
});
