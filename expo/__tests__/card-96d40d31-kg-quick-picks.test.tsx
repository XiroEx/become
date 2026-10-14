/**
 * A kg MEMBER WAS OFFERED POUND-SIZED QUICK PICKS (card 96d40d30, bug).
 *
 * NP-209 / NP-080 made the weight input's LABEL unit-aware —
 * `bellWeightLabel(style, unit)` renders "Weight per DB (kg)" — and left the
 * quick-pick buttons under it on the pound ladders. A kg member was offered
 * 45/95/135/185/225 kg (99–496 lb) for a barbell and 18/26/35/44/53 kg for a
 * kettlebell. The numbers are plate/bell maths that only works in pounds
 * (45 = the bar plus a pound-plate pair; 53 lb IS the 24 kg bell).
 *
 * The fix is in the shared web rule (`weightQuickPicks(style, unit)` in
 * `@become/core` ← `webapp/lib/workout/dumbbellWeight.ts`), re-exported by
 * `lib/live/bellStyle.ts`; native's half is that both Live and Track pass the
 * member's unit — the SAME value they label the weight box with.
 *
 *   96d40d31 — the picks take the unit and default to 'lbs'
 *   96d40d32 — a kg member sees kg EQUIPMENT ladders, not converted pounds
 *   96d40d33 — every native call site passes the label's unit
 *   96d40d34 — the native copy (lib/live/bellStyle.ts) carries no second rule
 */

import fs from "node:fs";
import path from "node:path";
import { render } from "@testing-library/react-native";

import { weightQuickPicks as coreWeightQuickPicks } from "@become/core";
import {
  DEFAULT_LOAD_UNIT,
  weightQuickPicks,
} from "@/lib/live/bellStyle";
import { LiveSetRow } from "@/components/live/LiveSetRow";
import { LiveStepInputs } from "@/components/live/LiveStepInputs";

const EXPO_ROOT = path.resolve(__dirname, "..");
const read = (rel: string): string =>
  fs.readFileSync(path.join(EXPO_ROOT, rel), "utf8");

const LBS = {
  dumbbell: [10, 20, 30, 40, 50],
  kettlebell: [18, 26, 35, 44, 53],
  barbell: [45, 95, 135, 185, 225],
};
const KG = {
  dumbbell: [5, 10, 15, 20, 25],
  kettlebell: [8, 12, 16, 20, 24],
  barbell: [20, 40, 60, 80, 100],
};

// ───────────────────────────────────────────────────────────────────────────
// 96d40d31 — the signature, and what omitting the unit still means
// ───────────────────────────────────────────────────────────────────────────

