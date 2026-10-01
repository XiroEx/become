import { goalLine } from "@/lib/goalLine";

describe("goalLine (NP-105)", () => {
  it("returns null when targetWeight is null, undefined, or <= 0", () => {
    expect(goalLine("180", null, "lbs")).toBeNull();
    expect(goalLine("180", undefined, "lbs")).toBeNull();
    expect(goalLine("180", 0, "lbs")).toBeNull();
    expect(goalLine("180", -5, "lbs")).toBeNull();
  });

  it("returns static goal when typedWeight is empty or non-positive", () => {
    expect(goalLine("", 150, "lbs")).toBe("Goal: 150 lbs");
    expect(goalLine("0", 150, "lbs")).toBe("Goal: 150 lbs");
    expect(goalLine("", 70, "kg")).toBe("Goal: 70 kg");
  });

  it("says 'right there' when within holdBand (2 lbs for lbs, 1 kg for kg)", () => {
    // 2 lbs hold band for imperial
    expect(goalLine("151", 150, "lbs")).toBe("Goal: 150 lbs — right there");
    expect(goalLine("149", 150, "lbs")).toBe("Goal: 150 lbs — right there");
    expect(goalLine("152", 150, "lbs")).toBe("Goal: 150 lbs — right there");

    // 1 kg hold band for metric
    expect(goalLine("70.5", 70, "kg")).toBe("Goal: 70 kg — right there");
    expect(goalLine("69.5", 70, "kg")).toBe("Goal: 70 kg — right there");
    expect(goalLine("71.0", 70, "kg")).toBe("Goal: 70 kg — right there");
  });

  it("says 'to go' when typed weight is greater than target and outside holdBand", () => {
    expect(goalLine("155", 150, "lbs")).toBe("Goal: 150 lbs — 5 lbs to go");
    expect(goalLine("75", 70, "kg")).toBe("Goal: 70 kg — 5 kg to go");
  });

  it("says 'past it' when typed weight is less than target and outside holdBand", () => {
    expect(goalLine("145", 150, "lbs")).toBe("Goal: 150 lbs — 5 lbs past it");
    expect(goalLine("67", 70, "kg")).toBe("Goal: 70 kg — 3 kg past it");
  });

  it("handles decimal formatting for kg amounts under 10", () => {
    expect(goalLine("72.4", 70, "kg")).toBe("Goal: 70 kg — 2.4 kg to go");
  });
});
