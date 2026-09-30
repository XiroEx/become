import {
  validateScheduleSettings,
  DAY_LABELS,
} from "@/lib/schedule/scheduleSettings";

describe("validateScheduleSettings", () => {
  it("accepts the canonical Mon/Wed/Fri schedule", () => {
    const v = validateScheduleSettings({
      trainingDays: [1, 3, 5],
    });
    expect(v.ok).toBe(true);
    expect(v.errors).toEqual([]);
  });

  it("rejects empty trainingDays", () => {
    const v = validateScheduleSettings({
      trainingDays: [],
    });
    expect(v.ok).toBe(false);
    expect(v.errors).toContain("training-days-empty");
  });

  it("rejects trainingDays out of 0-6 range", () => {
    const v = validateScheduleSettings({
      trainingDays: [1, 7],
    });
    expect(v.errors).toContain("training-days-out-of-range");
  });

  it("rejects duplicate trainingDays", () => {
    const v = validateScheduleSettings({
      trainingDays: [1, 1, 3],
    });
    expect(v.errors).toContain("training-days-duplicate");
  });

  it("DAY_LABELS expose Sun-Sat", () => {
    expect(DAY_LABELS[0]).toBe("Sun");
    expect(DAY_LABELS[6]).toBe("Sat");
  });
});
