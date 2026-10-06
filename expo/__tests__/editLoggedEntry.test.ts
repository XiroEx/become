import {
  deriveEditVariantAndInitial,
} from "../components/nutrition/EditLogItemSheet";
import {
  editLoggedItem,
  editLoggedMeal,
  formatTime12Hour,
  mealLogTagPatch,
  mealLogTimeInputValue,
  mealLogTimePatch,
  parseTime12Hour,
} from "../lib/nutrition/editLoggedEntry";
import * as mindCache from "../lib/mind/sessionCache";

jest.mock("../lib/mind/sessionCache", () => ({
  invalidateMindSession: jest.fn(async () => {}),
  MIND_AI_PLAN_KEY: "mind-ai-plan",
}));

describe("editLoggedEntry (NP-095)", () => {
  const mockApiFetch = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockApiFetch.mockReset();
    mockApiFetch.mockResolvedValue({ success: true });
  });

  describe("mealLogTimeInputValue / mealLogTimePatch", () => {
    it("renders an empty field for untimed logs", () => {
      expect(mealLogTimeInputValue("2026-10-01T12:30:00.000Z", true)).toBe("");
      expect(mealLogTimeInputValue(undefined, false)).toBe("");
    });

    it("round-trips a clock time through the patch", () => {
      const loggedAt = "2026-10-01T12:00:00.000Z";
      const patch = mealLogTimePatch(loggedAt, "14:30");
      expect(patch.untimed).toBe(false);
      expect(patch.loggedAt).toContain("14:30");
    });

    it("clearing the time returns to the explicit no-time state", () => {
      expect(mealLogTimePatch("2026-10-01T12:00:00.000Z", "")).toEqual({
        untimed: true,
      });
    });
  });

  describe("formatTime12Hour / parseTime12Hour (NP-264)", () => {
    it("renders the web's 12-hour display from the 24-hour wire format", () => {
      expect(formatTime12Hour("04:00")).toBe("4:00 AM");
      expect(formatTime12Hour("16:00")).toBe("4:00 PM");
      expect(formatTime12Hour("00:00")).toBe("12:00 AM");
      expect(formatTime12Hour("12:30")).toBe("12:30 PM");
      expect(formatTime12Hour("")).toBe("");
    });

    it("parses a typed 12-hour time back to the 24-hour wire format", () => {
      expect(parseTime12Hour("4:00 AM")).toBe("04:00");
      expect(parseTime12Hour("4:00pm")).toBe("16:00");
      expect(parseTime12Hour("12:00 AM")).toBe("00:00");
      expect(parseTime12Hour("12:30 PM")).toBe("12:30");
    });

    it("accepts a bare 24-hour fallback and treats blank as cleared", () => {
      expect(parseTime12Hour("16:00")).toBe("16:00");
      expect(parseTime12Hour("")).toBe("");
      expect(parseTime12Hour("   ")).toBe("");
    });

    it("rejects nonsense rather than silently guessing", () => {
      expect(parseTime12Hour("not a time")).toBeNull();
      expect(parseTime12Hour("13:00 PM")).toBeNull();
      expect(parseTime12Hour("4:75 AM")).toBeNull();
    });

    it("round-trips every hour of the day", () => {
      for (let h = 0; h < 24; h++) {
        const hhmm = `${String(h).padStart(2, "0")}:15`;
        expect(parseTime12Hour(formatTime12Hour(hhmm))).toBe(hhmm);
      }
    });
  });

  describe("mealLogTagPatch", () => {
    it("emits tag/fromTag only when the tag actually moved", () => {
      expect(mealLogTagPatch("lunch", "dinner")).toEqual({
        tag: "dinner",
        fromTag: "lunch",
      });
      expect(mealLogTagPatch("lunch", "lunch")).toEqual({});
      expect(mealLogTagPatch("lunch", "")).toEqual({});
    });
  });

  describe("deriveEditVariantAndInitial", () => {
    it("restores the logged quantity + unit, not servings × servingSize", () => {
      const { initial } = deriveEditVariantAndInitial({
        name: "Oats",
        servingSize: 40,
        servingUnit: "g",
        servings: 2,
        nutrition: { calories: 150, protein: 5, carbs: 27, fats: 3 },
        loggedQuantity: 80,
        loggedUnit: "g",
      } as never);
      expect(initial).toEqual({ quantity: 80, unit: "g" });
    });

    it("backfills old writes from servings × servingSize", () => {
      const { initial } = deriveEditVariantAndInitial({
        name: "Oats",
        servingSize: 40,
        servingUnit: "g",
        servings: 2,
        nutrition: { calories: 150, protein: 5, carbs: 27, fats: 3 },
      } as never);
      expect(initial).toEqual({ quantity: 80, unit: "g" });
    });
  });

  describe("(id: e015c8cc) changing quantity PATCHes servings + logged provenance", () => {
    it("sends the picker's multiplier and provenance to the item route", async () => {
      const res = await editLoggedItem({
        logId: "log-1",
        itemId: "item-1",
        servings: 2,
        loggedQuantity: 80,
        loggedUnit: "g",
        apiFetch: mockApiFetch as never,
        token: "t",
      });
      expect(res.success).toBe(true);
      expect(mockApiFetch).toHaveBeenCalledTimes(1);
      const [path, , init] = mockApiFetch.mock.calls[0]!;
      expect(path).toBe("/api/meal-logs/log-1/items/item-1");
      expect(init.method).toBe("PATCH");
      // Same shape the web's EditFoodModal sends: multiplier back-compat +
      // the logged* provenance the picker restores from.
      expect(init.body).toEqual(
        expect.objectContaining({
          servings: 2,
          loggedQuantity: 80,
          loggedUnit: "g",
        }),
      );
      // The day is refetched on save (mind session invalidated like every log write).
      expect(mindCache.invalidateMindSession).toHaveBeenCalled();
    });
  });

  describe("(id: e015c8ce) saving without macro edits leaves nutrition untouched", () => {
    it("omits nutrition unless the member corrected the macros", async () => {
      await editLoggedItem({
        logId: "log-1",
        itemId: "item-1",
        servings: 1,
        loggedQuantity: 40,
        loggedUnit: "g",
        apiFetch: mockApiFetch as never,
        token: "t",
      });
      const [, , init] = mockApiFetch.mock.calls[0]!;
      expect(init.body).not.toHaveProperty("nutrition");
    });

    it("sends nutrition wholesale only when corrected", async () => {
      await editLoggedItem({
        logId: "log-1",
        itemId: "item-1",
        servings: 1,
        loggedQuantity: 40,
        loggedUnit: "g",
        nutrition: { calories: 160, protein: 6, carbs: 28, fats: 3 },
        apiFetch: mockApiFetch as never,
        token: "t",
      });
      const [, , init] = mockApiFetch.mock.calls[0]!;
      expect(init.body.nutrition).toEqual({
        calories: 160,
        protein: 6,
        carbs: 28,
        fats: 3,
      });
    });
  });

  describe("(id: e015c8cd) moving lunch to dinner PATCHes the meal route", () => {
    it("moves the whole log with tag/fromTag", async () => {
      const res = await editLoggedMeal({
        logId: "log-1",
        tag: "dinner",
        fromTag: "lunch",
        apiFetch: mockApiFetch as never,
        token: "t",
      });
      expect(res.success).toBe(true);
      expect(mockApiFetch).toHaveBeenCalledTimes(1);
      const [path, , init] = mockApiFetch.mock.calls[0]!;
      // The whole-meal route — every item in the log moves together.
      expect(path).toBe("/api/meal-logs/log-1");
      expect(init.method).toBe("PATCH");
      expect(init.body).toEqual(
        expect.objectContaining({ tag: "dinner", fromTag: "lunch" }),
      );
      expect(mindCache.invalidateMindSession).toHaveBeenCalled();
    });

    it("refuses to save with no changes", async () => {
      await expect(
        editLoggedMeal({
          logId: "log-1",
          apiFetch: mockApiFetch as never,
          token: "t",
        }),
      ).rejects.toThrow("Nothing to save");
      expect(mockApiFetch).not.toHaveBeenCalled();
    });
  });
});
