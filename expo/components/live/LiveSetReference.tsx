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
 */
export function formatLastLine(
  trackingType: string | null | undefined,
  history: ExerciseHistoryEntry | null | undefined,
  durationUnit: DurationUnit = "sec",
): string | null {
  if (!history) return null;
  if (tracksTime(normalizeTracking(trackingType))) {
    const lastSeconds = history.duration || history.reps;
    if (!lastSeconds) return "completed";
    return durationUnit === "min"
      ? `${secondsToUnitDisplay(lastSeconds, "min")}m`
      : `${lastSeconds}s`;
  }
  if (history.weight > 0) return `${history.weight} lbs × ${history.reps} reps`;
  return history.reps > 0 ? `${history.reps} reps` : "completed";
}

/**
 * The web's PR line: `PR: N lbs`, only when the stored PR weight is > 0.
 * Null otherwise — no PR record means no PR line.
 */
export function formatPRLine(
  pr: ExercisePRSummary | null | undefined,
): string | null {
  if (!pr || !(pr.weight > 0)) return null;
  return `PR: ${pr.weight} lbs`;
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
  testID,
}: LiveSetReferenceProps) {
  const tid = testID ?? `live-reference-${exerciseName}`;
  const unit = durationUnit ?? defaultDurationUnit(trackingType);
  const last = formatLastLine(trackingType, history, unit);
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
