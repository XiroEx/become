import React, { useState, useRef, useEffect } from "react";
import { View, Pressable, StyleSheet } from "react-native";
import { BottomSheet } from "@/components/BottomSheet";
import { Text } from "@/components/Text";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";
import { X } from "lucide-react-native";
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
      // NP-316: ports the web's layout — a single-line title + X (no icon
      // badge, no subtitle) and one row of five faces
      // (`webapp/components/MoodCard.tsx`'s `grid-cols-5`), not a vertical
      // list. Below, the title `Text` carries `flex: 1` (and `numberOfLines`)
      // while the X gets a fixed, non-shrinking size — without that, the
      // header row had no basis to shrink the title against, so on Android
      // it could grow past the sheet's own padding and push the close
      // button off the right edge of the screen instead of wrapping.
    >
      <View style={{ gap: 16 }}>
        {/* Header */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 8,
          }}
        >
          <Text
            testID={`${testID}-title`}
            accessibilityRole="header"
            numberOfLines={1}
            className="text-foreground text-base font-semibold"
            style={{ flex: 1 }}
          >
            How are you feeling?
          </Text>
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

        {error ? (
          <Text className="text-destructive text-xs">{error}</Text>
        ) : null}

        {/* Mood options — one row of five faces, like the web's grid-cols-5 */}
        <View style={styles.optionsRow}>
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
                    borderColor: isSelected ? colors["muted-foreground"] : "transparent",
                    backgroundColor: isSelected ? colors.muted : "transparent",
                  },
                ]}
              >
                <View
                  testID={`mood-option-${m.level}`}
                  style={[
                    styles.faceBadge,
                    { backgroundColor: tint(moodToken, 0.25) },
                  ]}
                >
                  <Text style={{ fontSize: 22 }}>{m.emoji}</Text>
                </View>
                <Text
                  testID={`tile-mood-option-${m.level}`}
                  numberOfLines={1}
                  className="text-[11px] font-medium"
                  style={{
                    color: isSelected ? colors[moodToken] : colors.foreground,
                    textAlign: "center",
                  }}
                >
                  {m.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  optionsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 4,
  },
  optionButton: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 2,
    borderRadius: 12,
    borderWidth: 1,
    minHeight: 48,
  },
  faceBadge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
});
