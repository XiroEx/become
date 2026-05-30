import { View, Text, Pressable } from "react-native";
import { Check } from "lucide-react-native";
import { Input } from "@/components/Input";
import { resolveToken } from "@/lib/theme/tokens";
import {
  type BellStyle,
  totalWeightHelper,
  weightLabel,
} from "@/lib/live/bellStyle";
import {
  setInputsForTrackingType,
  type SetInputs,
} from "@/lib/live/trackingInputs";

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
  bellStyle: BellStyle;
  state: LiveSetState;
  /** Last completed performance of this set (prefill source). */
  prefill?: LiveSetState | null;
  /** Canonical exercise trackingType — selects which inputs render. */
  trackingType?: string | null;
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
  bellStyle,
  state,
  prefill,
  trackingType,
  onChange,
  testID,
}: LiveSetRowProps) {
  const tid = testID ?? `live-set-${setIndex}`;
  const inputs: SetInputs = setInputsForTrackingType(trackingType);
  const helper = totalWeightHelper(bellStyle, state.weight ?? prefill?.weight);

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
      {inputs.weight ? (
        <View style={{ flex: 1 }}>
          <Input
            testID={`${tid}-weight`}
            label={weightLabel(bellStyle)}
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
            label="Dist (m)"
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
              ? resolveToken("primary-foreground", "dark")
              : resolveToken("muted-foreground", "dark")
          }
          size={20}
          strokeWidth={1.5}
        />
      </Pressable>
    </View>
  );
}
