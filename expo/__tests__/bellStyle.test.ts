import {
  getBellWeightInfo,
  bellWeightLabel,
  weightQuickPicks,
} from "@/lib/shared/training/dumbbellWeight";
import { totalWeightHelper } from "@/components/live/LiveSetRow";

describe("dumbbellWeight parity", () => {
  it("detects dumbbell from equipment or name", () => {
    expect(getBellWeightInfo({ equipment: ["dumbbell"] }).style).toBe("dumbbell");
    expect(getBellWeightInfo({ name: "DB Incline Press" }).style).toBe("dumbbell");
    expect(getBellWeightInfo({ name: "Dumbbell Press" }).style).toBe("dumbbell");
  });

  it("detects kettlebell from equipment or name", () => {
    expect(getBellWeightInfo({ equipment: ["kettlebell"] }).style).toBe("kettlebell");
    expect(getBellWeightInfo({ name: "Kettlebell Swing" }).style).toBe("kettlebell");
    expect(getBellWeightInfo({ name: "KB Snatch" }).style).toBe("kettlebell");
  });

  it("returns null style for barbell or non-bell movements", () => {
    expect(getBellWeightInfo({ equipment: ["barbell"] }).style).toBeNull();
    expect(getBellWeightInfo({ name: "Barbell Bench Press", equipment: ["barbell"] }).style).toBeNull();
    expect(getBellWeightInfo({ name: "Push-up", equipment: ["bodyweight"] }).style).toBeNull();
    expect(getBellWeightInfo(null).style).toBeNull();
  });

  it("does not let aliases misclassify barbell lifts as dumbbells (NP-028 9/9 fix)", () => {
    expect(
      getBellWeightInfo({
        name: "Barbell Bench Press",
        aliases: ["Bench Press (DB/bar)"],
        equipment: ["barbell", "bench"],
      }).style,
    ).toBeNull();
  });
});

describe("bellWeightLabel", () => {
  it("returns 'Weight per DB (lbs)' for dumbbell", () => {
    expect(bellWeightLabel("dumbbell")).toBe("Weight per DB (lbs)");
  });
  it("returns 'Weight per KB (lbs)' for kettlebell", () => {
    expect(bellWeightLabel("kettlebell")).toBe("Weight per KB (lbs)");
  });
  it("returns 'Weight (lbs)' for null and others", () => {
    expect(bellWeightLabel(null)).toBe("Weight (lbs)");
  });
});

describe("weightQuickPicks", () => {
  it("returns per-hand quick picks for dumbbell", () => {
    expect(weightQuickPicks("dumbbell")).toEqual([10, 20, 30, 40, 50]);
  });
  it("returns kettlebell quick picks", () => {
    expect(weightQuickPicks("kettlebell")).toEqual([18, 26, 35, 44, 53]);
  });
  it("returns barbell quick picks for default/null", () => {
    expect(weightQuickPicks(null)).toEqual([45, 95, 135, 185, 225]);
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
