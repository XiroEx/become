import * as fs from "fs";
import * as path from "path";
import {
  bellWeightLabel,
  getBellWeightInfo,
  isFloorsExercise,
  normalizeTracking,
  weightQuickPicks,
} from "@become/core";
import { setInputsFor } from "@/components/live/LiveSetRow";

// NP-058. `lib/live/bellStyle.ts` and `lib/live/trackingInputs.ts` were the
// native app's own answers to two questions the web had already answered, and
// they answered them differently:
//
//   * bellStyle read the implement off the exercise NAME with a regex the web
//     replaced on 2026-09-09 — because the name is not where the answer is. A
//     Chest-Supported Row is dumbbell work and never says so; a Barbell Bench
//     Press is aliased "Bench Press (DB/bar)" and is not. The name rule got
//     both backwards, then doubled the load it printed.
//   * trackingInputs matched trackingType by substring against a vocabulary
//     ("weight_reps", "reps") that the web does not use, so a bodyweight
//     exercise was asked for a weight and a `none` exercise for both.
//
// Both are deleted. The rules now come from `@become/core`, which carries a
// copy of the web's own modules (see shared/core/src/training/index.ts), kept
// honest by webapp/tests/unit/nativeParity/trainingModules.test.ts.

const EXPO_ROOT = path.resolve(__dirname, "..");

describe("the retired native copies are gone", () => {
  it("lib/live/bellStyle.ts and lib/live/trackingInputs.ts no longer exist", () => {
    expect(fs.existsSync(path.join(EXPO_ROOT, "lib/live/bellStyle.ts"))).toBe(
      false,
    );
    expect(
      fs.existsSync(path.join(EXPO_ROOT, "lib/live/trackingInputs.ts")),
    ).toBe(false);
  });

  it("nothing imports them any more", () => {
    const offenders: string[] = [];
    const skip = new Set([
      "node_modules",
      ".expo",
      ".git",
      "dist",
      "android",
      "ios",
    ]);
    // Import-shaped on purpose: this file NAMES the two modules in prose, and a
    // prose match is not a caller.
    const importsRetired = /from\s+["'][^"']*\/(bellStyle|trackingInputs)["']/;
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (skip.has(entry.name)) continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
          continue;
        }
        if (!/\.tsx?$/.test(entry.name)) continue;
        if (importsRetired.test(fs.readFileSync(full, "utf8"))) {
          offenders.push(path.relative(EXPO_ROOT, full));
        }
      }
    };
    walk(EXPO_ROOT);
    expect(offenders).toEqual([]);
  });
});

describe("setInputsFor — the web's per-set input rules", () => {
  const inputs = (t?: string | null) => setInputsFor(t);

  it("reps_weight asks for weight and reps", () => {
    expect(inputs("reps_weight")).toEqual({
      weight: true,
      reps: true,
      duration: false,
      distance: false,
      speed: false,
    });
  });

  it("a bodyweight exercise is NOT asked for a weight (the old rule asked)", () => {
    expect(inputs("reps_bodyweight")).toEqual({
      weight: false,
      reps: true,
      duration: false,
      distance: false,
      speed: false,
    });
    expect(inputs("reps_only")).toEqual({
      weight: false,
      reps: true,
      duration: false,
      distance: false,
      speed: false,
    });
  });

  it("timed work asks for a duration and nothing else", () => {
    expect(inputs("time")).toEqual({
      weight: false,
      reps: false,
      duration: true,
      distance: false,
      speed: false,
    });
  });

  it("time_distance asks for duration, distance and speed", () => {
    expect(inputs("time_distance")).toEqual({
      weight: false,
      reps: false,
      duration: true,
      distance: true,
      speed: true,
    });
  });

  it("intervals are timed work with a speed, without a distance", () => {
    expect(inputs("intervals")).toEqual({
      weight: false,
      reps: false,
      duration: true,
      distance: false,
      speed: true,
    });
  });

  it("'none' asks for nothing — the member ticks it themselves", () => {
    expect(inputs("none")).toEqual({
      weight: false,
      reps: false,
      duration: false,
      distance: false,
      speed: false,
    });
  });

  it("a session rebuilt from its log ('reps', 'duration', …) resolves through the aliases", () => {
    // These are the types the web's rebuild paths emit. The old substring rule
    // read "reps" as reps-only; the shared normalizer reads it as the default,
    // which errs toward showing MORE than you need.
    expect(normalizeTracking("reps")).toBe("reps_weight");
    expect(inputs("reps")).toEqual(inputs("reps_weight"));
    expect(inputs("duration")).toEqual(inputs("time"));
    expect(inputs("distance")).toEqual(inputs("time_distance"));
    expect(inputs("interval")).toEqual(inputs("intervals"));
    expect(inputs("cardio")).toEqual(inputs("time"));
  });

  it("an unknown or absent type falls back to weight + reps", () => {
    for (const t of [undefined, null, "", "mystery"]) {
      expect(inputs(t)).toEqual({
        weight: true,
        reps: true,
        duration: false,
        distance: false,
        speed: false,
      });
    }
  });

  it("is case-insensitive and trims", () => {
    expect(inputs("  TIME_DISTANCE  ")).toEqual(inputs("time_distance"));
  });
});

