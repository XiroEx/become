import React, { useEffect, useState } from "react";
import { View, Pressable } from "react-native";
import { BottomSheet } from "@/components/BottomSheet";
import { Text } from "@/components/Text";
import { Input } from "@/components/Input";
import { Button } from "@/components/Button";
import { goalLine } from "@/lib/checkin/goalLine";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";
import { X, Scale } from "lucide-react-native";
import type { WeightUnit } from "@become/core";

export interface WeightLogSheetProps {
  visible: boolean;
  onClose: () => void;
  onLogged?: (weight: number) => void;
  onSubmit?: (weight: number) => Promise<void> | void;
  lastWeight?: number | null;
  targetWeight?: number | null;
  weightUnit?: WeightUnit;
  testID?: string;
}

export function WeightLogSheet({
  visible,
  onClose,
  onLogged,
  onSubmit,
  lastWeight,
  targetWeight,
  weightUnit = "lbs",
  testID = "weight-log-sheet",
}: WeightLogSheetProps) {
  const { colors, tint } = useThemeTokens();
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (visible) {
      setValue(lastWeight ? String(lastWeight) : "");
      setError(null);
      setSaving(false);
    }
  }, [visible, lastWeight]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const handleSubmit = async () => {
    const w = parseFloat(value);
    if (!Number.isFinite(w) || w <= 0 || saving) return;
    setSaving(true);
    setError(null);
    try {
      if (onSubmit) {
        await onSubmit(w);
      }
      onLogged?.(w);
      onClose();
    } catch {
      setError("Failed to log weight. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const parsedVal = parseFloat(value);
  const isSubmitDisabled = saving || !value.trim() || !(parsedVal > 0);

  return (
    <BottomSheet
      testID={testID}
      visible={visible}
      onClose={onClose}
    >
      <View style={{ gap: 16 }}>
        {/* Header — NP-316/NP-323: a SINGLE flex row with the icon badge,
            title column (`flex: 1`, `minWidth: 0`, `numberOfLines`) and the
            close button (fixed size, `flexShrink: 0`) all as direct
            siblings. The title used to sit inside its OWN non-flex wrapper
            row alongside the badge, which had no basis to shrink against —
            so on Android the title could grow past the sheet's padding and
            push the close X off the right edge of the screen instead of
            truncating. */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 12,
          }}
        >
          <View
            style={{
              width: 40,
              height: 40,
              borderRadius: 10,
              backgroundColor: tint("muted", 0.5),
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Scale size={20} color={colors["muted-foreground"]} />
          </View>
          <View testID={`${testID}-title-group`} style={{ flex: 1, minWidth: 0 }}>
            <Text
              numberOfLines={1}
              className="text-foreground text-lg font-bold"
            >
              Log Weight
            </Text>
            {targetWeight != null && targetWeight > 0 ? (
              <Text numberOfLines={1} className="text-muted-foreground text-xs">
                Goal: {targetWeight} {weightUnit}
              </Text>
            ) : null}
          </View>
          <Pressable
            testID={`${testID}-close`}
            onPress={onClose}
            disabled={saving}
            accessibilityRole="button"
            accessibilityLabel="Close"
            hitSlop={8}
            style={{
              width: 32,
              height: 32,
              borderRadius: 16,
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <X size={18} color={colors["muted-foreground"]} />
          </Pressable>
        </View>

        {/* Form */}
        <View style={{ gap: 6 }}>
          <Text className="text-foreground text-sm font-medium">
            Weight ({weightUnit})
          </Text>
          <Input
            testID={`${testID}-input`}
            value={value}
            onChangeText={setValue}
            keyboardType="decimal-pad"
            placeholder="e.g., 185.5"
            accessibilityLabel="Weight"
            textAlign="center"
            editable={!saving}
          />
          {targetWeight != null && targetWeight > 0 && (
            <Text
              testID={`${testID}-goal-line`}
              className="text-xs text-muted-foreground text-center mt-1"
            >
              {goalLine(value, targetWeight, weightUnit)}
            </Text>
          )}
        </View>

        {error ? (
          <Text
            testID={`${testID}-error`}
            className="text-destructive text-xs text-center"
          >
            {error}
          </Text>
        ) : null}

        <Button
          testID={`${testID}-submit`}
          onPress={handleSubmit}
          loading={saving}
          disabled={isSubmitDisabled}
          accessibilityLabel="Log Weight"
        >
          {saving ? "Logging…" : "Log Weight"}
        </Button>
      </View>
    </BottomSheet>
  );
}
