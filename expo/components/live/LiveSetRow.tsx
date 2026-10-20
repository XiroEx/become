import { useEffect, useRef, useState } from "react";
import { View, Pressable, ScrollView } from "react-native";
import { Text } from "@/components/Text";
import { Check, ChevronsRight } from "lucide-react-native";
import { Input } from "@/components/Input";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";
import {
  defaultDurationUnit,
  equipmentAssumption,
  isFloorsExercise,
  normalizeTracking,
  secondsToUnitDisplay,
  tracksSpeed,
  tracksTime,
  unitDisplayToSeconds,
  type BellStyle,
  type BellWeightInfo,
  type DurationUnit,
} from "@become/core";
import {
  DEFAULT_LOAD_UNIT,
  bellTotalLabel,
  bellWeightLabel,
  compactBellWeightLabel,
  quickPickLabel,
  weightQuickPicks,
  type WeightUnit,
} from "@/lib/live/bellStyle";
import {
  defaultBellCount,
  showsBellTotal,
  type BellCount,
} from "@/lib/live/bellCount";

/** A set with nothing in it — no bell, no total hint. */
export const NO_BELL: BellWeightInfo = { style: null, showTotal: false };

export interface SetInputs {
  weight: boolean;
  reps: boolean;
  duration: boolean;
  distance: boolean;
  /** mph — for `time_distance` and `intervals` (the web's speed input). */
  speed: boolean;
}

/**
 * Which per-set inputs this exercise asks for.
 *
 * This used to be `lib/live/trackingInputs.ts`, which matched trackingType by
 * SUBSTRING against a vocabulary the web does not use ("weight_reps",
 * "reps") — so a `reps_bodyweight` exercise got a weight box and a `none`
 * exercise got weight and reps. The rules below are the web live screen's,
 * read off the ONE normalizer both apps now share
 * (`normalizeTracking`, `@become/core` ← webapp/lib/workout/tracking.ts):
 * see webapp/app/dashboard/workout/[programId]/workout/live/
 * LiveWorkoutClient.tsx, `showWeightInput` … `tracking === "time_distance"`.
 *
 * Speed follows the same screen (`showSpeedInput`): `time_distance` and
 * `intervals` ask for it. Duration follows `tracksTime` (time,
 * time_distance, intervals — optional for intervals, like the web's
 * "Log time or just tap Done to move on" hint).
 */
export function setInputsFor(trackingType?: string | null): SetInputs {
  const t = normalizeTracking(trackingType);
  return {
    weight: t === "reps_weight",
    reps: t === "reps_weight" || t === "reps_bodyweight" || t === "reps_only",
    duration: tracksTime(t),
    distance: t === "time_distance",
    speed: tracksSpeed(t),
  };
}

export interface LiveSetState {
  reps: number | null;
  weight: number | null;
  completed: boolean;
  /** Seconds — for time / time_distance / intervals tracking types. */
  durationSec?: number | null;
  /** Meters — for time_distance / distance tracking types. */
  distance?: number | null;
  /** mph — for time_distance / intervals tracking types. */
  speed?: number | null;
}