describe("the weight convention comes off the catalog, not the name", () => {
  it("dumbbell work with nothing in its name is still per-DB", () => {
    const info = getBellWeightInfo({
      name: "Chest-Supported Row",
      equipment: ["dumbbell", "bench"],
    });
    expect(info).toEqual({ style: "dumbbell", showTotal: true });
    expect(bellWeightLabel(info.style)).toBe("Weight per DB (lbs)");
    expect(weightQuickPicks(info.style)).toEqual([10, 20, 30, 40, 50]);
  });

  it("a barbell lift aliased 'Bench Press (DB/bar)' is NOT per-DB", () => {
    // The exact case the old name/alias regex got wrong on the two most-logged
    // lifts in the app: it printed "Weight per DB (lbs)" and told anyone
    // entering 135 that it was "= 270 lbs total".
    const info = getBellWeightInfo({
      name: "Barbell Bench Press",
      aliases: ["Bench Press (DB/bar)"],
      equipment: ["barbell", "bench"],
    });
    expect(info).toEqual({ style: null, showTotal: false });
    expect(bellWeightLabel(info.style)).toBe("Weight (lbs)");
    expect(weightQuickPicks(info.style)).toEqual([45, 95, 135, 185, 225]);
  });

  it("a kettlebell is one implement unless the name says two", () => {
    expect(
      getBellWeightInfo({ name: "Goblet Squat", equipment: ["kettlebell"] }),
    ).toEqual({ style: "kettlebell", showTotal: false });
    expect(
      getBellWeightInfo({
        name: "Double Kettlebell Front Squat",
        equipment: ["kettlebell"],
      }),
    ).toEqual({ style: "kettlebell", showTotal: true });
  });

  it("single-sided and carried dumbbell work claims no doubled total", () => {
    expect(
      getBellWeightInfo({
        name: "Single-Arm Dumbbell Row",
        equipment: ["dumbbell"],
        laterality: "unilateral",
      }),
    ).toEqual({ style: "dumbbell", showTotal: false });
    expect(
      getBellWeightInfo({
        name: "Farmer Carry",
        equipment: ["dumbbell"],
        movementPatterns: ["carry"],
      }),
    ).toEqual({ style: "dumbbell", showTotal: false });
  });

  it("falls back to the name only when the equipment names no load at all", () => {
    expect(getBellWeightInfo({ name: "KB Snatch" })).toEqual({
      style: "kettlebell",
      showTotal: false,
    });
    expect(
      getBellWeightInfo({ name: "DB Curl", equipment: ["bench"] }),
    ).toEqual({ style: "dumbbell", showTotal: true });
    expect(getBellWeightInfo({ name: "Push-up" })).toEqual({
      style: null,
      showTotal: false,
    });
    expect(getBellWeightInfo(null)).toEqual({ style: null, showTotal: false });
  });
});

describe("a stair climber measures floors", () => {
  it("names the distance column for what the machine counts", () => {
    expect(isFloorsExercise("Stairmaster")).toBe(true);
    expect(isFloorsExercise("Stair Climber")).toBe(true);
    expect(isFloorsExercise("Treadmill Walk")).toBe(false);
    expect(isFloorsExercise(undefined)).toBe(false);
  });
});
