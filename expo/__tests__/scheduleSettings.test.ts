import {
  validateScheduleSettings,
  DAY_LABELS,
} from "@/lib/schedule/scheduleSettings";

describe("validateScheduleSettings", () => {
  it("accepts the canonical Mon/Wed/Fri schedule", () => {
    const v = validateScheduleSettings({
      trainingDays: [1, 3, 5],
      startDate: "2026-05-27",
      autoAdvance: true,
    });
    expect(v.ok).toBe(true);
    expect(v.errors).toEqual([]);
  });

  it("rejects empty trainingDays", () => {
    const v = validateScheduleSettings({
      trainingDays: [],
      startDate: "2026-05-27",
      autoAdvance: false,
    });
    expect(v.ok).toBe(false);
    expect(v.errors).toContain("training-days-empty");
  });

  it("rejects trainingDays out of 0-6 range", () => {
    const v = validateScheduleSettings({
      trainingDays: [1, 7],
      startDate: "2026-05-27",
      autoAdvance: false,
    });
    expect(v.errors).toContain("training-days-out-of-range");
  });

  it("rejects duplicate trainingDays", () => {
    const v = validateScheduleSettings({
      trainingDays: [1, 1, 3],
      startDate: "2026-05-27",
      autoAdvance: false,
    });
    expect(v.errors).toContain("training-days-duplicate");
  });

  it("rejects malformed start-date", () => {
    const v = validateScheduleSettings({
      trainingDays: [1],
      startDate: "May 27, 2026",
      autoAdvance: false,
    });
    expect(v.errors).toContain("start-date-bad-format");
  });

  it("rejects an impossible date (Feb 30)", () => {
    const v = validateScheduleSettings({
      trainingDays: [1],
      startDate: "2026-02-30",
      autoAdvance: false,
    });
    expect(v.errors).toContain("start-date-impossible");
  });

  it("DAY_LABELS expose Sun-Sat", () => {
    expect(DAY_LABELS[0]).toBe("Sun");
    expect(DAY_LABELS[6]).toBe("Sat");
  });
});
