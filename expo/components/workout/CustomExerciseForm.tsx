import { useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { Text } from "@/components/Text";
import { Input } from "@/components/Input";
import { Button } from "@/components/Button";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";
import { minTouchTarget } from "@/lib/a11y/touchTarget";
import {
  CUSTOM_EXERCISE_CATEGORIES,
  CUSTOM_EXERCISE_CATEGORY_LABELS,
  CUSTOM_EXERCISE_MUSCLE_GROUPS,
  CUSTOM_EXERCISE_MUSCLE_GROUP_LABELS,
  CUSTOM_EXERCISE_ROLES,
  CUSTOM_EXERCISE_ROLE_HINTS,
  CUSTOM_EXERCISE_ROLE_LABELS,
  CUSTOM_EXERCISE_TRACKING_HINTS,
  CUSTOM_EXERCISE_TRACKING_LABELS,
  CUSTOM_EXERCISE_TRACKING_TYPES,
  applyCategoryChange,
  type CustomExerciseFormValues,
} from "@/lib/workout/customExercises";

export interface CustomExerciseFormProps {
  values: CustomExerciseFormValues;
  onChange: (values: CustomExerciseFormValues) => void;
  /** Server-side refusal text (a 403 that is not a gate, a 400, a 409). */
  error?: string | null;
  submitting?: boolean;
  submitLabel?: string;
  onSubmit: () => void;
  onCancel?: () => void;
  testID?: string;
}

/**
 * THE CUSTOM-EXERCISE FORM — the native `CustomExerciseFields`.
 *
 * Native counterpart of `webapp/components/workout/CustomExerciseFields.tsx`'s
 * core field set (name, tracking type, muscle group, category, role, default
 * sets/reps). The web's Advanced section (exact muscles, equipment, movement
 * patterns, mechanics, laterality, difficulty) stays web-only with demo upload
 * and trim: the server resolves every omitted field to its catalogue default,
 * so a native exercise is complete, not partial.
 *
 * Choosing Bodyweight switches tracking to reps-only (web bug 6ab18beb,
 * fixed on the web first) — applied in `applyCategoryChange` at pick time so
 * the picker the member sees always agrees with what the server stores.
 */
export function CustomExerciseForm({
  values,
  onChange,
  error,
  submitting = false,
  submitLabel = "Create Exercise",
  onSubmit,
  onCancel,
  testID = "custom-exercise-form",
}: CustomExerciseFormProps) {
  const { colors, tint } = useThemeTokens();
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const set = <K extends keyof CustomExerciseFormValues>(
    key: K,
    value: CustomExerciseFormValues[K],
  ) => onChange({ ...values, [key]: value });

  const pickCategory = (category: string) =>
    onChange(applyCategoryChange(values, category));

  return (
    <View testID={testID} style={{ gap: 16 }}>
      <Input
        testID={`${testID}-name`}
        label="Name"
        placeholder="e.g. Seated Leg Curl"
        value={values.name}
        onChangeText={(name) => set("name", name)}
        autoCapitalize="words"
        returnKeyType="done"
      />

      <View>
        <Text
          testID={`${testID}-tracking-label`}
          className="text-foreground text-sm font-medium mb-1"
        >
          Tracking Type
        </Text>
        <View style={{ gap: 6 }}>
          {CUSTOM_EXERCISE_TRACKING_TYPES.map((tracking) => {
            const active = values.trackingType === tracking;
            return (
              <Pressable
                key={tracking}
                testID={`${testID}-tracking-${tracking}`}
                onPress={() => set("trackingType", tracking)}
                accessibilityRole="radio"
                accessibilityState={{ checked: active }}
                accessibilityLabel={CUSTOM_EXERCISE_TRACKING_LABELS[tracking]}
                style={[
                  minTouchTarget,
                  {
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    paddingHorizontal: 12,
                    paddingVertical: 8,
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: active ? colors.success : colors.border,
                    backgroundColor: active ? tint("success", 0.1) : "transparent",
                  },
                ]}
              >
                <Text className="text-foreground text-xs font-medium">
                  {CUSTOM_EXERCISE_TRACKING_LABELS[tracking]}
                </Text>
                <Text className="text-muted-foreground text-xs">
                  {CUSTOM_EXERCISE_TRACKING_HINTS[tracking]}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View>
        <Text className="text-foreground text-sm font-medium mb-1">
          Primary Muscles
        </Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
          {CUSTOM_EXERCISE_MUSCLE_GROUPS.map((group) => {
            const active = values.muscleGroup === group;
            return (
              <Pressable
                key={group}
                testID={`${testID}-muscle-${group}`}
                onPress={() => set("muscleGroup", group)}
                accessibilityRole="radio"
                accessibilityState={{ checked: active }}
                accessibilityLabel={CUSTOM_EXERCISE_MUSCLE_GROUP_LABELS[group]}
                style={[
                  minTouchTarget,
                  {
                    paddingHorizontal: 10,
                    paddingVertical: 4,
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: active ? colors.success : colors.border,
                    backgroundColor: active ? tint("success", 0.1) : "transparent",
                    justifyContent: "center",
                  },
                ]}
              >
                <Text className="text-foreground text-xs font-medium">
                  {CUSTOM_EXERCISE_MUSCLE_GROUP_LABELS[group]}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View>
        <Text className="text-foreground text-sm font-medium mb-1">Category</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
          {CUSTOM_EXERCISE_CATEGORIES.map((category) => {
            const active = values.category === category;
            return (
              <Pressable
                key={category}
                testID={`${testID}-category-${category}`}
                onPress={() => pickCategory(category)}
                accessibilityRole="radio"
                accessibilityState={{ checked: active }}
                accessibilityLabel={CUSTOM_EXERCISE_CATEGORY_LABELS[category]}
                style={[
                  minTouchTarget,
                  {
                    paddingHorizontal: 10,
                    paddingVertical: 4,
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: active ? colors.success : colors.border,
                    backgroundColor: active ? tint("success", 0.1) : "transparent",
                    justifyContent: "center",
                  },
                ]}
              >
                <Text className="text-foreground text-xs font-medium">
                  {CUSTOM_EXERCISE_CATEGORY_LABELS[category]}
                </Text>
              </Pressable>
            );
          })}
        </View>
        {values.category === "bodyweight" ? (
          <Text
            testID={`${testID}-bodyweight-note`}
            className="text-muted-foreground text-xs mt-1"
          >
            Bodyweight exercises track reps only.
          </Text>
        ) : null}
      </View>

      <View>
        <Text className="text-foreground text-sm font-medium mb-1">Role</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
          {CUSTOM_EXERCISE_ROLES.map((role) => {
            const active = values.role === role;
            return (
              <Pressable
                key={role}
                testID={`${testID}-role-${role}`}
                onPress={() => set("role", role)}
                accessibilityRole="radio"
                accessibilityState={{ checked: active }}
                accessibilityLabel={`${CUSTOM_EXERCISE_ROLE_LABELS[role]} — ${CUSTOM_EXERCISE_ROLE_HINTS[role]}`}
                style={[
                  minTouchTarget,
                  {
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 6,
                    paddingHorizontal: 10,
                    paddingVertical: 4,
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: active ? colors.success : colors.border,
                    backgroundColor: active ? tint("success", 0.1) : "transparent",
                    justifyContent: "center",
                  },
                ]}
              >
                <Text className="text-foreground text-xs font-medium">
                  {CUSTOM_EXERCISE_ROLE_LABELS[role]}
                </Text>
                <Text className="text-muted-foreground text-xs">
                  {CUSTOM_EXERCISE_ROLE_HINTS[role]}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View style={{ flexDirection: "row", gap: 12 }}>
        <View style={{ flex: 1 }}>
          <Input
            testID={`${testID}-sets`}
            label="Default Sets"
            value={values.defaultSets}
            onChangeText={(defaultSets) => set("defaultSets", defaultSets)}
            keyboardType="number-pad"
            placeholder="3"
          />
        </View>
        <View style={{ flex: 1 }}>
          <Input
            testID={`${testID}-reps`}
            label="Reps (e.g. 8-12)"
            value={values.defaultReps}
            onChangeText={(defaultReps) => set("defaultReps", defaultReps)}
            placeholder="8-12"
          />
        </View>
      </View>

      {/* Advanced detail (exact muscles, equipment, movement) stays on the web
          with demo upload and trim — this discloses that instead of faking it.
          Web's own collapsed subtitle ("Exact muscles, equipment & movement",
          `CustomExerciseFields.tsx`) rides along here too (NP-276). */}
      <Pressable
        testID={`${testID}-advanced-toggle`}
        onPress={() => setAdvancedOpen((open) => !open)}
        accessibilityRole="button"
        accessibilityState={{ expanded: advancedOpen }}
        accessibilityLabel="Advanced details"
        style={[minTouchTarget, { justifyContent: "center" }]}
      >
        <Text className="text-foreground text-xs font-medium">
          Advanced <Text className="text-muted-foreground font-normal">· optional</Text>
        </Text>
        <Text
          testID={`${testID}-advanced-hint`}
          className="text-muted-foreground text-[11px]"
        >
          {advancedOpen
            ? "Exact muscles, equipment and movement stay on the web"
            : "Exact muscles, equipment & movement"}
        </Text>
      </Pressable>
      {advancedOpen ? (
        <Text
          testID={`${testID}-advanced-note`}
          className="text-muted-foreground text-xs"
        >
          Add exact muscles, equipment and movement detail from the web library
          — everything else about this exercise is complete as entered here.
        </Text>
      ) : null}

      {error ? (
        <Text
          testID={`${testID}-error`}
          accessibilityRole="alert"
          className="text-destructive text-xs"
        >
          {error}
        </Text>
      ) : null}

      <View style={{ flexDirection: "row", gap: 12 }}>
        {onCancel ? (
          <View style={{ flex: 1 }}>
            <Button
              testID={`${testID}-cancel`}
              variant="secondary"
              onPress={onCancel}
              disabled={submitting}
            >
              Cancel
            </Button>
          </View>
        ) : null}
        <View style={{ flex: 1 }}>
          <Button
            testID={`${testID}-submit`}
            onPress={onSubmit}
            loading={submitting}
            disabled={submitting || values.name.trim().length === 0}
            accessibilityLabel={submitLabel}
          >
            {submitLabel}
          </Button>
        </View>
      </View>
    </View>
  );
}

export function CustomExerciseFormScroll({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      {children}
    </ScrollView>
  );
}

export default CustomExerciseForm;
