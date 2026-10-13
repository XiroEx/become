import { useState, useMemo } from "react";
import { View, ScrollView, KeyboardAvoidingView, Platform, Pressable } from "react-native";
import { X, Zap } from "lucide-react-native";
import { BottomSheet } from "@/components/BottomSheet";
import { Input } from "@/components/Input";
import { Button } from "@/components/Button";
import { Text } from "@/components/Text";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";

export interface QuickAddData {
  calories: number;
  protein?: number;
  carbs?: number;
  fats?: number;
  note?: string;
}

export interface QuickAddSheetProps {
  visible: boolean;
  onClose: () => void;
  onSubmit: (data: QuickAddData) => void | Promise<void>;
  loading?: boolean;
}

export function QuickAddSheet({
  visible,
  onClose,
  onSubmit,
  loading = false,
}: QuickAddSheetProps) {
  const { colors, tint } = useThemeTokens();
  const [calories, setCalories] = useState("");
  const [protein, setProtein] = useState("");
  const [carbs, setCarbs] = useState("");
  const [fats, setFats] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const calculatedCalories = useMemo(() => {
    const p = Number(protein) || 0;
    const c = Number(carbs) || 0;
    const f = Number(fats) || 0;
    if (p === 0 && c === 0 && f === 0) return null;
    return p * 4 + c * 4 + f * 9;
  }, [protein, carbs, fats]);

  const handleClose = () => {
    setCalories("");
    setProtein("");
    setCarbs("");
    setFats("");
    setNote("");
    setError(null);
    onClose();
  };

  const handleSubmit = () => {
    const cal = Number(calories);
    if (!calories.trim() || isNaN(cal) || cal <= 0) {
      setError("Please enter valid calories (> 0)");
      return;
    }

    const p = protein.trim() ? Number(protein) : 0;
    const c = carbs.trim() ? Number(carbs) : 0;
    const f = fats.trim() ? Number(fats) : 0;

    if (isNaN(p) || p < 0 || isNaN(c) || c < 0 || isNaN(f) || f < 0) {
      setError("Macros must be non-negative numbers");
      return;
    }

    onSubmit({
      calories: Math.round(cal),
      protein: Math.round(p),
      carbs: Math.round(c),
      fats: Math.round(f),
      note: note.trim() || undefined,
    });

    handleClose();
  };

  return (
    <BottomSheet
      visible={visible}
      onClose={handleClose}
      // The header row below is the web's single title (lightning icon +
      // "Quick Add" + X) — BottomSheet's own big title would just repeat it.
      testID="quick-add-sheet"
      accessibilityLabel="Quick Add Sheet"
      // NP-316: bounding the sheet lets the ScrollView below actually scroll
      // once the keyboard eats into the available height — without a cap the
      // sheet sizes itself to its natural (un-keyboard-aware) content height
      // and nothing can shrink to make room.
      sheetStyle={{ maxHeight: "90%" }}
    >
      <KeyboardAvoidingView
        // NP-316: on Android, `behavior={undefined}` left this sheet's own
        // Modal window to fend for itself — focusing Calories or Note opened
        // the keyboard directly over the macros/Note/Cancel+Add without the
        // sheet lifting, because an RN `Modal` is a separate window that does
        // not inherit the activity's `windowSoftInputMode` resize. `"height"`
        // shrinks this view (and the ScrollView inside it) by the keyboard's
        // height so the focused field and Add stay visible, same fix as the
        // login screen's Android exception (NP-309).
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ gap: 14, paddingBottom: 8 }}
        >
          {/* Header icon badge + title + close — matches the web's centred
              modal header exactly; no extra subtitle underneath. */}
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 10,
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <View
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 10,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: tint("accent", 0.15),
                }}
              >
                <Zap size={20} color={colors.accent} />
              </View>
              <Text className="text-foreground text-lg font-bold">Quick Add</Text>
            </View>
            <Pressable
              testID="quick-add-close-button"
              accessibilityRole="button"
              accessibilityLabel="Close"
              onPress={handleClose}
              hitSlop={8}
              style={{
                width: 32,
                height: 32,
                borderRadius: 16,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <X size={20} color={colors["muted-foreground"]} />
            </Pressable>
          </View>

          {/* Calories (required) */}
          <Input
            testID="quick-add-calories-input"
            label="Calories *"
            placeholder="e.g., 350"
            keyboardType="numeric"
            value={calories}
            onChangeText={(val) => {
              setCalories(val);
              if (error) setError(null);
            }}
            error={error ?? undefined}
          />

          {/* Macros (optional) */}
          <View>
            <Text className="text-foreground text-sm font-medium mb-1">
              Macros{" "}
              <Text className="text-muted-foreground text-xs">(optional)</Text>
            </Text>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <View style={{ flex: 1 }}>
                <Text
                  style={{ color: colors.info, textAlign: "center" }}
                  className="text-[11px] font-medium mb-1"
                >
                  Protein
                </Text>
                <Input
                  testID="quick-add-protein-input"
                  placeholder="g"
                  keyboardType="numeric"
                  value={protein}
                  onChangeText={(val) => {
                    setProtein(val);
                    if (error) setError(null);
                  }}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text
                  style={{ color: colors.success, textAlign: "center" }}
                  className="text-[11px] font-medium mb-1"
                >
                  Carbs
                </Text>
                <Input
                  testID="quick-add-carbs-input"
                  placeholder="g"
                  keyboardType="numeric"
                  value={carbs}
                  onChangeText={(val) => {
                    setCarbs(val);
                    if (error) setError(null);
                  }}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text
                  style={{ color: colors.accent, textAlign: "center" }}
                  className="text-[11px] font-medium mb-1"
                >
                  Fats
                </Text>
                <Input
                  testID="quick-add-fats-input"
                  placeholder="g"
                  keyboardType="numeric"
                  value={fats}
                  onChangeText={(val) => {
                    setFats(val);
                    if (error) setError(null);
                  }}
                />
              </View>
            </View>

            {/* Calculated calories preview */}
            {calculatedCalories !== null && (
              <View
                testID="quick-add-calculated-calories"
                style={{
                  marginTop: 6,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text className="text-muted-foreground text-xs">
                  Macros ={" "}
                  <Text className="text-foreground font-semibold">
                    {calculatedCalories} cal
                  </Text>
                  {calories &&
                    Number(calories) > 0 &&
                    Number(calories) !== calculatedCalories && (
                      <Text className="text-accent font-medium">
                        {" "}(differs from entered calories)
                      </Text>
                    )}
                </Text>
              </View>
            )}
          </View>

          {/* Note (optional) */}
          <Input
            testID="quick-add-note-input"
            label="Note (optional)"
            placeholder="e.g., Post-workout shake"
            value={note}
            onChangeText={setNote}
          />

          {/* Action buttons */}
          <View style={{ flexDirection: "row", gap: 12, marginTop: 8 }}>
            <View style={{ flex: 1 }}>
              <Button
                testID="quick-add-cancel-button"
                variant="secondary"
                onPress={handleClose}
              >
                Cancel
              </Button>
            </View>
            <View style={{ flex: 1 }}>
              <Button
                testID="quick-add-submit-button"
                variant="inverted"
                loading={loading}
                onPress={handleSubmit}
              >
                Add
              </Button>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </BottomSheet>
  );
}
