import { useState } from "react";
import { View, Pressable } from "react-native";
import { Text } from "@/components/Text";
import { Check } from "lucide-react-native";
import { Input } from "@/components/Input";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";
import {
  bellWeightLabel,
  defaultDurationUnit,
  isFloorsExercise,
  normalizeTracking,
  secondsToUnitDisplay,
  tracksSpeed,
  tracksTime,
  unitDisplayToSeconds,
  type BellWeightInfo,
  type DurationUnit,
} from "@become/core";

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
  /** The exercise's displayed name, for the Floors-vs-metres distance label. */
  exerciseName?: string;
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
  onChange: (next: LiveSetState) => void;
  testID?: string;
}

/** Parse an input string to a number-or-null, ignoring non-finite garbage. */
function parseNum(text: string): number | null {
  if (text === "") return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

export function LiveSetRow({
  setIndex,
  bell = NO_BELL,
  exerciseName,
  state,
  prefill,
  trackingType,
  roundLabel,
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
  // The web's rule, verbatim: the doubled total is shown when the implement is
  // one of a loaded PAIR and a positive weight has been entered. A goblet
  // squat, a carry and any single-arm dumbbell work are one implement, so
  // `showTotal` is false for them and no total is claimed.
  const perBell = state.weight ?? prefill?.weight;
  const helper =
    bell.showTotal && typeof perBell === "number" && Number.isFinite(perBell) && perBell > 0
      ? `= ${perBell * 2} lbs total`
      : null;

  return (
    <View
      testID={tid}
      className="flex-row items-center gap-2 mb-2 p-2 bg-card border border-border rounded-xl"
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
            label={bellWeightLabel(bell.style)}
            keyboardType="decimal-pad"
            value={state.weight !== null ? String(state.weight) : ""}
            onChangeText={(text) =>
              onChange({ ...state, weight: parseNum(text) })
            }
            placeholder={
              prefill?.weight !== null && prefill?.weight !== undefined
                ? String(prefill.weight)
                : "0"
            }
          />
          {helper ? (
            <Text
              testID={`${tid}-helper`}
              className="text-muted-foreground text-xs mt-1"
            >
              {helper}
            </Text>
          ) : null}
          {prefill ? (
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
            value={secondsToUnitDisplay(state.durationSec, durationUnit)}
            onChangeText={(text) => {
              const seconds = unitDisplayToSeconds(text, durationUnit);
              onChange({
                ...state,
                durationSec: seconds === "" ? null : Number(seconds),
              });
            }}
            placeholder={
              prefill?.durationSec != null
                ? secondsToUnitDisplay(prefill.durationSec, durationUnit)
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
            value={
              state.distance !== null && state.distance !== undefined
                ? String(state.distance)
                : ""
            }
            onChangeText={(text) =>
              onChange({ ...state, distance: parseNum(text) })
            }
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
            value={
              state.speed !== null && state.speed !== undefined
                ? String(state.speed)
                : ""
            }
            onChangeText={(text) =>
              onChange({ ...state, speed: parseNum(text) })
            }
            placeholder={
              prefill?.speed != null ? String(prefill.speed) : "0.0"
            }
          />
        </View>
      ) : null}
      <Pressable
        testID={`${tid}-complete`}
        onPress={() => onChange({ ...state, completed: !state.completed })}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: state.completed }}
        accessibilityLabel={`Mark set ${setIndex + 1} ${state.completed ? "incomplete" : "complete"}`}
        className={`w-10 h-10 rounded-full items-center justify-center ${
          state.completed ? "bg-primary" : "bg-muted"
        }`}
      >
        <Check
          color={
            state.completed
              ? colors["primary-foreground"]
              : colors["muted-foreground"]
          }
          size={20}
          strokeWidth={1.5}
        />
      </Pressable>
    </View>
  );
}
