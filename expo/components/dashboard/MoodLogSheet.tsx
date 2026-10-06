import React, { useState, useRef, useEffect } from "react";
import { View, Pressable, StyleSheet } from "react-native";
import { BottomSheet } from "@/components/BottomSheet";
import { Text } from "@/components/Text";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";
import { X, Smile } from "lucide-react-native";
import type { MoodLevel } from "@/components/CheckInModal";
import { MOOD_LABELS } from "@/components/CheckInModal";
import type { TokenName } from "@/lib/theme/tokens";

/** Mirrors the web's `MoodCard` `moodConfig[level]` — a selection highlighted
 * in the SPECIFIC mood's colour, never the brand red for every level. */
const MOOD_ACCENT_TOKEN: Record<MoodLevel, TokenName> = {
  1: "mood-bad",
  2: "mood-low",
  3: "mood-okay",
  4: "mood-good",
  5: "mood-great",
};

export interface MoodOption {
  level: MoodLevel;
  emoji: string;
  label: string;
}

export const MOOD_OPTIONS: MoodOption[] = [
  { level: 1, emoji: "😞", label: MOOD_LABELS[1] },
  { level: 2, emoji: "😕", label: MOOD_LABELS[2] },
  { level: 3, emoji: "😐", label: MOOD_LABELS[3] },
  { level: 4, emoji: "🙂", label: MOOD_LABELS[4] },
  { level: 5, emoji: "😄", label: MOOD_LABELS[5] },
];

export interface MoodLogSheetProps {
  visible: boolean;
  onClose: () => void;
  onLogged?: (mood: MoodLevel) => void;
  onSubmit?: (mood: MoodLevel) => Promise<void> | void;
  currentMood?: MoodLevel | number | null;
  testID?: string;
}

export function MoodLogSheet({
  visible,
  onClose,
  onLogged,
  onSubmit,
  currentMood,
  testID = "dashboard-mood-sheet",
}: MoodLogSheetProps) {
  const { colors, tint } = useThemeTokens();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const handleSelect = async (level: MoodLevel) => {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      if (onSubmit) {
        await onSubmit(level);
      }
      onLogged?.(level);
      setSaving(false);
      onClose();
    } catch {
      if (mountedRef.current) {
        setError("Failed to log mood. Please try again.");
        setSaving(false);
      }
    }
  };

  return (
    <BottomSheet
      testID={testID}
      visible={visible}
      onClose={onClose}
    >
      <View style={{ gap: 16 }}>
        {/* Header */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <View
              style={{
                width: 40,
                height: 40,
                borderRadius: 10,
                backgroundColor: tint("accent", 0.15),
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Smile size={20} color={colors.accent} />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text
                className="text-foreground text-lg font-bold"
                style={{ flexShrink: 1 }}
              >
                Today&apos;s Mood
              </Text>
              <Text
                className="text-muted-foreground text-xs"
                style={{ flexShrink: 1 }}
              >
                Pick or change today&apos;s mood
              </Text>
            </View>
          </View>
          <Pressable
            testID={`${testID}-close`}
            onPress={onClose}
            disabled={saving}
            accessibilityRole="button"
            accessibilityLabel="Close"
            className="p-2 rounded-full"
          >
            <X size={18} color={colors["muted-foreground"]} />
          </Pressable>
        </View>

        {error ? (
          <Text className="text-destructive text-xs">{error}</Text>
        ) : null}

        {/* Mood options list */}
        <View style={{ gap: 8 }}>
          {MOOD_OPTIONS.map((m) => {
            const isSelected = currentMood === m.level;
            // The web's selected state is a neutral zinc ring + fill
            // (`ring-zinc-300 bg-zinc-100`) with the face itself carrying the
            // mood's colour — never the brand red for every level.
            const moodToken = MOOD_ACCENT_TOKEN[m.level];
            return (
              <Pressable
                key={m.level}
                testID={`${testID}-option-${m.level}`}
                onPress={() => handleSelect(m.level)}
                disabled={saving}
                accessibilityRole="button"
                accessibilityLabel={m.label}
                accessibilityState={{ selected: isSelected }}
                style={[
                  styles.optionButton,
                  {
                    borderColor: isSelected ? colors["muted-foreground"] : colors.border,
                    backgroundColor: isSelected ? colors.muted : colors.card,
                  },
                ]}
              >
                <View
                  testID={`mood-option-${m.level}`}
                  style={{ flexDirection: "row", alignItems: "center", gap: 12, flex: 1 }}
                >
                  <View
                    style={[
                      styles.faceBadge,
                      { backgroundColor: tint(moodToken, 0.25) },
                    ]}
                  >
                    <Text style={{ fontSize: 20 }}>{m.emoji}</Text>
                  </View>
                  <Text
                    testID={`tile-mood-option-${m.level}`}
                    className="text-base font-semibold"
                    style={{ color: isSelected ? colors[moodToken] : colors.foreground }}
                  >
                    {m.label}
                  </Text>
                </View>
                {isSelected ? (
                  <View
                    style={[
                      styles.indicator,
                      { backgroundColor: colors[moodToken] },
                    ]}
                  />
                ) : null}
              </Pressable>
            );
          })}
        </View>
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  optionButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    minHeight: 48,
  },
  indicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  faceBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
});
