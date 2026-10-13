import { useEffect, useMemo, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from "react-native";
import { ChefHat, Clock, Tag as TagIcon, X } from "lucide-react-native";
import { BottomSheet } from "@/components/BottomSheet";
import { Button } from "@/components/Button";
import { Text } from "@/components/Text";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";
import {
  editLoggedMeal,
  formatTime12Hour,
  mealLogTagPatch,
  mealLogTimeInputValue,
  mealLogTimePatch,
  parseTime12Hour,
} from "@/lib/nutrition/editLoggedEntry";

export interface EditLoggedMealSheetProps {
  visible: boolean;
  /** The MealLog id — every item in the log moves together. */
  logId: string | null;
  mealName?: string;
  /** The section this meal is currently shown under. */
  currentTag: string;
  /** Every tag the member can move it to. */
  availableTags?: { defaults: string[]; userTags: string[] };
  loggedAt?: string;
  untimed?: boolean;
  token?: string | null;
  onClose: () => void;
  /** Refetch the day after save. */
  onSaved: () => void | Promise<void>;
  testID?: string;
}

function normalizeTag(tag: string): string {
  return tag.trim().toLowerCase().replace(/\s+/g, "-") || "snack";
}

function tagLabel(tag: string): string {
  return tag
    .split(/[-_\s]+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

/**
 * ─── Move a whole logged meal, natively (NP-095) ─────────────────────────────
 *
 * The web's `EditMealModal.tsx` as a sheet: move every food in the log to
 * another tag together (nothing splits off) and/or change its clock time,
 * keeping the untimed choice.
 */
export function EditLoggedMealSheet({
  visible,
  logId,
  mealName,
  currentTag,
  availableTags,
  loggedAt,
  untimed = false,
  token,
  onClose,
  onSaved,
  testID = "edit-logged-meal",
}: EditLoggedMealSheetProps) {
  const { colors } = useThemeTokens();
  const normalizedCurrentTag = normalizeTag(currentTag);
  const [selectedTag, setSelectedTag] = useState(normalizedCurrentTag);
  const [logTime, setLogTime] = useState(() =>
    mealLogTimeInputValue(loggedAt, untimed),
  );
  const [initialLogTime, setInitialLogTime] = useState(() =>
    mealLogTimeInputValue(loggedAt, untimed),
  );
  // 12-hour display text bound to the input — NP-264 matches the web's
  // `<input type="time">` 12-hour rendering ("4:00 AM") while `logTime`
  // keeps the 24-hour wire format `mealLogTimePatch` expects.
  const [timeText, setTimeText] = useState(() =>
    formatTime12Hour(mealLogTimeInputValue(loggedAt, untimed)),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tagOptions = useMemo(() => {
    const tags = [
      normalizedCurrentTag,
      ...(availableTags?.defaults ?? []),
      ...(availableTags?.userTags ?? []),
    ];
    return Array.from(
      new Set(
        tags
          .map((tag) => normalizeTag(String(tag)))
          .filter(Boolean),
      ),
    );
  }, [normalizedCurrentTag, availableTags]);

  useEffect(() => {
    if (visible) {
      const t = mealLogTimeInputValue(loggedAt, untimed);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- sync from sheet open + new target
      setSelectedTag(normalizedCurrentTag);
      setLogTime(t);
      setInitialLogTime(t);
      setTimeText(formatTime12Hour(t));
      setError(null);
    }
  }, [visible, logId, normalizedCurrentTag, loggedAt, untimed]);

  const hasChanges =
    selectedTag !== normalizedCurrentTag || logTime !== initialLogTime;

  const handleClose = () => {
    if (saving) return;
    setError(null);
    onClose();
  };

  const handleSave = async () => {
    if (!logId || !hasChanges) return;
    setSaving(true);
    setError(null);
    try {
      const tagPatch = mealLogTagPatch(normalizedCurrentTag, selectedTag);
      const timePatch = mealLogTimePatch(loggedAt, logTime);
      await editLoggedMeal({
        logId,
        ...tagPatch,
        ...timePatch,
        token,
      });
      await onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <BottomSheet
      visible={visible}
      onClose={handleClose}
      // The header row below is the web's single title ("EDIT MEAL" + name +
      // X) — BottomSheet's own big title would just repeat it.
      testID={testID}
      accessibilityLabel={mealName ? `Edit ${mealName}` : "Edit logged meal"}
    >
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ gap: 14, paddingBottom: 8 }}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 10,
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flex: 1 }}>
              <View
                className="bg-orange-100 dark:bg-orange-900/30"
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 10,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <ChefHat size={18} color={colors.orange} />
              </View>
              <View style={{ flex: 1 }}>
                <Text className="text-muted-foreground text-[11px] font-medium uppercase">
                  Edit meal
                </Text>
                <Text className="text-foreground text-base font-bold" numberOfLines={1}>
                  {mealName || "Meal"}
                </Text>
              </View>
            </View>
            <Pressable
              testID={`${testID}-close`}
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

          <Text className="text-muted-foreground text-xs">
            Moves every food in this meal together — nothing splits off.
          </Text>

          <View style={{ gap: 6 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <TagIcon size={12} color={colors["muted-foreground"]} />
              <Text className="text-muted-foreground text-[11px] font-medium uppercase">
                Meal tag
              </Text>
            </View>
            <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
              {tagOptions.map((tag) => {
                const isSelected = selectedTag === tag;
                return (
                  <Pressable
                    key={tag}
                    accessibilityRole="button"
                    accessibilityLabel={`Move to ${tagLabel(tag)}`}
                    testID={`${testID}-tag-${tag}`}
                    onPress={() => setSelectedTag(tag)}
                    style={{
                      paddingHorizontal: 12,
                      paddingVertical: 6,
                      borderRadius: 16,
                      backgroundColor: isSelected ? colors.primary : colors.card,
                      borderWidth: 1,
                      borderColor: isSelected ? colors.primary : colors.border,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 13,
                        fontWeight: isSelected ? "600" : "400",
                        color: isSelected
                          ? colors["primary-foreground"]
                          : colors.foreground,
                      }}
                    >
                      {tagLabel(tag)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View style={{ gap: 6 }}>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Clock size={12} color={colors["muted-foreground"]} />
                <Text className="text-muted-foreground text-[11px] font-medium uppercase">
                  Time
                </Text>
              </View>
              {logTime ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Clear time"
                  testID={`${testID}-clear-time`}
                  onPress={() => {
                    setLogTime("");
                    setTimeText("");
                  }}
                  hitSlop={8}
                >
                  <Text className="text-muted-foreground text-xs font-medium underline">
                    Clear time
                  </Text>
                </Pressable>
              ) : null}
            </View>
            <View style={{ position: "relative", justifyContent: "center" }}>
              <Clock
                size={16}
                color={colors["muted-foreground"]}
                style={{ position: "absolute", left: 12, zIndex: 1 }}
              />
              <TextInput
                testID={`${testID}-time`}
                accessibilityLabel="Logged time, 12-hour clock"
                value={timeText}
                onChangeText={(text) => {
                  setTimeText(text);
                  const parsed = parseTime12Hour(text);
                  if (parsed !== null) setLogTime(parsed);
                }}
                placeholder="4:00 AM"
                style={{
                  height: 40,
                  borderRadius: 8,
                  borderWidth: 1,
                  borderColor: colors.border,
                  backgroundColor: colors.card,
                  paddingLeft: 36,
                  paddingRight: 12,
                  color: colors.foreground,
                }}
              />
            </View>
            <Text className="text-muted-foreground text-xs">
              {logTime
                ? "Change when this was logged."
                : "No time set — it stays anchored to this meal tag."}
            </Text>
          </View>

          {error ? (
            <Text testID={`${testID}-error`} className="text-destructive text-sm font-medium">
              {error}
            </Text>
          ) : null}

          <View style={{ flexDirection: "row", gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Button
                testID={`${testID}-cancel`}
                variant="secondary"
                disabled={saving}
                onPress={handleClose}
              >
                Cancel
              </Button>
            </View>
            <View style={{ flex: 1 }}>
              <Button
                testID={`${testID}-save`}
                variant="inverted"
                disabled={saving || !hasChanges}
                loading={saving}
                onPress={() => void handleSave()}
              >
                Save
              </Button>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </BottomSheet>
  );
}
