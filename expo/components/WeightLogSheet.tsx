import { useState } from "react";
import { View } from "react-native";
import { Text } from "@/components/Text";
import { BottomSheet } from "@/components/BottomSheet";
import { Button } from "@/components/Button";
import { Input } from "@/components/Input";
import { useUnits } from "@/lib/hooks/useUnits";
import { goalLine } from "@/lib/goals/goalLine";
import { getOfflineWrites } from "@/lib/offline/writes";
import { Scale } from "lucide-react-native";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";
import type { WeightUnit } from "@become/core";

export interface WeightLogSheetProps {
  visible?: boolean;
  isOpen?: boolean;
  onClose: () => void;
  onLogged?: (weight: number) => void;
  onSubmit?: (weight: number) => Promise<void> | void;
  lastWeight?: number | null;
  targetWeight?: number | null;
  weightUnit?: WeightUnit;
  testID?: string;
}

function useSafeUnits() {
  try {
    return useUnits();
  } catch {
    return { unit: "lbs" as WeightUnit, formatWeight: (w: number) => String(Math.round(w)) };
  }
}

export function WeightLogSheet({
  visible,
  isOpen,
  onClose,
  onLogged,
  onSubmit,
  lastWeight,
  targetWeight,
  weightUnit: weightUnitProp,
  testID = "weight-log-sheet",
}: WeightLogSheetProps) {
  const isSheetVisible = visible ?? isOpen ?? false;
  const { unit: profileUnit, formatWeight } = useSafeUnits();
  const unit = weightUnitProp ?? profileUnit;
  const { colors } = useThemeTokens();

  const [value, setValue] = useState(
    lastWeight != null && lastWeight > 0 ? String(lastWeight) : ""
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [prevProps, setPrevProps] = useState({ visible: isSheetVisible, lastWeight });
  if (
    isSheetVisible !== prevProps.visible ||
    (isSheetVisible && lastWeight !== prevProps.lastWeight)
  ) {
    setPrevProps({ visible: isSheetVisible, lastWeight });
    if (isSheetVisible) {
      setValue(lastWeight != null && lastWeight > 0 ? String(lastWeight) : "");
      setError(null);
    }
  }

  const handleSubmit = async () => {
    const w = parseFloat(value);
    if (!w || w <= 0 || saving) {
      setError("Enter a positive weight");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      if (onSubmit) {
        await onSubmit(w);
      } else {
        await getOfflineWrites().logWeight(w);
      }
      onLogged?.(w);
      onClose();
    } catch {
      setError("Couldn't save your weight. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const liveGoalLine = goalLine(value, targetWeight, unit);

  return (
    <BottomSheet
      testID={testID}
      visible={isSheetVisible}
      onClose={onClose}
    >
      <View className="flex-row items-center gap-3 mb-4">
        <View className="w-10 h-10 rounded-xl bg-muted items-center justify-center">
          <Scale size={20} color={colors.primary} />
        </View>
        <View className="flex-1">
          <Text
            testID={`${testID}-title`}
            className="text-foreground text-lg font-bold"
          >
            Log Weight
          </Text>
          {targetWeight != null && targetWeight > 0 ? (
            <Text
              testID={`${testID}-target`}
              className="text-muted-foreground text-xs"
            >
              Goal: {formatWeight(targetWeight)} {unit}
            </Text>
          ) : null}
        </View>
      </View>

      <Input
        testID={`${testID}-input`}
        label={`Weight (${unit})`}
        keyboardType="decimal-pad"
        value={value}
        onChangeText={setValue}
        placeholder={unit === "kg" ? "80.0" : "185.0"}
      />

      {liveGoalLine ? (
        <Text
          testID={`${testID}-goal-line`}
          className="text-center text-xs text-muted-foreground mt-1.5"
        >
          {liveGoalLine}
        </Text>
      ) : null}

      {error ? (
        <Text
          testID={`${testID}-error`}
          accessibilityRole="alert"
          accessibilityLiveRegion="assertive"
          className="text-destructive text-xs mt-2"
        >
          {error}
        </Text>
      ) : null}

      <View style={{ height: 16 }} />

      <Button
        testID={`${testID}-submit`}
        onPress={handleSubmit}
        loading={saving}
        disabled={saving || !value.trim() || Number(value) <= 0}
      >
        {saving ? "Logging..." : "Log Weight"}
      </Button>
    </BottomSheet>
  );
}

export default WeightLogSheet;
