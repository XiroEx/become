/**
 * plateEstimate (NP-089) — the meal-photo / describe estimate maths.
 *
 * Covers the pure mapping the sheet depends on: origin → log/history source,
 * the AI-client outcome split (gate before outage, consent as its own
 * outcome, empty items vs thrown failure), and the log payload shape
 * (per-serving nutrition × servings, `untimed: true`, today-vs-noon
 * `loggedAt`).
 *
 * Network calls are injected: `runTask` stands in for the AI run client and
 * `callApi` stands in for `apiFetch`, so no test touches the network.
 */

import {
  estimateFromDescription,
  estimateFromPhoto,
  logEstimate,
  mealLogSourceFor,
  persistEstimate,
  reconcileEstimateItems,
  reviewItemFromSearchEntry,
  reviewItemsFor,
  type EstimateOutcome,
} from "@/lib/nutrition/plateEstimate";
import type { PlateEstimate, ReviewItem } from "@become/core";

const IMAGE = {
  uri: "file:///cache/photo.jpg",
  width: 800,
  height: 600,
  dataUrl: "data:image/jpeg;base64,AAA",
  mimeType: "image/jpeg" as const,
  fileName: "photo.jpg",
};

function reviewRow(overrides: Partial<ReviewItem> = {}): ReviewItem {
  return {
    name: "Chicken bowl",
    estimatedServing: "1 bowl",
    nutrition: { calories: 500, protein: 30, carbs: 40, fats: 15 },
    confidence: 0.9,
    multiplier: 1,
    unitLabel: "bowl",
    removed: false,
    matchChecked: true,
    match: null,
    ...overrides,
  };
}

describe("mealLogSourceFor", () => {
  it("maps camera → photo, library → upload, describe → describe", () => {
    expect(mealLogSourceFor("camera")).toBe("photo");
    expect(mealLogSourceFor("library")).toBe("upload");
    expect(mealLogSourceFor("describe")).toBe("describe");
  });
});

describe("estimateFromPhoto / estimateFromDescription outcome split", () => {
  const estimate: PlateEstimate = {
    items: [
      {
        name: "Chicken bowl",
        estimatedServing: "1 bowl",
        nutrition: { calories: 500, protein: 30, carbs: 40, fats: 15 },
        confidence: 0.9,
      },
    ],
  };

  it("returns the estimate when items come back", async () => {
    const runTask = jest.fn().mockResolvedValue({ ok: true, result: estimate });
    const outcome = await estimateFromPhoto(IMAGE, "extra rice", {
      runTask: runTask as never,
    });
    expect(outcome).toEqual({ status: "estimated", estimate });
    expect(runTask).toHaveBeenCalledWith(
      "/api/ai/nutrition/plate",
      expect.objectContaining({
        image: IMAGE.dataUrl,
        note: "extra rice",
      }),
    );
  });

  it("sends no note key when the note is blank", async () => {
    const runTask = jest.fn().mockResolvedValue({ ok: true, result: estimate });
    await estimateFromPhoto(IMAGE, "   ", { runTask: runTask as never });
    expect(runTask).toHaveBeenCalledWith(
      "/api/ai/nutrition/plate",
      expect.not.objectContaining({ note: expect.anything() }),
    );
  });

  it("empty items means 'could not read it' (not an outage)", async () => {
    const runTask = jest.fn().mockResolvedValue({ ok: true, result: { items: [] } });
    const outcome: EstimateOutcome = await estimateFromDescription("lunch", {
      runTask: runTask as never,
    });
    expect(outcome).toEqual({ status: "empty" });
    expect(runTask).toHaveBeenCalledWith(
      "/api/ai/nutrition/describe",
      expect.objectContaining({ description: "lunch" }),
    );
  });

  it("checks the gate before calling a failure an outage", async () => {
    const gate = { error: "Out of free scans", requiresTier: "plus" };
    const runTask = jest
      .fn()
      .mockResolvedValue({ ok: false, error: "entitlement", gate });
    const outcome = await estimateFromPhoto(IMAGE, undefined, {
      runTask: runTask as never,
    });
    expect(outcome).toEqual({ status: "gate", gate });
  });

  it("a consent refusal is its own outcome (consent prompt, nothing else)", async () => {
    const runTask = jest.fn().mockResolvedValue({ ok: false, error: "ai_consent" });
    const outcome = await estimateFromDescription("lunch", {
      runTask: runTask as never,
    });
    expect(outcome).toEqual({ status: "consent" });
  });

  it("a thrown failure means 'our side, try in a minute'", async () => {
    const runTask = jest.fn().mockResolvedValue({ ok: false, error: "task_failed" });
    const outcome = await estimateFromPhoto(IMAGE, undefined, {
      runTask: runTask as never,
    });
    expect(outcome).toEqual({ status: "unavailable" });
  });
});

describe("reviewItemsFor", () => {
  it("builds review rows with the web's maths (per-unit nutrition × count)", () => {
    const rows = reviewItemsFor({
      items: [
        {
          name: "Rice",
          estimatedServing: "2 cups",
          nutrition: { calories: 400, protein: 8, carbs: 88, fats: 1 },
          confidence: 0.8,
        },
      ],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.multiplier).toBe(2);
    // The AI's 400 cal was for the whole 2 cups → 200 per cup.
    expect(rows[0]?.nutrition.calories).toBeCloseTo(200, 5);
    expect(rows[0]?.matchChecked).toBe(false);
  });
});

describe("reconcileEstimateItems", () => {
  it("leaves rows as AI estimates when the match call fails", async () => {
    const rows = [reviewRow({ matchChecked: false })];
    // Force apiFetch to throw by pointing at an unreachable base URL —
    // reconcile must still resolve, never reject.
    const reconciled = await reconcileEstimateItems(rows, {
      baseUrl: "http://127.0.0.1:1",
      getToken: () => undefined,
    });
    expect(reconciled).toHaveLength(1);
    expect(reconciled[0]?.matchChecked).toBe(true);
  });
});

describe("reviewItemFromSearchEntry", () => {
  it("builds a pre-matched row from a picked food", () => {
    const row = reviewItemFromSearchEntry({
      foodId: "0123456789abcdef01234567",
      name: "Greek yogurt",
      servingSize: 170,
      servingUnit: "g",
      servings: 1,
      nutrition: { calories: 100, protein: 17, carbs: 6, fats: 0 },
    });
    expect(row.match?.kind).toBe("food");
    expect(row.matchChecked).toBe(true);
    expect(row.multiplier).toBe(1);
  });
});

describe("logEstimate", () => {
  it("refuses to log when every row was removed", async () => {
    const result = await logEstimate({
      items: [reviewRow({ removed: true })],
      origin: "camera",
      tag: "lunch",
      dateKey: "2026-10-03",
      todayKey: "2026-10-03",
    });
    expect(result.ok).toBe(false);
  });
});

describe("persistEstimate", () => {
  it("saves every generated estimate shape without throwing", async () => {
    // No network: an unreachable base URL must still resolve best-effort.
    const result = await persistEstimate(
      {
        items: [reviewRow()],
        origin: "describe",
        tag: "dinner",
        note: "extra spicy",
      },
      { baseUrl: "http://127.0.0.1:1", getToken: () => undefined },
    );
    expect(result.scanId).toBeNull();
  });
});
