import { useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { Text } from "@/components/Text";
import { Input } from "@/components/Input";
import {
  defaultDurationUnit,
  isFloorsExercise,
  normalizeTracking,
  secondsToUnitDisplay,
  unitDisplayToSeconds,
  type BellWeightInfo,
  type DurationUnit,
} from "@become/core";
import {
  DEFAULT_LOAD_UNIT,
  bellTotalLabel,
  bellWeightLabel,
  quickPickLabel,
  weightQuickPicks,
  type WeightUnit,
} from "@/lib/live/bellStyle";
import {
  NO_BELL,
  setInputsFor,
  type LiveSetState,
} from "@/components/live/LiveSetRow";
import {
  defaultBellCount,
  showsBellTotal,
  type BellCount,
} from "@/lib/live/bellCount";
import { WRAPPABLE_TEXT } from "@/lib/a11y/dynamicType";
import { hitSlopToMinTarget } from "@/lib/a11y/touchTarget";

/**
 * THE LIVE STEP'S LABEL ROW — the web's `h-5`, and it is load-bearing.
 *
 * `webapp/app/dashboard/workout/[programId]/workout/live/LiveWorkoutClient.tsx`
 * (the `data-tour="live-inputs"` group) pins EVERY label row of the input
 * group to the same height, because the time column carries a unit toggle
 * beside its label and that pair does not fit a third of a phone's width once
 * cardio also asks for distance and speed — the label wrapped and shoved its
 * box half a row below the two next to it. `webapp/tests/unit/
 * trackColumns.test.ts` guards the web side of exactly this.
 *
 * `minHeight`, not `height`: the web's fixed 20px keeps the boxes level at the
 * normal text size, and a member at the largest Dynamic Type size still gets
 * the whole label (a fixed height around text is what `lib/a11y/dynamicType`
 * exists to prevent).
 */
export const LIVE_LABEL_ROW = Object.freeze({
  flexDirection: "row" as const,
  alignItems: "center" as const,
  justifyContent: "space-between" as const,
  gap: 4,
  minHeight: 20,
  marginBottom: 4,
});

/** The web's centered numeric well (`text-center text-lg font-bold`). */
const CENTERED = Object.freeze({ textAlign: "center" as const });

export interface LiveStepInputsProps {
  /** Which set of the exercise is on screen (for the testID only). */
  setIndex: number;
  /**
   * What this exercise is loaded with, from `getBellWeightInfo` — names the
   * weight box (`Weight per DB (lbs)`, or `(kg)` for a kg member) and decides
   * whether the doubled total is claimed under it. Defaults to {@link NO_BELL}.
   */
  bell?: BellWeightInfo;
  /**
   * HOW MANY of them — the member's own answer for this exercise (the web's
   * `currentBells`). Defaults to `defaultBellCount(bell)`, which IS today's
   * automatic answer, so a caller that does not pass it behaves exactly as
   * before. The `= X total` hint follows it: shown for a pair, gone for one.
   */
  bells?: BellCount;
  /**
   * Record a new answer. Omitted, no one/two control renders — the exercise
   * still logs the way it always did.
   */
  onBellsChange?: (count: BellCount) => void;
  /**
   * The member's lifting-load unit (`profile.weightUnit ?? 'lbs'`, NP-209) —
   * names the weight box, its doubled-total hint and the quick picks'
   * accessibility labels. Defaults to `'lbs'`.
   */
  weightUnit?: WeightUnit;
  /** The displayed name — picks Floors over metres for a stairmaster. */
  exerciseName?: string;
  /** Canonical exercise trackingType — selects which boxes render. */
  trackingType?: string | null;
  state: LiveSetState;
  /** Prescribed reps (`10-12`), the web's reps placeholder. */
  targetReps?: string | number | null;
  /** Prescribed duration (`30s`), the web's time placeholder. */
  targetDuration?: string | number | null;
  /** True while the stored PR is beaten by what is typed (the web's flag). */
  newPR?: boolean;
  onChange: (next: LiveSetState) => void;
  testID?: string;
}

/**
 * THE LIVE STEP'S INPUTS — the web's live input group, not the Track row.
 *
 * Web source of truth: the `data-tour="live-inputs"` block of
 * `webapp/app/dashboard/workout/[programId]/workout/live/LiveWorkoutClient.tsx`
 * (plus the quick-pick strip right under it). What the web puts on the screen
 * of somebody mid-set, and what this draws:
 *
 *   • the boxes side by side, one share of the width each, with a fixed-height
 *     label row above each one ({@link LIVE_LABEL_ROW});
 *   • each box the web's prominent numeric well — `px-4 py-3 text-lg
 *     font-bold`, CENTERED (`Input`'s `variant="prominent"`, NP-373);
 *   • `🔥 NEW PR!` in the weight label row, not under the inputs;
 *   • `= N lbs total` centered under the weight box, for a loaded PAIR only
 *     (`N kg total` for a kg member — NP-209's rule, no conversion);
 *   • the time label as the short `Time (sec)` with the `min`/`sec` toggle
 *     beside it;
 *   • `Distance (m)` (or `Floors`) and `Speed (mph)` for cardio;
 *   • the quick-pick loads as ONE horizontally scrolling row of pills under
 *     the boxes — the web's `flex gap-2 overflow-x-auto`;
 *   • the interval hint while an interval set is still blank.
 *
 * It is NOT `LiveSetRow`: that is the TRACK row (a bordered card with a
 * set-number column, a per-set checkbox, wrapped quick picks inside the weight
 * column and its own `Last:` line) and Live rendering it is what made the two
 * apps' live screens look nothing alike. Track still uses it, unchanged.
 *
 * Colours are the web's own translucent washes on the scoped dark palette —
 * `bg-foreground/10` with `text-foreground/70` chips, `text-foreground/60`
 * labels, the `live` Input well — because Live is dark-pinned with
 * `scopeClassColors`, where the foreground token is near-white (NP-288's
 * no-literal-white rule still holds for this file).
 */
export function LiveStepInputs({
  setIndex,
  bell = NO_BELL,
  bells,
  onBellsChange,
  weightUnit = DEFAULT_LOAD_UNIT,
  exerciseName,
  trackingType,
  state,
  targetReps,
  targetDuration,
  newPR = false,
  onChange,
  testID,
}: LiveStepInputsProps) {
  const tid = testID ?? `live-step-set-${setIndex}`;
  const inputs = setInputsFor(trackingType);
  const tracking = normalizeTracking(trackingType);
  // The web's sec/min toggle (`durationUnit.ts` in `@become/core`): the stored
  // value is always seconds, the toggle only changes what is typed into the
  // box. Derived during render, as in `LiveSetRow` — the Live view reuses one
  // input group across steps, so changing exercise resets the toggle to that
  // exercise's default (the web's `useEffect … [currentExerciseIndex]` rule)
  // while a manual toggle sticks for the exercise it was made on.
  const [unitOverride, setUnitOverride] = useState<{
    forType?: string | null;
    unit: DurationUnit;
  } | null>(null);
  const durationUnit =
    unitOverride && unitOverride.forType === trackingType
      ? unitOverride.unit
      : defaultDurationUnit(trackingType);

  const weightLabel = bellWeightLabel(bell.style, weightUnit);
  // How many implements are in the member's hands for this exercise. Absent
  // is the automatic per-exercise answer — exactly what an absent
  // `ISetLog.bells` has always meant (`lib/live/bellCount.ts`).
  const bellCount = bells ?? defaultBellCount(bell);
  // The web's rule verbatim: the doubled total is claimed only for bell work
  // being loaded with TWO (`showsBellTotal`), and only once a positive weight
  // has been TYPED (`Number(currentWeight) > 0`) — never off a placeholder or
  // a previous session. One implement moves the number typed and nothing more.
  const typedWeight = state.weight;
  const total =
    showsBellTotal(bell, bellCount) &&
    typeof typedWeight === "number" &&
    Number.isFinite(typedWeight) &&
    typedWeight > 0
      ? bellTotalLabel(typedWeight, weightUnit)
      : null;
  // The web's quick-pick loads, in the member's own unit — the SAME unit this
  // row's label is rendered with. kg gets kg equipment ladders (20/40/60/80/100
  // on a bar, 5s per dumbbell, the 8–24 kg bells), never the pound ladder
  // relabelled and never a conversion of it.
  const quickPicks = inputs.weight ? weightQuickPicks(bell.style, weightUnit) : [];
  const distanceLabel = isFloorsExercise(exerciseName)
    ? "Floors"
    : "Distance (m)";
  // The web's hint under the row, shown exactly while nothing is typed: an
  // interval's time is optional, so the button alone moves the member on.
  const intervalHint = tracking === "intervals" && !state.durationSec;

  const parse = (text: string): number | null => {
    if (text === "") return null;
    const parsed = Number(text);
    return Number.isFinite(parsed) ? parsed : null;
  };

  const label = (id: string, text: string, trailing?: React.ReactNode) => (
    <View testID={`${tid}-${id}-label-row`} style={LIVE_LABEL_ROW}>
      {/* The web's `text-white/60`: the foreground at 0.6, via the scoped
          dark palette — `text-muted-foreground` would read light-mode grey
          on a light phone without the pin. */}
      <Text
        testID={`${tid}-${id}-label`}
        style={WRAPPABLE_TEXT}
        className="text-foreground/60 text-xs"
      >
        {text}
      </Text>
      {trailing ?? null}
    </View>
  );

  return (
    <View testID={tid} style={{ gap: 8 }}>
      <View
        testID={`${tid}-boxes`}
        style={{ flexDirection: "row", alignItems: "flex-start", gap: 12 }}
      >
        {inputs.weight ? (
          <View style={{ flex: 1 }}>
            {label(
              "weight",
              weightLabel,
              newPR ? (
                <Text
                  testID={`${tid}-new-pr`}
                  style={WRAPPABLE_TEXT}
                  className="text-accent text-[10px] font-bold"
                >
                  🔥 NEW PR!
                </Text>
              ) : undefined,
            )}
            <Input
              testID={`${tid}-weight`}
              variant="live"
              style={CENTERED}
              accessibilityLabel={weightLabel}
              keyboardType="decimal-pad"
              value={state.weight !== null ? String(state.weight) : ""}
              onChangeText={(text) => onChange({ ...state, weight: parse(text) })}
              placeholder="0"
            />
            {total ? (
              <Text
                testID={`${tid}-helper`}
                className="text-foreground/60 text-[10px] text-center mt-1"
              >
                {total}
              </Text>
            ) : null}
          </View>
        ) : null}

        {inputs.reps ? (
          <View style={{ flex: 1 }}>
            {label("reps", "Reps")}
            <Input
              testID={`${tid}-reps`}
              variant="live"
              style={CENTERED}
              accessibilityLabel="Reps"
              keyboardType="number-pad"
              value={state.reps !== null ? String(state.reps) : ""}
              onChangeText={(text) => onChange({ ...state, reps: parse(text) })}
              placeholder={
                targetReps != null
                  ? String(targetReps).split("-")[0]?.replace(/[^0-9]/g, "") || "0"
                  : "0"
              }
            />
          </View>
        ) : null}

        {inputs.duration ? (
          <View style={{ flex: 1 }}>
            {label(
              "duration",
              `Time (${durationUnit})`,
              <Pressable
                testID={`${tid}-duration-toggle`}
                accessibilityRole="button"
                accessibilityLabel={`Show duration in ${
                  durationUnit === "sec" ? "minutes" : "seconds"
                }`}
                onPress={() =>
                  setUnitOverride({
                    forType: trackingType,
                    unit: durationUnit === "sec" ? "min" : "sec",
                  })
                }
                hitSlop={hitSlopToMinTarget(32, 18)}
                className="rounded-full bg-foreground/10 px-2 py-0.5"
              >
                <Text className="text-foreground/70 text-[10px] font-semibold">
                  {durationUnit === "sec" ? "min" : "sec"}
                </Text>
              </Pressable>,
            )}
            <Input
              testID={`${tid}-duration`}
              variant="live"
              style={CENTERED}
              accessibilityLabel={`Time (${durationUnit})`}
              keyboardType="decimal-pad"
              value={secondsToUnitDisplay(state.durationSec, durationUnit)}
              onChangeText={(text) => {
                const seconds = unitDisplayToSeconds(text, durationUnit);
                onChange({
                  ...state,
                  durationSec: seconds === "" ? null : Number(seconds),
                });
              }}
              placeholder={
                targetDuration != null
                  ? String(targetDuration).replace(/[^0-9]/g, "") || "30"
                  : "30"
              }
            />
          </View>
        ) : null}

        {inputs.distance ? (
          <View style={{ flex: 1 }}>
            {label("distance", distanceLabel)}
            <Input
              testID={`${tid}-distance`}
              variant="live"
              style={CENTERED}
              accessibilityLabel={distanceLabel}
              keyboardType="decimal-pad"
              value={
                state.distance !== null && state.distance !== undefined
                  ? String(state.distance)
                  : ""
              }
              onChangeText={(text) =>
                onChange({ ...state, distance: parse(text) })
              }
              placeholder="0"
            />
          </View>
        ) : null}

        {inputs.speed ? (
          <View style={{ flex: 1 }}>
            {label("speed", "Speed (mph)")}
            <Input
              testID={`${tid}-speed`}
              variant="live"
              style={CENTERED}
              accessibilityLabel="Speed (mph)"
              keyboardType="decimal-pad"
              value={
                state.speed !== null && state.speed !== undefined
                  ? String(state.speed)
                  : ""
              }
              onChangeText={(text) => onChange({ ...state, speed: parse(text) })}
              placeholder="0.0"
            />
          </View>
        ) : null}
      </View>

      {intervalHint ? (
        <Text
          testID={`${tid}-interval-hint`}
          className="text-foreground/60 text-[10px] text-center"
        >
          Log time or just tap Done to move on
        </Text>
      ) : null}

      {quickPicks.length > 0 ? (
        // ONE row that scrolls sideways, the web's `flex gap-2 overflow-x-auto`
        // — not a grid that wraps under the weight box and pushes the actions
        // down the screen.
        <ScrollView
          testID={`${tid}-quick-picks`}
          horizontal
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ flexDirection: "row", gap: 8 }}
        >
          {quickPicks.map((pick) => (
            <Pressable
              key={pick}
              testID={`${tid}-quick-pick-${pick}`}
              accessibilityRole="button"
              accessibilityLabel={quickPickLabel(pick, weightUnit)}
              onPress={() => onChange({ ...state, weight: pick })}
              hitSlop={hitSlopToMinTarget(56, 34)}
              className="rounded-full bg-foreground/10 px-4 py-2"
            >
              <Text className="text-foreground/70 text-sm font-medium">
                {String(pick)}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      ) : null}
    </View>
  );
}