export interface LiveSetRowProps {
  setIndex: number;
  /**
   * What this exercise is loaded with, from `getBellWeightInfo` — the web's
   * equipment-first rule, not a guess at the name. Defaults to {@link NO_BELL}.
   */
  bell?: BellWeightInfo;
  /**
   * HOW MANY implements the member said they are using for this exercise
   * (`ISetLog.bells`, their own answer). Defaults to `defaultBellCount(bell)`
   * — today's automatic answer — so every pre-existing call site reads exactly
   * as before. The `= N lbs total` hint follows it, never the catalogue alone:
   * one dumbbell has no combined total worth claiming.
   */
  bells?: BellCount;
  /**
   * The member's lifting-load unit (`profile.weightUnit ?? 'lbs'`, NP-209) —
   * names the weight box and the doubled-total hint. Defaults to `'lbs'`, the
   * grandfather value for a member who has never been asked, so every
   * pre-existing call site reads exactly as before.
   */
  weightUnit?: WeightUnit;
  /** The exercise's displayed name, for the Floors-vs-metres distance label. */
  exerciseName?: string;
  /**
   * Catalog `equipment` ids for the exercise (e.g. `["dumbbell", "bench"]`).
   * Feeds the "Logging as …" chip when the name does not already state the
   * implement — the web's `EquipmentAssumptionRow`, disclosure only.
   */
  equipment?: string[];
  /**
   * When true, render the web's quick-pick loads under the weight box
   * (`weightQuickPicks`, in `weightUnit`: 10–50 per DB, 18–53 per KB, 45–225
   * otherwise in lbs; 5–25, 8–24 and 20–100 in kg).
   * The typed number is always per implement; the picks only fill it in.
   */
  showQuickPicks?: boolean;
  state: LiveSetState;
  /** Last completed performance of this set (prefill source). */
  prefill?: LiveSetState | null;
  /** Canonical exercise trackingType — selects which inputs render. */
  trackingType?: string | null;
  /**
   * The interleaved round this set belongs to (NP-172) — e.g. "Round 2" for
   * the second pass through a superset. Shown beside the set number so a
   * grouped block reads as rounds, the way the web track view renders them.
   */
  roundLabel?: string;
  /**
   * Hide the done checkbox (NP-288). The LIVE step has no per-set checkbox
   * on the web — `Complete Set →` is the one thing that logs a set and
   * moves on — and natively the tick started a rest without advancing the
   * step, which is how a set could be resting and unfinished at once.
   * Track keeps its checkbox: that is where a set is ticked by hand.
   */
  hideComplete?: boolean;
  /** Compact single-row layout for superset/circuit rounds (NP-332). */
  compact?: boolean;
  /** Target reps prescription string (e.g. "10-12" or "10") for placeholder prefill. */
  targetReps?: string | number | null;
  /** Target duration prescription string (e.g. "30s" or "30") for placeholder prefill. */
  targetDuration?: string | number | null;
  onSkip?: () => void;
  onChange: (next: LiveSetState) => void;
  testID?: string;
}

