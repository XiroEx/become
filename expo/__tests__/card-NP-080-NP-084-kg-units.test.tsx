/**
 * kg THROUGHOUT THE NATIVE APP — NP-080 / NP-084, porting NP-209.
 *
 * Jon (NP-028, 10/13): "the KG members should be able to use KG throughout
 * the whole app." NP-209 shipped the server and web half (`7d329997`): a set
 * stores its raw number plus the unit it was entered in, `profile.weightUnit`
 * carries no default (absent = never asked), and nothing is ever converted.
 *
 * This suite is the native half's acceptance:
 *
 *   96d40a2d — the bell-weight label takes the member's unit, no hardcoded lbs
 *   96d40a2e — every native lifting-load label/input renders kg for a kg member
 *   96d40a2f — a record with a stored unit shows THAT unit; absent = lbs
 *   96d40a30 — nothing is converted or backfilled, and native adds no 2nd ask
 *   96d40a31 — shared/api-client exposes weightUnit / unit to native
 */

import fs from "node:fs";
import path from "node:path";
import { render, renderHook } from "@testing-library/react-native";

import {
  bellWeightLabel as coreBellWeightLabel,
  getBellWeightInfo,
} from "@become/core";
import {
  DEFAULT_LOAD_UNIT,
  bellTotalLabel,
  bellWeightLabel,
  compactBellWeightLabel,
  loadLabel,
  loadRepsLabel,
  memberLoadUnit,
  quickPickLabel,
  spokenUnit,
  storedLoadUnit,
  weightQuickPicks,
} from "@/lib/live/bellStyle";
import { useLiftingUnit } from "@/lib/live/useLiftingUnit";
import { LiveSetRow } from "@/components/live/LiveSetRow";
import { LiveStepInputs } from "@/components/live/LiveStepInputs";
import {
  LiveSetReference,
  formatLastLine,
  formatPRLine,
} from "@/components/live/LiveSetReference";
import { lastSetLine } from "@/components/live/LiveStepView";
import { describeSet } from "@/components/live/LiveWorkoutClient";
import { summaryMetricTiles } from "@/components/live/WorkoutSummary";
import { setLabel } from "@/components/schedule/DaySummarySheets";
import { progressHeaderLine } from "@/app/(app)/progress";
import {
  correctionChanges,
  correctionWeightUnit,
  draftFromWorkout,
  type CorrectableWorkout,
} from "@/lib/workout/correction";
import {
  ExercisePRSummarySchema,
  StoredWorkoutSetSchema,
  type ExercisePRSummary,
  type StoredWorkoutSet,
} from "@become/api-client";

const mockUseAuth = jest.fn();
jest.mock("@/lib/auth/useAuth", () => ({
  useAuth: () => mockUseAuth(),
}));

const EXPO_ROOT = path.resolve(__dirname, "..");
const read = (rel: string): string =>
  fs.readFileSync(path.join(EXPO_ROOT, rel), "utf8");

// ───────────────────────────────────────────────────────────────────────────
// 96d40a2d — the label takes the member's unit
// ───────────────────────────────────────────────────────────────────────────

