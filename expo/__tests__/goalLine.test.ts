import { goalLine } from "@/lib/checkin/goalLine";

describe("goalLine helper (NP-105 parity with web)", () => {
  it("returns null when targetWeight is undefined, null, or non-positive", () => {
    expect(goalLine("180", undefined, "lbs")).toBeNull();
    expect(goalLine("180", null, "lbs")).toBeNull();
    expect(goalLine("180", 0, "lbs")).toBeNull();
    expect(goalLine("180", -5, "lbs")).toBeNull();
  });

  it("shows only target when typed weight is empty or non-positive", () => {
    expect(goalLine("", 180, "lbs")).toBe("Goal: 180 lbs");
    expect(goalLine("0", 180, "lbs")).toBe("Goal: 180 lbs");
    expect(goalLine("-10", 180, "lbs")).toBe("Goal: 180 lbs");
    expect(goalLine("", 75, "kg")).toBe("Goal: 75 kg");
  });

  it("shows 'right there' within holdBand (2 lbs for imperial, 1 kg for metric)", () => {
    // Imperial (holdBand = 2)
    expect(goalLine("181", 180, "lbs")).toBe("Goal: 180 lbs — right there");
    expect(goalLine("179", 180, "lbs")).toBe("Goal: 180 lbs — right there");
    expect(goalLine("182", 180, "lbs")).toBe("Goal: 180 lbs — right there");

    // Metric (holdBand = 1)
    expect(goalLine("75.5", 75, "kg")).toBe("Goal: 75 kg — right there");
    expect(goalLine("74.2", 75, "kg")).toBe("Goal: 75 kg — right there");
  });

  it("shows 'to go' when typed weight is above target and outside hold band", () => {
    expect(goalLine("190", 180, "lbs")).toBe("Goal: 180 lbs — 10 lbs to go");
    expect(goalLine("80", 75, "kg")).toBe("Goal: 75 kg — 5 kg to go");
  });

  it("shows 'past it' when typed weight is below target and outside hold band", () => {
    expect(goalLine("170", 180, "lbs")).toBe("Goal: 180 lbs — 10 lbs past it");
    expect(goalLine("70", 75, "kg")).toBe("Goal: 75 kg — 5 kg past it");
  });

  it("formats decimal weights correctly for kg members", () => {
    expect(goalLine("72.5", 75.3, "kg")).toBe("Goal: 75.3 kg — 2.8 kg past it");
  });
});