describe("(id: 96d40d31) weightQuickPicks takes the unit, defaulting to lbs", () => {
  it("omitting the unit is the pound ladder, exactly as before", () => {
    expect(weightQuickPicks("dumbbell")).toEqual(LBS.dumbbell);
    expect(weightQuickPicks("kettlebell")).toEqual(LBS.kettlebell);
    expect(weightQuickPicks(null)).toEqual(LBS.barbell);
    expect(DEFAULT_LOAD_UNIT).toBe("lbs");
    for (const style of ["dumbbell", "kettlebell", null] as const) {
      expect(weightQuickPicks(style)).toEqual(weightQuickPicks(style, "lbs"));
    }
  });

  it("is the shared web rule, not a native re-implementation", () => {
    for (const style of ["dumbbell", "kettlebell", null] as const) {
      for (const unit of ["lbs", "kg"] as const) {
        expect(weightQuickPicks(style, unit)).toEqual(
          coreWeightQuickPicks(style, unit),
        );
      }
    }
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 96d40d32 — kg equipment numbers, never converted pounds
// ───────────────────────────────────────────────────────────────────────────

describe("(id: 96d40d32) a kg member gets kg equipment ladders", () => {
  it("offers the kg bar/plate, dumbbell and bell sizes", () => {
    expect(weightQuickPicks(null, "kg")).toEqual(KG.barbell);
    expect(weightQuickPicks("dumbbell", "kg")).toEqual(KG.dumbbell);
    expect(weightQuickPicks("kettlebell", "kg")).toEqual(KG.kettlebell);
  });

  it("never converts the pound ladder (20.4 kg is not a dumbbell)", () => {
    for (const style of ["dumbbell", "kettlebell", null] as const) {
      const kg = weightQuickPicks(style, "kg");
      expect(kg).not.toEqual(weightQuickPicks(style, "lbs"));
      // Whole equipment numbers, ascending, no rounded conversions.
      expect(kg.every((p) => Number.isInteger(p) && p > 0)).toBe(true);
      expect([...kg].sort((a, b) => a - b)).toEqual(kg);
    }
    // The reported absurdity: 135/185/225 "kg" on a bar, 53 "kg" on a bell.
    expect(weightQuickPicks(null, "kg").some((p) => p > 100)).toBe(false);
    expect(weightQuickPicks("kettlebell", "kg")).not.toContain(53);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 96d40d33 — every call site passes the unit the label uses
// ───────────────────────────────────────────────────────────────────────────

describe("(id: 96d40d33) Live and Track render the kg ladders", () => {
  const baseState = { weight: null, reps: null, completed: false };

  it("Track's set row: a kg member's barbell picks are 20–100, not 45–225", () => {
    const { getByTestId, queryByTestId } = render(
      <LiveSetRow
        setIndex={0}
        bell={{ style: null, showTotal: false }}
        weightUnit="kg"
        showQuickPicks
        trackingType="reps_weight"
        state={baseState}
        onChange={() => {}}
      />,
    );
    for (const pick of KG.barbell) {
      expect(getByTestId(`live-set-0-quick-pick-${pick}`)).toBeTruthy();
    }
    for (const pick of [45, 95, 135, 185, 225]) {
      expect(queryByTestId(`live-set-0-quick-pick-${pick}`)).toBeNull();
    }
  });

  it("Track's set row: a kg member's dumbbell picks are 5s, not 10s", () => {
    const { getByTestId, queryByTestId } = render(
      <LiveSetRow
        setIndex={1}
        bell={{ style: "dumbbell", showTotal: true }}
        weightUnit="kg"
        showQuickPicks
        trackingType="reps_weight"
        state={baseState}
        onChange={() => {}}
      />,
    );
    expect(getByTestId("live-set-1-weight-label").props.children).toBe(
      "Weight per DB (kg)",
    );
    for (const pick of KG.dumbbell) {
      expect(getByTestId(`live-set-1-quick-pick-${pick}`)).toBeTruthy();
    }
    expect(queryByTestId("live-set-1-quick-pick-50")).toBeNull();
  });

  it("the Live step's input group: kg picks under the kg label", () => {
    const { getByTestId, queryByTestId } = render(
      <LiveStepInputs
        setIndex={0}
        bell={{ style: "kettlebell", showTotal: false }}
        weightUnit="kg"
        trackingType="reps_weight"
        state={baseState}
        onChange={() => {}}
      />,
    );
    expect(
      getByTestId("live-step-set-0-weight-label").props.children,
    ).toBe("Weight per KB (kg)");
    for (const pick of KG.kettlebell) {
      expect(getByTestId(`live-step-set-0-quick-pick-${pick}`)).toBeTruthy();
    }
    // 53 lb is the 24 kg bell; it must not be offered AS kg.
    expect(queryByTestId("live-step-set-0-quick-pick-53")).toBeNull();
  });

  it("a pound member's picks are untouched (both views)", () => {
    const row = render(
      <LiveSetRow
        setIndex={0}
        bell={{ style: null, showTotal: false }}
        showQuickPicks
        trackingType="reps_weight"
        state={baseState}
        onChange={() => {}}
      />,
    );
    expect(row.getByTestId("live-set-0-quick-pick-135")).toBeTruthy();

    const step = render(
      <LiveStepInputs
        setIndex={0}
        bell={{ style: "dumbbell", showTotal: true }}
        trackingType="reps_weight"
        state={baseState}
        onChange={() => {}}
      />,
    );
    expect(step.getByTestId("live-step-set-0-quick-pick-50")).toBeTruthy();
  });

  it("both components read the picks with the unit they label the box with", () => {
    for (const file of [
      "components/live/LiveSetRow.tsx",
      "components/live/LiveStepInputs.tsx",
    ]) {
      const source = read(file);
      expect(source).toMatch(/weightQuickPicks\(bell\.style, weightUnit\)/);
      expect(source).not.toMatch(/weightQuickPicks\(bell\.style\)/);
    }
  });
});

// ───────────────────────────────────────────────────────────────────────────
// 96d40d34 — the native copy has no ladder of its own
// ───────────────────────────────────────────────────────────────────────────

describe("(id: 96d40d34) lib/live/bellStyle.ts holds no quick-pick rule", () => {
  it("re-exports the shared picks and hardcodes no ladder or conversion", () => {
    const source = read("lib/live/bellStyle.ts");
    expect(source).toMatch(/weightQuickPicks/);
    expect(source).toMatch(/from\s+["']@become\/core["']/);
    // No second implementation, and no lb↔kg arithmetic anywhere near it.
    expect(source).not.toMatch(/export\s+function\s+weightQuickPicks/);
    expect(source).not.toMatch(/\[\s*45\s*,|\[\s*18\s*,|\[\s*10\s*,/);
    expect(source).not.toMatch(/lbsToKg|kgToLbs|2\.20462|0\.45359/);
  });
});
