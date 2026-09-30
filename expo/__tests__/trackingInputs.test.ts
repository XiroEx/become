import {
  normalizeTracking,
  tracksWeight,
  tracksTime,
  setUnitLabel,
} from "@/lib/shared/training/tracking";
import { setInputsForTrackingType } from "@/components/live/LiveSetRow";

describe("tracking parity in expo", () => {
  it("normalizes default / undefined / null to reps_weight", () => {
    expect(normalizeTracking(undefined)).toBe("reps_weight");
    expect(normalizeTracking(null)).toBe("reps_weight");
    expect(normalizeTracking("")).toBe("reps_weight");
    expect(normalizeTracking("weight_reps")).toBe("reps_weight");
    expect(normalizeTracking("reps_weight")).toBe("reps_weight");
  });

  it("normalizes aliases correctly", () => {
    expect(normalizeTracking("reps")).toBe("reps_weight");
    expect(normalizeTracking("weight")).toBe("reps_weight");
    expect(normalizeTracking("bodyweight")).toBe("reps_bodyweight");
    expect(normalizeTracking("duration")).toBe("time");
    expect(normalizeTracking("cardio")).toBe("time");
    expect(normalizeTracking("distance")).toBe("time_distance");
    expect(normalizeTracking("interval")).toBe("intervals");
  });

  it("checks dimensions accurately", () => {
    expect(tracksWeight("reps_weight")).toBe(true);
    expect(tracksWeight("reps_bodyweight")).toBe(false);
    expect(tracksTime("time")).toBe(true);
    expect(tracksTime("time_distance")).toBe(true);
    expect(tracksTime("intervals")).toBe(true);
    expect(tracksTime("reps_weight")).toBe(false);
  });

  it("formats unit labels properly", () => {
    expect(setUnitLabel("reps_weight", 1)).toBe("Set");
    expect(setUnitLabel("reps_weight", 10)).toBe("Sets");
    expect(setUnitLabel("time", 1)).toBe("Round");
    expect(setUnitLabel("time", 2)).toBe("Rounds");
  });

  it("setInputsForTrackingType maps dimensions to inputs", () => {
    expect(setInputsForTrackingType(undefined)).toEqual({
      weight: true,
      reps: true,
      duration: false,
      distance: false,
    });
    expect(setInputsForTrackingType("reps_bodyweight")).toEqual({
      weight: false,
      reps: true,
      duration: false,
      distance: false,
    });
    expect(setInputsForTrackingType("time")).toEqual({
      weight: false,
      reps: false,
      duration: true,
      distance: false,
    });
    expect(setInputsForTrackingType("time_distance")).toEqual({
      weight: false,
      reps: false,
      duration: true,
      distance: true,
    });
  });
});
