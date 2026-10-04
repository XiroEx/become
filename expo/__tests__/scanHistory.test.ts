/**
 * scanHistory (NP-141) — estimate history: reopen, re-log, delete.
 *
 * Covers the pure rules the history sheet depends on:
 *   - resolveScanLogAgainTimestamp follows the web's
 *     `resolveLogAgainTimestamp` exactly: 'custom' stamps the picked time
 *     and marks the entry timed; 'now' and 'none' both go out untimed with
 *     the tag's schedule anchor as the `loggedAt` clock (the day view
 *     places them by the tag's window instead).
 *   - scanLogItems is a straight repost of the scan's items (foodId when
 *     present, per-serving nutrition × servings).
 *   - logScanAgain POSTs /api/meal-logs with tags/loggedAt/untimed and
 *     refuses an empty scan without touching the network.
 *   - deleteSavedScan DELETEs /api/nutrition/scans/{id}.
 *   - reviewItemsFromScan rebuilds review rows the way the web's
 *     SnapPlateModal does for initialReview.
 */

import {
  deleteSavedScan,
  logScanAgain,
  resolveScanLogAgainTimestamp,
  reviewItemsFromScan,
  scanDefaultTag,
  scanLogItems,
  type SavedScan,
} from "../lib/nutrition/scanHistory";

jest.mock("../lib/mind/sessionCache", () => ({
  invalidateMindSession: jest.fn(async () => {}),
}));

const SCAN: SavedScan = {
  _id: "scan-1",
  source: "photo",
  tag: "lunch",
  items: [
    {
      foodId: "6512c0ffee1234567890abcd",
      name: "Chicken bowl",
      brand: "House",
      servingSize: 1,
      servingUnit: "bowl",
      servings: 2,
      nutrition: { calories: 250, protein: 20, carbs: 20, fats: 8 },
      confidence: 0.9,
      matchKind: "food",
    },
    {
      name: "Rice",
      servingSize: 1,
      servingUnit: "cup",
      servings: 1,
      nutrition: { calories: 200, protein: 4, carbs: 44, fats: 0 },
    },
  ],
  totalNutrition: { calories: 700, protein: 44, carbs: 84, fats: 16 },
  createdAt: "2026-10-03T12:00:00.000Z",
};

const WINDOWS = [
  { tag: "breakfast", startMinutes: 420, endMinutes: 600 },
  { tag: "lunch", startMinutes: 720, endMinutes: 840 },
];

describe("resolveScanLogAgainTimestamp (the web's rule, verbatim)", () => {
  const now = new Date(2026, 9, 3, 15, 30, 0);

  it("'none' uses the tag's schedule anchor and goes out untimed", () => {
    const { loggedAt, untimed } = resolveScanLogAgainTimestamp(
      "2026-10-02",
      "none",
      null,
      "12:00",
      now,
    );
    // Lunch anchor 12:00 on yesterday, local.
    expect(loggedAt).toBe(new Date(2026, 9, 2, 12, 0, 0, 0).toISOString());
    expect(untimed).toBe(true);
  });

  it("'now' also goes out untimed on the anchor (previews as right now)", () => {
    const { loggedAt, untimed } = resolveScanLogAgainTimestamp(
      null,
      "now",
      null,
      "12:00",
      now,
    );
    expect(loggedAt).toBe(new Date(2026, 9, 3, 12, 0, 0, 0).toISOString());
    expect(untimed).toBe(true);
  });

  it("'custom' stamps the picked time and marks the entry timed", () => {
    const { loggedAt, untimed } = resolveScanLogAgainTimestamp(
      "2026-10-02",
      "custom",
      "13:15",
      "12:00",
      now,
    );
    expect(loggedAt).toBe(new Date(2026, 9, 2, 13, 15, 0, 0).toISOString());
    expect(untimed).toBe(false);
  });
});

