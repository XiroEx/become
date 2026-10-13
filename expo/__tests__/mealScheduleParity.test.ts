/**
 * Meal schedule parity and acceptance criteria tests.
 *
 * Covers:
 *  - (id: e015ca97) Windows saved natively change the web's default tag at those times
 *  - (id: e015ca98) Leaving a tag unscheduled natively leaves it unscheduled on the web
 */

import {
  defaultTagAt,
  tagForMinutes,
  windowForTag,
  isScheduled,
  isOutsideWindow,
  anchorMinutesForTag,
  cleanMinutes,
  formatHHMM,
  parseTimeValue,
  type TagWindow,
} from "@/lib/nutrition/mealSchedule";

describe("Meal schedule parity & acceptance criteria", () => {
  describe("(id: e015ca97) Windows saved natively change the web's default tag at those times", () => {
    it("selects native saved window tags at their configured times on web", () => {
      // User sets up custom time windows natively:
      // - breakfast: 06:30 - 09:30 (390 - 570)
      // - brunch:    10:00 - 11:30 (600 - 690)  [custom tag]
      // - lunch:     11:30 - 14:00 (690 - 840)
      // - pre-workout: 14:30 - 16:00 (870 - 960) [custom tag]
      // - dinner:    18:00 - 20:30 (1080 - 1230)
      // - bedtime:   23:00 - 02:00 (1380 - 120) [midnight-wrapping tag]
      const nativeSavedWindows: TagWindow[] = [
        { tag: "breakfast", startMinutes: 390, endMinutes: 570 },
        { tag: "brunch", startMinutes: 600, endMinutes: 690 },
        { tag: "lunch", startMinutes: 690, endMinutes: 840 },
        { tag: "pre-workout", startMinutes: 870, endMinutes: 960 },
        { tag: "dinner", startMinutes: 1080, endMinutes: 1230 },
        { tag: "bedtime", startMinutes: 1380, endMinutes: 120 },
      ];

      // At 07:00 (420 min) -> breakfast
      expect(defaultTagAt(nativeSavedWindows, 420)).toBe("breakfast");

      // At 10:30 (630 min) -> brunch (normally would be fallback "breakfast" or "lunch")
      expect(defaultTagAt(nativeSavedWindows, 630)).toBe("brunch");

      // At 12:00 (720 min) -> lunch
      expect(defaultTagAt(nativeSavedWindows, 720)).toBe("lunch");

      // At 15:00 (900 min) -> pre-workout (normally would be fallback "snack")
      expect(defaultTagAt(nativeSavedWindows, 900)).toBe("pre-workout");

      // At 19:00 (1140 min) -> dinner
      expect(defaultTagAt(nativeSavedWindows, 1140)).toBe("dinner");

      // At 23:30 (1410 min) -> bedtime
      expect(defaultTagAt(nativeSavedWindows, 1410)).toBe("bedtime");

      // At 00:30 (30 min, past midnight) -> bedtime
      expect(defaultTagAt(nativeSavedWindows, 30)).toBe("bedtime");
    });

    it("prefers the narrower window when windows overlap (narrowest wins)", () => {
      // Lunch: 11:00 - 14:00 (180 mins)
      // Shake: 12:00 - 12:30 (30 mins)
      const windows: TagWindow[] = [
        { tag: "lunch", startMinutes: 660, endMinutes: 840 },
        { tag: "shake", startMinutes: 720, endMinutes: 750 },
      ];

      // At 11:30 -> lunch (shake hasn't started)
      expect(defaultTagAt(windows, 690)).toBe("lunch");

      // At 12:15 -> shake wins because 30 min window is narrower than 180 min
      expect(defaultTagAt(windows, 735)).toBe("shake");

      // At 13:00 -> lunch (shake ended)
      expect(defaultTagAt(windows, 780)).toBe("lunch");
    });

    it("falls back to standard day windows when a time is outside scheduled windows", () => {
      const windows: TagWindow[] = [
        { tag: "lunch", startMinutes: 720, endMinutes: 840 },
      ];

      // At 08:00 (480 min) -> fallback breakfast
      expect(defaultTagAt(windows, 480)).toBe("breakfast");

      // At 19:00 (1140 min) -> fallback dinner
      expect(defaultTagAt(windows, 1140)).toBe("dinner");

      // At 12:30 (750 min) -> saved lunch window
      expect(defaultTagAt(windows, 750)).toBe("lunch");
    });
  });

  describe("(id: e015ca98) Leaving a tag unscheduled natively leaves it unscheduled on the web", () => {
    it("leaves tags with null start/end unscheduled and never selects them as time defaults", () => {
      const windows: TagWindow[] = [
        { tag: "breakfast", startMinutes: 420, endMinutes: 600 },
        { tag: "morning-snack", startMinutes: null, endMinutes: null },
        { tag: "lunch", startMinutes: 720, endMinutes: 840 },
        { tag: "evening-snack", startMinutes: null, endMinutes: null },
        { tag: "dinner", startMinutes: 1080, endMinutes: 1260 },
      ];

      // 1. windowForTag returns null for unscheduled tags
      expect(windowForTag(windows, "morning-snack")).toBeNull();
      expect(windowForTag(windows, "evening-snack")).toBeNull();

      // 2. isScheduled is false for unscheduled tags
      const rawSnack = windows.find((w) => w.tag === "morning-snack");
      expect(isScheduled(rawSnack)).toBe(false);

      // 3. tagForMinutes never matches an unscheduled tag across any minute of the day
      for (let minute = 0; minute < 1440; minute += 30) {
        const tag = tagForMinutes(windows, minute);
        expect(tag).not.toBe("morning-snack");
        expect(tag).not.toBe("evening-snack");
      }

      // 4. isOutsideWindow is always false for unscheduled tags (never flagged as unusual)
      for (let minute = 0; minute < 1440; minute += 60) {
        expect(isOutsideWindow(windows, "morning-snack", minute)).toBe(false);
        expect(isOutsideWindow(windows, "evening-snack", minute)).toBe(false);
      }
    });

    it("positions untimed entries for unscheduled tags at the end of the scheduled meal above them", () => {
      // Order: Breakfast (7-10am), Morning Snack (unscheduled), Lunch (12-2pm), Afternoon Snack (unscheduled), Dinner (6-9pm)
      const windows: TagWindow[] = [
        { tag: "breakfast", startMinutes: 420, endMinutes: 600 },
        { tag: "morning-snack", startMinutes: null, endMinutes: null },
        { tag: "lunch", startMinutes: 720, endMinutes: 840 },
        { tag: "afternoon-snack", startMinutes: null, endMinutes: null },
        { tag: "dinner", startMinutes: 1080, endMinutes: 1260 },
      ];

      // Morning snack anchors to Breakfast end (600 = 10:00 am)
      expect(anchorMinutesForTag(windows, "morning-snack")).toBe(600);

      // Afternoon snack anchors to Lunch end (840 = 2:00 pm)
      expect(anchorMinutesForTag(windows, "afternoon-snack")).toBe(840);
    });

    it("cleans and preserves null values during save without converting them to 0", () => {
      expect(cleanMinutes(null)).toBeNull();
      expect(cleanMinutes(undefined)).toBeNull();
      expect(cleanMinutes("")).toBeNull();
      expect(cleanMinutes(0)).toBe(0); // Midnight is a real 0, not null
    });

    it("parses time values with parseTimeValue and formats cleanly", () => {
      expect(parseTimeValue("08:30")).toBe(510);
      expect(parseTimeValue("8:30")).toBe(510);
      expect(parseTimeValue("8:30 am")).toBe(510);
      expect(parseTimeValue("8:30 pm")).toBe(1230);
      expect(parseTimeValue("")).toBeNull();
      expect(formatHHMM(510)).toBe("08:30");
      expect(formatHHMM(1230)).toBe("20:30");
    });
  });
});
