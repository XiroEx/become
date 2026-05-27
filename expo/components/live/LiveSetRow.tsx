import { View, Text, Pressable } from "react-native";
import { Check } from "lucide-react-native";
import { Input } from "@/components/Input";
import { resolveToken } from "@/lib/theme/tokens";
import {
  type BellStyle,
  totalWeightHelper,
  weightLabel,
} from "@/lib/live/bellStyle";

export interface LiveSetState {
  reps: number | null;
  weight: number | null;
  completed: boolean;
}

export interface LiveSetRowProps {
  setIndex: number;
  bellStyle: BellStyle;
  state: LiveSetState;
  /** Last completed performance of this set (prefill source). */
  prefill?: LiveSetState | null;
  onChange: (next: LiveSetState) => void;
  testID?: string;
}

export function LiveSetRow({
  setIndex,
  bellStyle,
  state,
  prefill,
  onChange,
  testID,
}: LiveSetRowProps) {
  const tid = testID ?? `live-set-${setIndex}`;
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
      <View style={{ flex: 1 }}>
        <Input
          testID={`${tid}-weight`}
          label={weightLabel(bellStyle)}
          keyboardType="decimal-pad"
          value={state.weight !== null ? String(state.weight) : ""}
          onChangeText={(text) => {
            const parsed = text === "" ? null : Number(text);
            onChange({
              ...state,
              weight: Number.isFinite(parsed) ? (parsed as number) : null,
            });
          }}
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
      <View style={{ flex: 1 }}>
        <Input
          testID={`${tid}-reps`}
          label="Reps"
          keyboardType="number-pad"
          value={state.reps !== null ? String(state.reps) : ""}
          onChangeText={(text) => {
            const parsed = text === "" ? null : Number(text);
            onChange({
              ...state,
              reps: Number.isFinite(parsed) ? (parsed as number) : null,
            });
          }}
          placeholder={
            prefill?.reps !== null && prefill?.reps !== undefined
              ? String(prefill.reps)
              : "0"
          }
        />
      </View>
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