describe("scanLogItems", () => {
  it("reposts foodId, per-serving nutrition and servings", () => {
    const items = scanLogItems(SCAN);
    expect(items).toHaveLength(2);
    expect(items[0]).toEqual({
      foodId: "6512c0ffee1234567890abcd",
      name: "Chicken bowl",
      brand: "House",
      servingSize: 1,
      servingUnit: "bowl",
      servings: 2,
      nutrition: { calories: 250, protein: 20, carbs: 20, fats: 8 },
    });
    // No foodId / brand keys when absent.
    expect(items[1]).toEqual({
      name: "Rice",
      servingSize: 1,
      servingUnit: "cup",
      servings: 1,
      nutrition: { calories: 200, protein: 4, carbs: 44, fats: 0 },
    });
  });
});

describe("logScanAgain", () => {
  it("(id: e015c9da) re-logs a web estimate to yesterday at lunch, untimed on the tag anchor", async () => {
    const calls: { path: string; init: unknown }[] = [];
    const apiFetchImpl = (async (path: string, _schema: unknown, init: unknown) => {
      calls.push({ path, init });
      return { log: { _id: "log-9" } };
    }) as never;
    const res = await logScanAgain(
      SCAN,
      { dateKey: "2026-10-02", tag: "lunch", timeMode: "none", time: null },
      WINDOWS,
      { now: new Date(2026, 9, 3, 15, 30, 0), apiFetchImpl },
    );
    expect(res.ok).toBe(true);
    expect(res.mealLogId).toBe("log-9");
    expect(calls).toHaveLength(1);
    const body = (calls[0]!.init as { body: Record<string, unknown> }).body;
    expect(calls[0]!.path).toBe("/api/meal-logs");
    expect(body.tags).toEqual(["lunch"]);
    expect(body.untimed).toBe(true);
    // Yesterday at the lunch anchor (12:00 local), not "now".
    expect(body.loggedAt).toBe(new Date(2026, 9, 2, 12, 0, 0, 0).toISOString());
    expect(body.items).toHaveLength(2);
  });

  it("refuses an empty scan without touching the network", async () => {
    const apiFetchImpl = jest.fn() as never;
    const res = await logScanAgain(
      { ...SCAN, items: [] },
      { dateKey: null, tag: "lunch", timeMode: "none", time: null },
      WINDOWS,
      { apiFetchImpl },
    );
    expect(res.ok).toBe(false);
    expect(apiFetchImpl).not.toHaveBeenCalled();
  });
});

describe("deleteSavedScan", () => {
  it("(id: e015c9db) DELETEs the scan so the web's history loses it", async () => {
    const apiFetchImpl = jest.fn(async () => ({})) as never;
    await deleteSavedScan("scan-1", { apiFetchImpl });
    expect(apiFetchImpl).toHaveBeenCalledWith(
      "/api/nutrition/scans/scan-1",
      expect.anything(),
      expect.objectContaining({ method: "DELETE" }),
    );
  });
});

describe("reviewItemsFromScan", () => {
  it("rebuilds review rows with per-serving nutrition, servings and pre-checked matches", () => {
    const rows = reviewItemsFromScan([
      {
        foodId: "6512c0ffee1234567890abcd",
        name: "Chicken bowl",
        servingSize: 1,
        servingUnit: "bowl",
        servings: 2,
        nutrition: { calories: 250, protein: 20, carbs: 20, fats: 8 },
        confidence: 0.9,
        matchKind: "food",
      },
    ]);
    expect(rows).toHaveLength(1);
    const row = rows[0]!;
    expect(row.multiplier).toBe(2);
    expect(row.unitLabel).toBe("bowl");
    expect(row.nutrition.calories).toBe(250);
    expect(row.matchChecked).toBe(true);
    expect(row.match?.kind).toBe("food");
    expect(row.removed).toBe(false);
  });

  it("falls back to serving defaults for a bare scan item", () => {
    const rows = reviewItemsFromScan([
      {
        name: "Rice",
        nutrition: { calories: 200, protein: 4, carbs: 44, fats: 0 },
      },
    ]);
    expect(rows[0]!.multiplier).toBe(1);
    expect(rows[0]!.unitLabel).toBe("serving");
    expect(rows[0]!.match).toBeNull();
  });
});

describe("scanDefaultTag", () => {
  it("keeps the saved tag, else the fallback", () => {
    expect(scanDefaultTag(SCAN, "dinner")).toBe("lunch");
    expect(scanDefaultTag({ ...SCAN, tag: undefined }, "dinner")).toBe("dinner");
  });
});
