import { goalLine } from "@/lib/goals/goalLine";

describe("goalLine", () => {
  it("returns null when target weight is not set or non-positive", () => {
    expect(goalLine("200", undefined, "lbs")).toBeNull();
    expect(goalLine("200", null, "lbs")).toBeNull();
    expect(goalLine("200", 0, "lbs")).toBeNull();
    expect(goalLine("200", -5, "lbs")).toBeNull();
  });

  it("shows target without diff when typed weight is empty or zero", () => {
    expect(goalLine("", 205, "lbs")).toBe("Goal: 205 lbs");
    expect(goalLine("0", 205, "lbs")).toBe("Goal: 205 lbs");
    expect(goalLine("", 80, "kg")).toBe("Goal: 80 kg");
  });

  it("indicates 'to go' when typed weight is above target in lbs", () => {
    expect(goalLine("209", 205, "lbs")).toBe("Goal: 205 lbs — 4 lbs to go");
  });

  it("indicates 'past it' when typed weight is below target in lbs", () => {
    expect(goalLine("200", 205, "lbs")).toBe("Goal: 205 lbs — 5 lbs past it");
  });

  it("indicates 'right there' when within the hold band (2 lbs for lbs)", () => {
    expect(goalLine("206", 205, "lbs")).toBe("Goal: 205 lbs — right there");
    expect(goalLine("204", 205, "lbs")).toBe("Goal: 205 lbs — right there");
    expect(goalLine("207", 205, "lbs")).toBe("Goal: 205 lbs — right there");
  });

  it("formats correctly for a kg member", () => {
    expect(goalLine("", 80, "kg")).toBe("Goal: 80 kg");
    expect(goalLine("82.5", 80, "kg")).toBe("Goal: 80 kg — 2.5 kg to go");
    expect(goalLine("76", 80, "kg")).toBe("Goal: 80 kg — 4 kg past it");
    expect(goalLine("80.8", 80, "kg")).toBe("Goal: 80 kg — right there");
  });
});
