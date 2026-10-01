import { useState, useEffect } from "react";
import { View } from "react-native";
import { Text } from "@/components/Text";
import { BottomSheet } from "@/components/BottomSheet";
import { Button } from "@/components/Button";
import { Input } from "@/components/Input";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";
import { goalLine } from "@/lib/goalLine";
import { formatWeight, type WeightUnit } from "@become/core";

export interface WeightLogSheetProps {
  visible: boolean;
  onClose: () => void;
  onSubmit?: (weight: number) => Promise<void> | void;
  onLogged?: (weight: number) => void;
  lastWeight?: number | null;
  targetWeight?: number | null;
  unit?: WeightUnit;
  testID?: string;
}

export function WeightLogSheet({
  visible,
  onClose,
  onSubmit,
  onLogged,
  lastWeight,
  targetWeight,
  unit = "lbs",
  testID = "weight-log-sheet",
}: WeightLogSheetProps) {
  const { colors } = useThemeTokens();
  const [value, setValue] = useState<string>("");
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (visible) {
      setValue(lastWeight != null && lastWeight > 0 ? String(lastWeight) : "");
      setError(null);
      setSaving(false);
    }
  }, [visible, lastWeight]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const handleSubmit = async () => {
    const parsed = parseFloat(value);
    if (!parsed || parsed <= 0 || saving) return;
    setSaving(true);
    setError(null);
    try {
      if (onSubmit) {
        await onSubmit(parsed);
      }
      onLogged?.(parsed);
      onClose();
    } catch {
      setError("Couldn't save your weight. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const parsedValue = parseFloat(value);
  const isValid = Number.isFinite(parsedValue) && parsedValue > 0;

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title="Log Weight"
      testID={testID}
      accessibilityLabel="Log Weight"
    >
      <View style={{ gap: 12 }}>
        {targetWeight != null && targetWeight > 0 ? (
          <Text
            style={{
              fontSize: 12,
              color: colors["muted-foreground"],
            }}
          >
            Goal: {formatWeight(targetWeight, unit)} {unit}
          </Text>
        ) : null}

        <View style={{ gap: 6 }}>
          <Text
            style={{
              fontSize: 14,
              fontWeight: "500",
              color: colors.foreground,
            }}
          >
            {`Weight (${unit})`}
          </Text>
          <Input
            testID={`${testID}-input`}
            value={value}
            onChangeText={(t) => {
              setValue(t);
              if (error) setError(null);
            }}
            placeholder={unit === "kg" ? "e.g., 84.2" : "e.g., 185.5"}
            keyboardType="decimal-pad"
            accessibilityLabel={`Weight (${unit})`}
          />
          {targetWeight != null && targetWeight > 0 ? (
            <Text
              testID={`${testID}-goal-line`}
              style={{
                fontSize: 12,
                color: colors["muted-foreground"],
                textAlign: "center",
                marginTop: 4,
              }}
            >
              {goalLine(value, targetWeight, unit)}
            </Text>
          ) : null}
        </View>

        {error ? (
          <Text
            testID={`${testID}-error`}
            accessibilityRole="alert"
            style={{
              fontSize: 12,
              color: colors.destructive,
            }}
          >
            {error}
          </Text>
        ) : null}

        <Button
          testID={`${testID}-submit`}
          accessibilityLabel="Log Weight"
          onPress={handleSubmit}
          disabled={saving || !isValid}
          loading={saving}
          variant="primary"
        >
          Log Weight
        </Button>
      </View>
    </BottomSheet>
  );
}

export default WeightLogSheet;