describe("(id: 96d40a2d) the bell-weight label takes the member's unit", () => {
  it("names the implement in kg for a kg member, and still defaults to lbs", () => {
    expect(bellWeightLabel("dumbbell", "kg")).toBe("Weight per DB (kg)");
    expect(bellWeightLabel("kettlebell", "kg")).toBe("Weight per KB (kg)");
    expect(bellWeightLabel(null, "kg")).toBe("Weight (kg)");
    // Untouched call sites keep reading exactly as before NP-209.
    expect(bellWeightLabel("dumbbell")).toBe("Weight per DB (lbs)");
    expect(bellWeightLabel(null)).toBe("Weight (lbs)");
    expect(DEFAULT_LOAD_UNIT).toBe("lbs");
  });

  it("is the SHARED web rule, not a second native implementation", () => {
    // `expo/lib/live/bellStyle.ts` is the unit-aware label layer; the
    // implement rule itself is still @become/core's copy of the web source
    // (held identical by webapp/tests/unit/nativeParity/trainingModules).
    for (const unit of ["lbs", "kg"] as const) {
      for (const style of ["dumbbell", "kettlebell", null] as const) {
        expect(bellWeightLabel(style, unit)).toBe(
          coreBellWeightLabel(style, unit),
        );
      }
    }
    expect(read("lib/live/bellStyle.ts")).toContain('from "@become/core"');
  });

  it("hardcodes lbs nowhere: asked for kg, no helper says lb", () => {
    const kgLabels = [
      bellWeightLabel("dumbbell", "kg"),
      bellWeightLabel("kettlebell", "kg"),
      bellWeightLabel(null, "kg"),
      compactBellWeightLabel("dumbbell", "kg"),
      compactBellWeightLabel("kettlebell", "kg"),
      compactBellWeightLabel(null, "kg"),
      bellTotalLabel(40, "kg"),
      loadLabel(60, "kg"),
      loadRepsLabel(60, 5, "kg"),
      quickPickLabel(20, "kg"),
      spokenUnit("kg"),
    ];
    for (const label of kgLabels) {
      expect(label).not.toMatch(/lb/i);
      expect(label).toMatch(/kg|kilograms/);
    }
  });

  it("carries the compact Track label and the doubled-total hint per unit", () => {
    expect(compactBellWeightLabel("dumbbell", "kg")).toBe("kg/DB");
    expect(compactBellWeightLabel("kettlebell", "kg")).toBe("kg/KB");
    expect(compactBellWeightLabel(null, "kg")).toBe("kg");
    expect(compactBellWeightLabel("dumbbell")).toBe("lbs/DB");
    expect(bellTotalLabel(40, "kg")).toBe("= 80 kg total");
    expect(bellTotalLabel(50)).toBe("= 100 lbs total");
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 96d40a2e — every native lifting-load label and input
// ───────────────────────────────────────────────────────────────────────────

describe("(id: 96d40a2e) every native lifting-load label renders kg for a kg member", () => {
  const baseState = { weight: null, reps: null, completed: false };

  it("Track's set row: label, compact label, doubled total and quick picks", () => {
    const { getByTestId, rerender } = render(
      <LiveSetRow
        setIndex={0}
        bell={{ style: "dumbbell", showTotal: true }}
        weightUnit="kg"
        showQuickPicks
        state={{ weight: 40, reps: null, completed: false }}
        onChange={() => {}}
      />,
    );
    expect(getByTestId("live-set-0-weight-label").props.children).toBe(
      "Weight per DB (kg)",
    );
    expect(getByTestId("live-set-0-helper").props.children).toBe(
      "= 80 kg total",
    );
    expect(
      getByTestId("live-set-0-quick-pick-20").props.accessibilityLabel,
    ).toBe("Log 20 kilograms");

    rerender(
      <LiveSetRow
        compact
        setIndex={0}
        bell={{ style: "dumbbell", showTotal: true }}
        weightUnit="kg"
        state={baseState}
        onChange={() => {}}
      />,
    );
    expect(getByTestId("live-set-0-weight-label").props.children).toBe(
      "kg/DB",
    );
  });

  it("the Live step's input group: label, accessible name and total", () => {
    const { getByTestId } = render(
      <LiveStepInputs
        setIndex={0}
        bell={{ style: "dumbbell", showTotal: true }}
        weightUnit="kg"
        trackingType="reps_weight"
        state={{ weight: 30, reps: null, completed: false }}
        onChange={() => {}}
      />,
    );
    expect(
      getByTestId("live-step-set-0-weight-label").props.children,
    ).toBe("Weight per DB (kg)");
    expect(
      getByTestId("live-step-set-0-weight").props.accessibilityLabel,
    ).toBe("Weight per DB (kg)");
    expect(getByTestId("live-step-set-0-helper").props.children).toBe(
      "= 60 kg total",
    );
    expect(
      getByTestId("live-step-set-0-quick-pick-10").props.accessibilityLabel,
    ).toBe("Log 10 kilograms");
  });

  it("the Live step's Last / history references", () => {
    expect(
      formatLastLine(
        "reps_weight",
        { weight: 60, reps: 5, date: "2026-10-01" },
        "sec",
        "kg",
      ),
    ).toBe("60 kg × 5 reps");
    expect(
      formatLastLine("reps_weight", { weight: 60, reps: 5, date: "x" }),
    ).toBe("60 lbs × 5 reps");
    expect(lastSetLine({ ...baseState, weight: 40, reps: 12, completed: true }, "reps_weight", 1, "kg")).toBe(
      "Last set: 40 kg × 12 reps",
    );
  });

  it("the edit-confirm modal's Before / After boxes", () => {
    const set = { weight: 135, reps: 5, completed: true };
    expect(describeSet(set, "reps_weight", "kg")).toBe("135 kg × 5 reps");
    expect(describeSet({ ...set, reps: null }, "reps_weight", "kg")).toBe(
      "135 kg",
    );
    expect(describeSet(set, "reps_weight")).toBe("135 lbs × 5 reps");
  });

  it("the finish summary's volume tile", () => {
    const exercises = [{ name: "Bench", trackingType: "reps_weight" }];
    const sets = [[{ weight: 60, reps: 5, completed: true }]];
    expect(summaryMetricTiles(exercises, sets, "kg")).toEqual([
      { key: "count", value: "1", label: "Sets" },
      { key: "volume", value: "300", label: "Volume kg" },
    ]);
    expect(summaryMetricTiles(exercises, sets)[1]).toEqual({
      key: "volume",
      value: "300",
      label: "Volume lbs",
    });
  });

  it("the calendar day sheet's logged sets and the progress header", () => {
    expect(setLabel({ reps: 5, weight: 60 }, "kg")).toBe("5 reps · 60 kg");
    expect(setLabel({ reps: 5, weight: 60 })).toBe("5 reps · 60 lbs");
    expect(
      progressHeaderLine(
        {
          weightData: [],
          bmiData: [],
          moodData: [],
          currentProgram: null,
          stats: { totalWorkouts: 27 },
          totalVolumeLbs: 20600,
        } as never,
        "kg",
      ),
    ).toBe("27 workouts · 20.6K kg lifted all-time");
  });

  it("the training-log correction sheet's weight field and review lines", () => {
    const workout: CorrectableWorkout = {
      kind: "program",
      date: "Fri, Oct 10",
      rawDate: "2026-10-10T00:00:00.000Z",
      programId: "p1",
      day: "Day 1",
      duration: 45,
      notes: "",
      notesKnown: true,
      exercises: [
        {
          name: "Bench",
          sets: [
            {
              reps: 5,
              weight: 135,
              duration: null,
              distance: null,
              speed: null,
              completed: true,
            },
          ],
        },
      ],
    };
    const draft = draftFromWorkout(workout);
    const edited = {
      ...draft,
      sets: [[{ ...draft.sets[0]![0]!, weight: "140" }]],
    };
    expect(correctionChanges(workout, edited, "kg")).toEqual([
      "Bench · Set 1 weight: 135 kg → 140 kg",
    ]);
    expect(correctionChanges(workout, edited)).toEqual([
      "Bench · Set 1 weight: 135 lbs → 140 lbs",
    ]);
  });

  it("reads the unit from the member's profile, with no native ask", () => {
    mockUseAuth.mockReturnValue({
      user: { _id: "u1", profile: { weightUnit: "kg" } },
    });
    expect(renderHook(() => useLiftingUnit()).result.current).toBe("kg");

    // Absent means "never asked" (NP-209 removed the schema default): the
    // DISPLAY read grandfathers it as lbs, exactly as the server does.
    mockUseAuth.mockReturnValue({ user: { _id: "u1" } });
    expect(renderHook(() => useLiftingUnit()).result.current).toBe("lbs");

    // Fails soft with no auth at all, rather than throwing mid-workout.
    mockUseAuth.mockImplementation(() => {
      throw new Error("no provider");
    });
    expect(renderHook(() => useLiftingUnit()).result.current).toBe("lbs");
    mockUseAuth.mockReset();
  });

  it("threads one unit into the live/track/summary/progress surfaces", () => {
    // Every screen that renders a lifting load reads the member's unit once
    // and hands it down — no screen left on a hardcoded default.
    expect(read("app/(app)/(tabs)/programming/[id]/workout/[idx]/live.tsx")).toContain(
      "useLiftingUnit()",
    );
    expect(read("app/(app)/(tabs)/programming/quick/live.tsx")).toContain(
      "useLiftingUnit()",
    );
    expect(read("app/(app)/progress.tsx")).toContain("useLiftingUnit()");
    expect(read("app/(app)/(tabs)/programming/[id]/journey.tsx")).toContain(
      "useLiftingUnit()",
    );
    expect(read("components/schedule/DaySummarySheets.tsx")).toContain(
      "useLiftingUnit()",
    );
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 96d40a2f — a record shows its OWN stored unit; absent = lbs
// ───────────────────────────────────────────────────────────────────────────

describe("(id: 96d40a2f) a stored unit beats the member's current preference", () => {
  it("storedLoadUnit grandfathers an absent unit as lbs", () => {
    expect(storedLoadUnit("kg")).toBe("kg");
    expect(storedLoadUnit("lbs")).toBe("lbs");
    expect(storedLoadUnit(undefined)).toBe("lbs");
    expect(storedLoadUnit(null)).toBe("lbs");
    // Junk from an older/odd payload is not trusted into the UI.
    expect(storedLoadUnit("stone")).toBe("lbs");
    expect(memberLoadUnit(undefined)).toBe("lbs");
    expect(memberLoadUnit("kg")).toBe("kg");
  });

  it("the PR line reads the PR's own unit, not the member's", () => {
    expect(formatPRLine({ weight: 100, reps: 3, unit: "kg" })).toBe(
      "PR: 100 kg",
    );
    // A PR set before NP-209 carries no unit: it was entered in lbs and
    // stays lbs even for a member who has since switched to kg.
    expect(formatPRLine({ weight: 225, reps: 3 })).toBe("PR: 225 lbs");
    expect(formatPRLine(null)).toBeNull();

    const { getByTestId } = render(
      <LiveSetReference
        exerciseName="Bench"
        trackingType="reps_weight"
        weightUnit="kg"
        history={{ weight: 60, reps: 5, date: "2026-10-01" }}
        pr={{ weight: 225, reps: 3 }}
        typedWeight={null}
        testID="ref"
      />,
    );
    // Member is kg → the Last line (no stored unit anywhere in the payload)
    // reads kg, while the un-stamped PR stays lbs.
    expect(getByTestId("ref-last").props.children).toBe("Last: 60 kg × 5 reps");
    expect(getByTestId("ref-pr").props.children).toBe("🏆 PR: 225 lbs");
  });

  it("a logged set's own unit wins in the day sheet and the correction sheet", () => {
    // Member prefers kg; this set was entered in lbs and says so.
    expect(setLabel({ reps: 5, weight: 135, weightUnit: "lbs" }, "kg")).toBe(
      "5 reps · 135 lbs",
    );
    expect(setLabel({ reps: 5, weight: 60, weightUnit: "kg" }, "lbs")).toBe(
      "5 reps · 60 kg",
    );
    expect(correctionWeightUnit({ weightUnit: "kg" }, "lbs")).toBe("kg");
    expect(correctionWeightUnit({ weightUnit: "lbs" }, "kg")).toBe("lbs");
    // Absent on this read path → the member's unit names the input.
    expect(correctionWeightUnit({}, "kg")).toBe("kg");
    expect(correctionWeightUnit(undefined)).toBe("lbs");
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 96d40a30 — no conversion, no backfill, no second ask
// ───────────────────────────────────────────────────────────────────────────

describe("(id: 96d40a30) nothing is converted and native never asks", () => {
  it("renders the stored number untouched, whatever the unit", () => {
    expect(loadLabel(135, "kg")).toBe("135 kg");
    expect(loadLabel(135, "lbs")).toBe("135 lbs");
    expect(loadRepsLabel(60, 5, "kg")).toBe("60 kg × 5 reps");
    // The one piece of arithmetic is the PAIR doubling, which is not a unit
    // conversion: two 40 kg bells are 80 kg, two 40 lb bells are 80 lb.
    expect(bellTotalLabel(40, "kg")).toBe("= 80 kg total");
    expect(bellTotalLabel(40, "lbs")).toBe("= 80 lbs total");
    expect(spokenUnit("kg")).toBe("kilograms");
    expect(spokenUnit("lbs")).toBe("pounds");
    expect(quickPickLabel(45, "lbs")).toBe("Log 45 pounds");
  });

  it("has no lb↔kg conversion anywhere in the lifting-load path", () => {
    for (const file of [
      "lib/live/bellStyle.ts",
      "lib/live/useLiftingUnit.ts",
      "components/live/LiveSetRow.tsx",
      "components/live/LiveStepInputs.tsx",
      "components/live/LiveSetReference.tsx",
    ]) {
      const source = read(file);
      expect(source).not.toMatch(/lbsToKg|kgToLbs|2\.20462|0\.45359/);
    }
  });

  it("takes the quick-pick loads from the shared web rule, per unit", () => {
    // The picks are the web's (`weightQuickPicks` in `@become/core`), and the
    // kg ones are kg EQUIPMENT numbers rather than converted pounds — the
    // conversion layer this card forbids is still nowhere (card 96d40d31).
    expect(weightQuickPicks("dumbbell")).toEqual([10, 20, 30, 40, 50]);
    expect(weightQuickPicks("kettlebell")).toEqual([18, 26, 35, 44, 53]);
    expect(weightQuickPicks(null)).toEqual([45, 95, 135, 185, 225]);
    expect(weightQuickPicks("dumbbell", "kg")).toEqual([5, 10, 15, 20, 25]);
    expect(weightQuickPicks("kettlebell", "kg")).toEqual([8, 12, 16, 20, 24]);
    expect(weightQuickPicks(null, "kg")).toEqual([20, 40, 60, 80, 100]);
  });

  it("adds no second lb/kg ask on native — the web gate owns the one ask", () => {
    const files = fs
      .readdirSync(path.join(EXPO_ROOT, "components"), { recursive: true })
      .map(String);
    expect(files.filter((f) => /WeightUnitGate/i.test(f))).toEqual([]);
    // The native read is a plain profile read, with no write path of its own.
    const hook = read("lib/live/useLiftingUnit.ts");
    expect(hook).not.toMatch(/PATCH|fetch\(/);
  });

  it("keeps the implement rule equipment-first (nothing regressed on the copy)", () => {
    expect(getBellWeightInfo({ name: "Chest-Supported Row", equipment: ["dumbbell", "bench"] })).toEqual({
      style: "dumbbell",
      showTotal: true,
    });
    expect(
      getBellWeightInfo({
        name: "Barbell Bench Press",
        aliases: ["Bench Press (DB/bar)"],
        equipment: ["barbell", "bench"],
      }),
    ).toEqual({ style: null, showTotal: false });
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 96d40a31 — the shared contract exposes the fields natively
// ───────────────────────────────────────────────────────────────────────────

describe("(id: 96d40a31) shared/api-client exposes weightUnit / unit", () => {
  it("StoredWorkoutSet carries the set's weightUnit", () => {
    const parsed: StoredWorkoutSet = StoredWorkoutSetSchema.parse({
      setNumber: 1,
      reps: 5,
      weight: 60,
      weightUnit: "kg",
      completed: true,
    });
    expect(parsed.weightUnit).toBe("kg");
    // Nullish: a set logged before NP-209 (or by a never-asked member) has
    // none, and that must parse rather than fail the contract.
    expect(
      StoredWorkoutSetSchema.parse({ reps: 5, weight: 135 }).weightUnit,
    ).toBeUndefined();
    expect(
      StoredWorkoutSetSchema.parse({ reps: 5, weight: 135, weightUnit: null })
        .weightUnit,
    ).toBeNull();
    expect(() =>
      StoredWorkoutSetSchema.parse({ reps: 5, weight: 135, weightUnit: "stone" }),
    ).toThrow();
  });

  it("ExercisePRSummary carries the PR dimension's unit", () => {
    const parsed: ExercisePRSummary = ExercisePRSummarySchema.parse({
      weight: 100,
      reps: 3,
      unit: "kg",
    });
    expect(parsed.unit).toBe("kg");
    expect(
      ExercisePRSummarySchema.parse({ weight: 225, reps: 3 }).unit,
    ).toBeUndefined();
  });
});
