import { setInputsForTrackingType } from "@/lib/live/trackingInputs";

describe("setInputsForTrackingType", () => {
  it("defaults to weight + reps for undefined / weight_reps", () => {
    for (const t of [undefined, null, "", "weight_reps", "reps_weight"]) {
      expect(setInputsForTrackingType(t)).toEqual({
        weight: true,
        reps: true,
        duration: false,
        distance: false,
      });
    }
  });

  it("bodyweight reps tracking shows reps only", () => {
    expect(setInputsForTrackingType("reps")).toEqual({
      weight: false,
      reps: true,
      duration: false,
      distance: false,
    });
  });

  it("time tracking (planks/holds) shows duration only", () => {
    expect(setInputsForTrackingType("time")).toEqual({
      weight: false,
      reps: false,
      duration: true,
      distance: false,
    });
  });

  it("time_distance (cardio) shows duration + distance", () => {
    expect(setInputsForTrackingType("time_distance")).toEqual({
      weight: false,
      reps: false,
      duration: true,
      distance: true,
    });
  });

  it("weight_time shows weight + duration", () => {
    expect(setInputsForTrackingType("weight_time")).toEqual({
      weight: true,
      reps: false,
      duration: true,
      distance: false,
    });
  });

  it("intervals counts as a duration type", () => {
    expect(setInputsForTrackingType("intervals").duration).toBe(true);
  });

  it("an unmappable type falls back to weight + reps (always loggable)", () => {
    expect(setInputsForTrackingType("mystery")).toEqual({
      weight: true,
      reps: true,
      duration: false,
      distance: false,
    });
  });

  it("is case-insensitive and trims", () => {
    expect(setInputsForTrackingType("  TIME_DISTANCE  ")).toEqual({
      weight: false,
      reps: false,
      duration: true,
      distance: true,
    });
  });
});