/** Parse an input string to a number-or-null, ignoring non-finite garbage. */
function parseNum(text: string): number | null {
  if (text === "") return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatNumOrNull(n: number | null | undefined): string {
  return n !== null && n !== undefined ? String(n) : "";
}

/**
 * Keeps the TextInput's displayed text exactly as typed while a decimal is
 * mid-entry (NP decimal-point bug: "72." parses to the number 72, and a
 * naive `value={String(state.weight)}` reformats to "72" on every keystroke,
 * so the "." the member just typed is stripped the instant they type it —
 * they can never get past the decimal point).
 *
 * The draft string is the source of truth for what is ON SCREEN; the parsed
 * number is the source of truth for what is STORED (`state`). The two are
 * only reconciled when the stored value changes for a reason OTHER than this
 * input's own typing — e.g. a quick-pick tap, or the Live view swapping in a
 * different set/exercise's state — tracked via `sentRef`, the last numeric
 * value this hook itself committed.
 */
function useNumberDraft(
  value: number | null | undefined,
  commit: (n: number | null) => void,
): [string, (text: string) => void] {
  const normalized = value ?? null;
  const [draft, setDraft] = useState<string>(() => formatNumOrNull(normalized));
  const sentRef = useRef<number | null>(normalized);

  useEffect(() => {
    if (normalized !== sentRef.current) {
      sentRef.current = normalized;
      setDraft(formatNumOrNull(normalized));
    }
  }, [normalized]);

  const onChangeText = (text: string) => {
    setDraft(text);
    const parsed = parseNum(text);
    sentRef.current = parsed;
    commit(parsed);
  };

  return [draft, onChangeText];
}

/**
 * The weight box's label, in the member's unit (NP-209). Compact rows get the
 * short form (`kg/DB`) because the full "Weight per DB (kg)" does not fit a
 * superset set line; both come from `lib/live/bellStyle.ts`.
 */
function getWeightLabel(
  style: BellStyle | null,
  compact?: boolean,
  unit: WeightUnit = DEFAULT_LOAD_UNIT,
): string {
  return compact
    ? compactBellWeightLabel(style, unit)
    : bellWeightLabel(style, unit);
}

export function LiveSetRow({
  setIndex,
  bell = NO_BELL,
  bells,
  weightUnit = DEFAULT_LOAD_UNIT,
  exerciseName,
  equipment,
  showQuickPicks = false,
  state,
  prefill,
  trackingType,
  roundLabel,
  hideComplete = false,
  compact = false,
  targetReps,
  targetDuration,
  onSkip,
  onChange,
  testID,
}: LiveSetRowProps) {
  const { colors } = useThemeTokens();
  const tid = testID ?? `live-set-${setIndex}`;
  const inputs: SetInputs = setInputsFor(trackingType);
  // The web's sec/min toggle for duration (`durationUnit.ts` in
  // `@become/core` ← webapp/lib/workout/durationUnit.ts): the stored value
  // is always seconds; the toggle only changes what the member types into.
  // Cardio machines are prescribed in minutes almost everywhere else in the
  // app, so `time_distance` opens in minutes and short timed work in seconds.
  // Derived during render (not in an effect): the Live view reuses one row
  // across steps, so when the exercise changes the toggle resets to that
  // exercise's default — the web's `useEffect … [currentExerciseIndex]`
  // rule — while a manual toggle sticks for the exercise it was made on.
  const [unitOverride, setUnitOverride] = useState<{
    forType?: string | null;
    unit: DurationUnit;
  } | null>(null);
  const durationUnit =
    unitOverride && unitOverride.forType === trackingType
      ? unitOverride.unit
      : defaultDurationUnit(trackingType);
  // The web's rule, verbatim: the doubled total is shown when the member is
  // loading a PAIR and a positive weight has been entered. A goblet squat, a
  // carry and any single-arm dumbbell work are one implement by default, and
  // the member can say "one" on anything else — either way `showsBellTotal`
  // is false and no total is claimed (`lib/live/bellCount.ts`).
  const bellCount = bells ?? defaultBellCount(bell);
  const perBell = state.weight ?? prefill?.weight;
  const helper =
    showsBellTotal(bell, bellCount) && typeof perBell === "number" && Number.isFinite(perBell) && perBell > 0
      ? bellTotalLabel(perBell, weightUnit)
      : null;
  // The web's "Logging as Dumbbell" disclosure
  // (`EquipmentAssumptionRow` ← `equipmentAssumption`): shown only when the
  // app applies an implement the displayed name does not state. "Dumbbell
  // Bench Press" needs no chip; "Rear Delt Fly" does. Aliases never count as
  // disclosure — the member was shown the name, not the alias.
  const assumption = equipmentAssumption({ name: exerciseName, equipment });
  const assumptionLabel =
    assumption.assumed && assumption.label ? `Logging as ${assumption.label}` : null;
  // The web's quick-pick loads for the weight box (`weightQuickPicks`): a
  // tap fills the per-implement number, exactly as if it had been typed. In
  // the member's own unit — the same `weightUnit` that names the box — so a kg
  // member gets kg equipment numbers, not the pound ladder relabelled.
  const quickPicks = showQuickPicks ? weightQuickPicks(bell.style, weightUnit) : [];

  // See `useNumberDraft` above: each of these keeps the decimal point the
  // member just typed on screen instead of letting the next render's
  // `String(number)` erase it.
  const [weightDraft, onWeightChangeText] = useNumberDraft(state.weight, (weight) =>
    onChange({ ...state, weight }),
  );
  const [distanceDraft, onDistanceChangeText] = useNumberDraft(state.distance, (distance) =>
    onChange({ ...state, distance }),
  );
  const [speedDraft, onSpeedChangeText] = useNumberDraft(state.speed, (speed) =>
    onChange({ ...state, speed }),
  );
  // Duration has its own flavour: the stored value is always seconds but the
  // member types in whichever unit the sec/min toggle is showing, so the
  // "did this change come from outside?" check has to compare BOTH the
  // seconds and the unit, not just the seconds.
  const durationNormalized = state.durationSec ?? null;
  const [durationDraft, setDurationDraft] = useState<string>(() =>
    secondsToUnitDisplay(durationNormalized, durationUnit),
  );
  const durationSentRef = useRef<{ seconds: number | null; unit: DurationUnit }>({
    seconds: durationNormalized,
    unit: durationUnit,
  });
  useEffect(() => {
    if (
      durationNormalized !== durationSentRef.current.seconds ||
      durationUnit !== durationSentRef.current.unit
    ) {
      durationSentRef.current = { seconds: durationNormalized, unit: durationUnit };
      setDurationDraft(secondsToUnitDisplay(durationNormalized, durationUnit));
    }
  }, [durationNormalized, durationUnit]);
  const onDurationChangeText = (text: string) => {
    setDurationDraft(text);
    const seconds = unitDisplayToSeconds(text, durationUnit);
    const parsedSeconds = seconds === "" ? null : Number(seconds);
    durationSentRef.current = { seconds: parsedSeconds, unit: durationUnit };
    onChange({ ...state, durationSec: parsedSeconds });
  };

  return (
    <View
      testID={tid}
      // A LOGGED SET LOOKS LOGGED (NP-381). Jon: "It doesn't have any
      // variation when logging." The web's Track row answers a completed set
      // with a green wash — `bg-green-100 dark:bg-green-900/20` against
      // `bg-white dark:bg-zinc-800`
      // (`webapp/app/dashboard/workout/[programId]/workout/WorkoutFormClient.tsx`
      // ~1919) — so a glance down the grid says what is done. Natively every
      // row was `bg-card` whatever its state, and the only thing that changed
      // was the tick itself.
      className={`flex-row items-center gap-2 mb-2 p-2 border rounded-xl ${
        state.completed
          ? "bg-green-100 dark:bg-green-900/20 border-green-300 dark:border-green-800"
          : "bg-card border-border"
      }`}
    >
      <Text
        testID={`${tid}-label`}
        className="text-foreground font-semibold w-8"
      >
        {setIndex + 1}
      </Text>
      {roundLabel ? (
        <Text
          testID={`${tid}-round`}
          className="text-muted-foreground text-xs font-semibold"
        >
          {roundLabel}
        </Text>
      ) : null}
      {inputs.weight ? (
        <View style={{ flex: 1 }}>
          <Input
            testID={`${tid}-weight`}
            label={getWeightLabel(bell.style, compact, weightUnit)}
            keyboardType="decimal-pad"
            value={weightDraft}
            onChangeText={onWeightChangeText}
            placeholder={
              prefill?.weight !== null && prefill?.weight !== undefined
                ? String(prefill.weight)
                : "0"
            }
          />
          {!compact && helper ? (
            <Text
              testID={`${tid}-helper`}
              className="text-muted-foreground text-xs mt-1"
            >
              {helper}
            </Text>
          ) : null}
          {!compact && assumptionLabel ? (
            <Text
              testID={`${tid}-assumption`}
              className="text-muted-foreground text-xs mt-1"
            >
              {assumptionLabel}
            </Text>
          ) : null}
          {quickPicks.length > 0 ? (
            // ONE SIDEWAYS STRIP, never a wrapping grid (NP-381). The web's
            // only quick picks are the live view's `flex gap-2 overflow-x-auto`
            // strip; natively the TRACK row wrapped a dozen pills into three
            // or four lines under the weight box, which is most of the "lot
            // more spacing" in the set grid — a two-set exercise grew taller
            // than the phone. Same pills, same testIDs, one line.
            <ScrollView
              testID={`${tid}-quick-picks`}
              horizontal
              showsHorizontalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              style={{ marginTop: compact ? 4 : 6 }}
              contentContainerStyle={{ flexDirection: "row", gap: compact ? 4 : 6 }}
            >
              {quickPicks.map((pick) => (
                <Pressable
                  key={pick}
                  testID={`${tid}-quick-pick-${pick}`}
                  accessibilityRole="button"
                  accessibilityLabel={quickPickLabel(pick, weightUnit)}
                  onPress={() => onChange({ ...state, weight: pick })}
                  className={
                    compact
                      ? "rounded-full bg-muted px-2.5 py-1"
                      : "rounded-full bg-muted px-3 py-1.5"
                  }
                >
                  <Text className="text-muted-foreground text-xs font-semibold">
                    {String(pick)}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          ) : null}
          {!compact && prefill ? (
            <Text
              testID={`${tid}-prefill`}
              className="text-muted-foreground text-xs mt-1"
            >
              Last: {prefill.weight ?? "—"} × {prefill.reps ?? "—"}
            </Text>
          ) : null}
        </View>
      ) : null}
      {inputs.reps ? (
        <View style={{ flex: 1 }}>
          <Input
            testID={`${tid}-reps`}
            label="Reps"
            keyboardType="number-pad"
            value={state.reps !== null ? String(state.reps) : ""}
            onChangeText={(text) => onChange({ ...state, reps: parseNum(text) })}
            placeholder={
              prefill?.reps !== null && prefill?.reps !== undefined
                ? String(prefill.reps)
                : targetReps != null
                  ? String(targetReps).split("-")[0]?.replace(/[^0-9]/g, "") || "0"
                  : "0"
            }
          />
        </View>
      ) : null}
      {inputs.duration ? (
        <View style={{ flex: 1 }}>
          <View
            testID={`${tid}-duration-header`}
            style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}
          >
            <Text
              testID={`${tid}-duration-label`}
              className="text-foreground text-sm font-medium mb-1"
            >
              {`Time (${durationUnit})`}
            </Text>
            <Pressable
              testID={`${tid}-duration-toggle`}
              accessibilityRole="button"
              accessibilityLabel={`Show duration in ${durationUnit === "sec" ? "minutes" : "seconds"}`}
              onPress={() =>
                setUnitOverride({
                  forType: trackingType,
                  unit: durationUnit === "sec" ? "min" : "sec",
                })
              }
              className="rounded-full bg-muted px-2 py-0.5"
            >
              <Text className="text-muted-foreground text-xs font-semibold">
                {durationUnit === "sec" ? "min" : "sec"}
              </Text>
            </Pressable>
          </View>
          <Input
            testID={`${tid}-duration`}
            keyboardType="decimal-pad"
            value={durationDraft}
            onChangeText={onDurationChangeText}
            placeholder={
              prefill?.durationSec != null
                ? secondsToUnitDisplay(prefill.durationSec, durationUnit)
                : targetDuration != null
                  ? String(targetDuration).replace(/[^0-9]/g, "") || "30"
                  : "0"
            }
          />
        </View>
      ) : null}
      {inputs.distance ? (
        <View style={{ flex: 1 }}>
          <Input
            testID={`${tid}-distance`}
            label={isFloorsExercise(exerciseName) ? "Floors" : "Dist (m)"}
            keyboardType="decimal-pad"
            value={distanceDraft}
            onChangeText={onDistanceChangeText}
            placeholder={
              prefill?.distance != null ? String(prefill.distance) : "0"
            }
          />
        </View>
      ) : null}
      {inputs.speed ? (
        <View style={{ flex: 1 }}>
          <Input
            testID={`${tid}-speed`}
            label="Speed (mph)"
            keyboardType="decimal-pad"
            value={speedDraft}
            onChangeText={onSpeedChangeText}
            placeholder={
              prefill?.speed != null ? String(prefill.speed) : "0.0"
            }
          />
        </View>
      ) : null}
      {compact && !state.completed && !state.weight && !state.reps && !state.durationSec && !state.distance && !state.speed ? (
        <Pressable
          testID={`${tid}-skip`}
          accessibilityRole="button"
          accessibilityLabel={`Skip set ${setIndex + 1}`}
          onPress={() => {
            if (onSkip) {
              onSkip();
            } else {
              onChange({
                ...state,
                reps: null,
                weight: null,
                durationSec: null,
                distance: null,
                speed: null,
                completed: true,
              });
            }
          }}
          className="w-9 h-9 rounded-lg border border-border items-center justify-center bg-card"
        >
          <ChevronsRight size={16} color={colors["muted-foreground"]} />
        </Pressable>
      ) : null}
      {hideComplete ? null : (
        <Pressable
          testID={`${tid}-complete`}
          onPress={() => onChange({ ...state, completed: !state.completed })}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: state.completed }}
          accessibilityLabel={`Mark set ${setIndex + 1} ${state.completed ? "incomplete" : "complete"}`}
          className={
            compact
              ? `w-9 h-9 rounded-lg items-center justify-center border ${
                  state.completed
                    ? "bg-success border-success"
                    : "bg-card border-border"
                }`
              : `w-10 h-10 rounded-full items-center justify-center ${
                  state.completed ? "bg-primary" : "bg-muted"
                }`
          }
        >
          <Check
            color={
              state.completed
                ? colors["primary-foreground"]
                : colors["muted-foreground"]
            }
            size={compact ? 18 : 20}
            strokeWidth={compact ? 2 : 1.5}
          />
        </Pressable>
      )}
    </View>
  );
}
