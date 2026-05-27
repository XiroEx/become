import {
  detectBellStyle,
  totalWeightHelper,
  weightLabel,
} from "@/lib/live/bellStyle";

describe("detectBellStyle", () => {
  it("detects 'Dumbbell Press' → dumbbell", () => {
    expect(detectBellStyle("Dumbbell Press")).toBe("dumbbell");
  });

  it("detects 'DB Row' short form → dumbbell", () => {
    expect(detectBellStyle("DB Row")).toBe("dumbbell");
  });

  it("detects 'Dumbbells Curl' plural → dumbbell", () => {
    expect(detectBellStyle("Dumbbells Curl")).toBe("dumbbell");
  });

  it("detects 'Kettlebell Swing' → kettlebell", () => {
    expect(detectBellStyle("Kettlebell Swing")).toBe("kettlebell");
  });

  it("detects 'KB Snatch' short form → kettlebell", () => {
    expect(detectBellStyle("KB Snatch")).toBe("kettlebell");
  });

  it("detects 'Barbell Bench Press' → barbell", () => {
    expect(detectBellStyle("Barbell Bench Press")).toBe("barbell");
  });

  it("detects 'BB Squat' short form → barbell", () => {
    expect(detectBellStyle("BB Squat")).toBe("barbell");
  });

  it("is case-insensitive", () => {
    expect(detectBellStyle("dumbbell row")).toBe("dumbbell");
    expect(detectBellStyle("KETTLEBELL CLEAN")).toBe("kettlebell");
  });

  it("defaults to 'other' for non-implement exercises", () => {
    expect(detectBellStyle("Push-up")).toBe("other");
    expect(detectBellStyle("Plank")).toBe("other");
    expect(detectBellStyle("")).toBe("other");
  });

  it("prefers kettlebell over dumbbell when both substrings present", () => {
    // Edge: 'kettlebell + dumbbell complex' — we still want KB to win
    // because KB is the more specific implement.
    expect(detectBellStyle("Kettlebell + Dumbbell complex")).toBe("kettlebell");
  });
});

describe("weightLabel", () => {
  it("returns 'Weight per DB (lbs)' for dumbbell", () => {
    expect(weightLabel("dumbbell")).toBe("Weight per DB (lbs)");
  });
  it("returns 'Weight per KB (lbs)' for kettlebell", () => {
    expect(weightLabel("kettlebell")).toBe("Weight per KB (lbs)");
  });
  it("returns 'Weight (lbs)' for barbell + other", () => {
    expect(weightLabel("barbell")).toBe("Weight (lbs)");
    expect(weightLabel("other")).toBe("Weight (lbs)");
  });
});

describe("totalWeightHelper", () => {
  it("returns '= X lbs total' for dumbbell with positive perBell", () => {
    expect(totalWeightHelper("dumbbell", 50)).toBe("= 100 lbs total");
  });
  it("returns null for kettlebell (single-bell or unilateral)", () => {
    expect(totalWeightHelper("kettlebell", 35)).toBeNull();
  });
  it("returns null for barbell", () => {
    expect(totalWeightHelper("barbell", 135)).toBeNull();
  });
  it("returns null for null/undefined weight", () => {
    expect(totalWeightHelper("dumbbell", null)).toBeNull();
    expect(totalWeightHelper("dumbbell", undefined)).toBeNull();
  });
  it("returns null for non-positive weight", () => {
    expect(totalWeightHelper("dumbbell", 0)).toBeNull();
    expect(totalWeightHelper("dumbbell", -10)).toBeNull();
  });
});
