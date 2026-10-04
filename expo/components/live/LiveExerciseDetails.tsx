import { View } from "react-native";
import { Text } from "@/components/Text";

export interface LiveExerciseDetailsProps {
  /** Coaching tip / cue (the web's `tip`, green). */
  tip?: string;
  /** Tempo prescription (the web's `tempo`, e.g. "3-1-1"). */
  tempo?: string;
  /** RPE prescription (the web's `rpe`). */
  rpe?: number;
  /** Timed prescription string (the web's `duration`, e.g. "30s"). */
  durationLabel?: string;
  /** Target muscles (the web's `primaryMuscles`); up to 3 shown as pills. */
  primaryMuscles?: string[];
  testID?: string;
}

/**
 * The web's prescription line
 * (`webapp/.../workout/live/LiveWorkoutClient.tsx` lines ~2378-2404): the
 * tip (green), one line `duration · Tempo x · RPE y` built from only the
 * parts present, and up to 3 primary-muscle pills with `_` shown as spaces,
 * capitalised. The coach `details` are already shown by `LiveStepView` as
 * `exercise.notes` — this component never renders them.
 *
 * Renders nothing (null) when all are empty.
 */
export function formatPrescriptionLine(
  durationLabel: string | null | undefined,
  tempo: string | null | undefined,
  rpe: number | null | undefined,
): string | null {
  const parts: string[] = [];
  if (durationLabel) parts.push(durationLabel);
  if (tempo) parts.push(`Tempo ${tempo}`);
  if (typeof rpe === "number" && Number.isFinite(rpe)) parts.push(`RPE ${rpe}`);
  return parts.length > 0 ? parts.join(" · ") : null;
}

export function LiveExerciseDetails({
  tip,
  tempo,
  rpe,
  durationLabel,
  primaryMuscles,
  testID,
}: LiveExerciseDetailsProps) {
  const tid = testID ?? "live-exercise-details";
  const line = formatPrescriptionLine(durationLabel, tempo, rpe);
  const pills = (primaryMuscles ?? []).slice(0, 3);
  if (!tip && !line && pills.length === 0) return null;
  return (
    <View testID={tid} style={{ gap: 4 }}>
      {tip ? (
        <Text
          testID={`${tid}-tip`}
          className="text-green-400 text-sm"
        >
          {tip}
        </Text>
      ) : null}
      {line ? (
        <Text
          testID={`${tid}-prescription`}
          className="text-amber-400/80 text-xs"
        >
          {line}
        </Text>
      ) : null}
      {pills.length > 0 ? (
        <View
          testID={`${tid}-muscles`}
          style={{ flexDirection: "row", flexWrap: "wrap", gap: 4 }}
        >
          {pills.map((m) => (
            <Text
              key={m}
              testID={`${tid}-muscle-${m}`}
              className="text-white/50 text-[10px] capitalize"
            >
              {m.replace(/_/g, " ")}
            </Text>
          ))}
        </View>
      ) : null}
    </View>
  );
}
