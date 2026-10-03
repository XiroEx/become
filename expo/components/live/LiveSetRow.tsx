import { View, Pressable } from "react-native";
import { Text } from "@/components/Text";
import { Check } from "lucide-react-native";
import { Input } from "@/components/Input";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";
import {
  bellWeightLabel,
  isFloorsExercise,
  normalizeTracking,
  tracksTime,
  type BellWeightInfo,
} from "@become/core";

/** A set with nothing in it — no bell, no total hint. */
export const NO_BELL: BellWeightInfo = { style: null, showTotal: false };

export interface SetInputs {
  weight: boolean;
  reps: boolean;
  duration: boolean;
  distance: boolean;
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
 * The web also offers a speed input and a sec/min toggle for cardio; those are
 * NP-080's UI, not this card's logic.
 */
export function setInputsFor(trackingType?: string | null): SetInputs {
  const t = normalizeTracking(trackingType);
  return {
    weight: t === "reps_weight",
    reps: t === "reps_weight" || t === "reps_bodyweight" || t === "reps_only",
    duration: tracksTime(t),
    distance: t === "time_distance",
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
          <Input
            testID={`${tid}-duration`}
            label="Time (s)"
            keyboardType="number-pad"
            value={
              state.durationSec !== null && state.durationSec !== undefined
                ? String(state.durationSec)
                : ""
            }
            onChangeText={(text) =>
              onChange({ ...state, durationSec: parseNum(text) })
            }
            placeholder={
              prefill?.durationSec != null ? String(prefill.durationSec) : "0"
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
