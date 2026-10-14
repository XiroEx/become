import { View } from "react-native";
import { Text } from "@/components/Text";
import {
  defaultDurationUnit,
  normalizeTracking,
  secondsToUnitDisplay,
  tracksTime,
  type DurationUnit,
} from "@become/core";
import type {
  ExerciseHistoryEntry,
  ExercisePRSummary,
} from "@become/api-client";
import {
  DEFAULT_LOAD_UNIT,
  loadLabel,
  loadRepsLabel,
  storedLoadUnit,
  type WeightUnit,
} from "@/lib/live/bellStyle";

export interface LiveSetReferenceProps {
  /** Exercise NAME — history and PRs are keyed by name, as on the web. */
  exerciseName: string;
  /** Canonical tracking type — selects the Last format and gates NEW PR. */
  trackingType?: string | null;
  /** Best completed set from a log before today (`exerciseHistory[name]`). */
  history?: ExerciseHistoryEntry | null;
  /** Persisted max-weight record (`exercisePRs[name]`). */
  pr?: ExercisePRSummary | null;
  /** What is currently typed in the weight box — never prefilled. */
  typedWeight?: number | null;
  /**
   * The member's lifting-load unit (`profile.weightUnit ?? 'lbs'`, NP-209),
   * used for the `Last:` line — `exerciseHistory` carries no unit of its own
   * (the server's projection does not send one), so it reads in the member's
   * unit exactly as the web's does. The PR line does NOT use this: a PR
   * carries `unit`, and a record is shown in the unit it was set in.
   */
  weightUnit?: WeightUnit;
  /**
   * Display unit for a timed Last line. Defaults to
   * `defaultDurationUnit(trackingType)`, the web's per-exercise default.
   */
  durationUnit?: DurationUnit;
  testID?: string;
}

/**
 * The web's history line
 * (`webapp/.../workout/live/LiveWorkoutClient.tsx`, the `Last:` block):
 * timed or interval work shows seconds (`Ns`, or `N.Nm` in min mode),
 * loaded sets `X lbs × Y reps`, bodyweight `Y reps`, otherwise `completed`.
 * Null when there is no history — the caller renders nothing.
 *
 * `weightUnit` is the MEMBER's unit (NP-209): `exerciseHistory` entries carry
 * no stored unit, so this reads the member's, exactly as the web's line does.
 */
export function formatLastLine(
  trackingType: string | null | undefined,
  history: ExerciseHistoryEntry | null | undefined,
  durationUnit: DurationUnit = "sec",
  weightUnit: WeightUnit = DEFAULT_LOAD_UNIT,
): string | null {
  if (!history) return null;
  if (tracksTime(normalizeTracking(trackingType))) {
    const lastSeconds = history.duration || history.reps;
    if (!lastSeconds) return "completed";
    return durationUnit === "min"
      ? `${secondsToUnitDisplay(lastSeconds, "min")}m`
      : `${lastSeconds}s`;
  }
  if (history.weight > 0)
    return loadRepsLabel(history.weight, history.reps, weightUnit);
  return history.reps > 0 ? `${history.reps} reps` : "completed";
}

/**
 * The web's PR line: `PR: N lbs`, only when the stored PR weight is > 0.
 * Null otherwise — no PR record means no PR line.
 *
 * The unit is the RECORD's own (`IPRDimension.unit`, NP-209), not the
 * member's current preference: a 225 lb record stays 225 lbs after the member
 * switches to kg, because nothing converted it. A PR set before NP-209 has no
 * unit and is grandfathered as lbs.
 */
export function formatPRLine(
  pr: ExercisePRSummary | null | undefined,
): string | null {
  if (!pr || !(pr.weight > 0)) return null;
  return `PR: ${loadLabel(pr.weight, storedLoadUnit(pr.unit))}`;
}

/**
 * The web's NEW PR flag (the `🔥 NEW PR!` span beside the weight label):
 * the typed weight is strictly greater than the stored PR, reps_weight only.
 * Equal does not flag.
 */
export function isNewPR(
  trackingType: string | null | undefined,
  typedWeight: number | null | undefined,
  pr: ExercisePRSummary | null | undefined,
): boolean {
  if (normalizeTracking(trackingType) !== "reps_weight") return false;
  if (!pr || !(pr.weight > 0)) return false;
  return (
    typeof typedWeight === "number" &&
    Number.isFinite(typedWeight) &&
    typedWeight > pr.weight
  );
}

/**
 * LAST + PR + NEW PR on the Live step — references, never prefill.
 *
 * Port of the web block at `LiveWorkoutClient.tsx` lines ~2404-2435 and
 * ~2496. Keyed by exercise NAME as the web does. Blank inputs stay blank:
 * this component only reads `typedWeight`, it never writes an input.
 * Null when there is neither history nor a PR to show.
 */
export function LiveSetReference({
  exerciseName,
  trackingType,
  history,
  pr,
  typedWeight,
  durationUnit,
  weightUnit = DEFAULT_LOAD_UNIT,
  testID,
}: LiveSetReferenceProps) {
  const tid = testID ?? `live-reference-${exerciseName}`;
  const unit = durationUnit ?? defaultDurationUnit(trackingType);
  const last = formatLastLine(trackingType, history, unit, weightUnit);
  const prLine = formatPRLine(pr);
  const showNewPR = isNewPR(trackingType, typedWeight, pr);
  if (!last && !prLine && !showNewPR) return null;
  return (
    <View testID={tid} style={{ gap: 4 }}>
      {last ? (
        <Text
          testID={`${tid}-last`}
          className="text-muted-foreground text-sm"
        >{`Last: ${last}`}</Text>
      ) : null}
      {prLine ? (
        <Text
          testID={`${tid}-pr`}
          className="text-amber-400/80 text-sm font-semibold"
        >{`🏆 ${prLine}`}</Text>
      ) : null}
      {showNewPR ? (
        <Text
          testID={`${tid}-new-pr`}
          className="text-amber-400 text-xs font-bold"
        >
          🔥 NEW PR!
        </Text>
      ) : null}
    </View>
  );
}
