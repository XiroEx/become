import React, { useState, useEffect } from "react";
import { View, Pressable } from "react-native";
import Svg, { Circle, Path, Line } from "react-native-svg";
import { Text } from "@/components/Text";
import { Modal } from "@/components/Modal";
import { Button } from "@/components/Button";
import { Input } from "@/components/Input";
import { minTouchTarget } from "@/lib/a11y/touchTarget";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";
import { goalLine } from "@/lib/checkin/goalLine";
import type { WeightUnit } from "@become/core";

export { goalLine };

export type MoodLevel = 1 | 2 | 3 | 4 | 5;

export interface CheckInPayload {
  mood?: MoodLevel | null;
  weight?: number | null;
  weightLbs?: number | null;
}

export interface CheckInModalProps {
  visible: boolean;
  onClose: () => void;
  onSubmit: (payload: CheckInPayload) => Promise<void> | void;
  onSkip?: () => Promise<void> | void;
  submitting?: boolean;
  daysSinceMood?: number;
  daysSinceWeight?: number;
  lastWeight?: number | null;
  weightUnit?: WeightUnit;
  targetWeight?: number | null;
  testID?: string;
}

export const MOOD_LABELS: Record<MoodLevel, string> = {
  1: "Bad",
  2: "Not Great",
  3: "Okay",
  4: "Pretty Good",
  5: "Great",
};

const NEVER_LOGGED = 999;

export function getWarningInfo(days: number): {
  level: "none" | "mild" | "moderate" | "high" | "critical";
  message: string;
  firstTime?: boolean;
} {
  if (days >= NEVER_LOGGED) {
    return { level: "none", message: "First log", firstTime: true };
  }
  if (days >= 10) {
    return { level: "critical", message: `${days}+ days` };
  }
  if (days >= 7) {
    return { level: "high", message: "7 days" };
  }
  if (days >= 3) {
    return { level: "moderate", message: "3 days" };
  }
  if (days >= 1) {
    return { level: "mild", message: "1 day" };
  }
  return { level: "none", message: "" };
}

// 5 mood face SVGs matching web parity
function BadFace({ selected, color, unselectedBg, fg }: { selected: boolean; color: string; unselectedBg: string; fg: string }) {
  return (
    <Svg viewBox="0 0 48 48" width={36} height={36}>
      <Circle cx="24" cy="24" r="22" fill={selected ? color : unselectedBg} />
      <Circle cx="16" cy="20" r="3" fill={fg} />
      <Circle cx="32" cy="20" r="3" fill={fg} />
      <Path
        d="M14 35 Q24 26 34 35"
        fill="none"
        stroke={fg}
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </Svg>
  );
}

function NotGreatFace({ selected, color, unselectedBg, fg }: { selected: boolean; color: string; unselectedBg: string; fg: string }) {
  return (
    <Svg viewBox="0 0 48 48" width={36} height={36}>
      <Circle cx="24" cy="24" r="22" fill={selected ? color : unselectedBg} />
      <Circle cx="16" cy="20" r="3" fill={fg} />
      <Circle cx="32" cy="20" r="3" fill={fg} />
      <Path
        d="M16 34 Q24 30 32 34"
        fill="none"
        stroke={fg}
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </Svg>
  );
}

function OkayFace({ selected, color, unselectedBg, fg }: { selected: boolean; color: string; unselectedBg: string; fg: string }) {
  return (
    <Svg viewBox="0 0 48 48" width={36} height={36}>
      <Circle cx="24" cy="24" r="22" fill={selected ? color : unselectedBg} />
      <Circle cx="16" cy="20" r="3" fill={fg} />
      <Circle cx="32" cy="20" r="3" fill={fg} />
      <Line
        x1="16"
        y1="32"
        x2="32"
        y2="32"
        stroke={fg}
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </Svg>
  );
}

function PrettyGoodFace({ selected, color, unselectedBg, fg }: { selected: boolean; color: string; unselectedBg: string; fg: string }) {
  return (
    <Svg viewBox="0 0 48 48" width={36} height={36}>
      <Circle cx="24" cy="24" r="22" fill={selected ? color : unselectedBg} />
      <Circle cx="16" cy="20" r="3" fill={fg} />
      <Circle cx="32" cy="20" r="3" fill={fg} />
      <Path
        d="M16 31 Q24 36 32 31"
        fill="none"
        stroke={fg}
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </Svg>
  );
}

function GreatFace({ selected, color, unselectedBg, fg }: { selected: boolean; color: string; unselectedBg: string; fg: string }) {
  return (
    <Svg viewBox="0 0 48 48" width={36} height={36}>
      <Circle cx="24" cy="24" r="22" fill={selected ? color : unselectedBg} />
      <Circle cx="16" cy="20" r="3" fill={fg} />
      <Circle cx="32" cy="20" r="3" fill={fg} />
      <Path
        d="M14 30 Q24 40 34 30"
        fill="none"
        stroke={fg}
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </Svg>
  );
}

export function CheckInModal({
  visible,
  onClose,
  onSubmit,
  onSkip,
  submitting = false,
  daysSinceMood = 0,
  daysSinceWeight = 0,
  lastWeight,
  weightUnit = "lbs",
  targetWeight,
  testID = "check-in-modal",
}: CheckInModalProps) {
  const { colors, tint, isDark } = useThemeTokens();
  const [mood, setMood] = useState<MoodLevel | null>(null);
  const [weightText, setWeightText] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [showWarningConfirm, setShowWarningConfirm] = useState(false);
  const [pendingAction, setPendingAction] = useState<"submit" | "skip" | null>(null);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (visible && lastWeight != null && lastWeight > 0) {
      setWeightText(String(lastWeight));
    }
  }, [visible, lastWeight]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const moodWarning = getWarningInfo(daysSinceMood);
  const weightWarning = getWarningInfo(daysSinceWeight);

  const getSkippedWarnings = () => {
    const warnings: { category: string; days: number; warning: ReturnType<typeof getWarningInfo> }[] = [];
    if (!mood && moodWarning.level !== "none") {
      warnings.push({ category: "Mood", days: daysSinceMood, warning: moodWarning });
    }
    const parsedWeight = parseFloat(weightText);
    if ((!weightText.trim() || !(parsedWeight > 0)) && weightWarning.level !== "none") {
      warnings.push({ category: "Weight", days: daysSinceWeight, warning: weightWarning });
    }
    return warnings;
  };

  const executeSubmit = async () => {
    let parsedWeight: number | null = null;
    if (weightText.trim()) {
      const parsed = Number(weightText);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        setError("Enter a positive weight or leave blank");
        return;
      }
      parsedWeight = parsed;
    }
    setError(null);
    try {
      await onSubmit({ mood, weight: parsedWeight, weightLbs: parsedWeight });
    } catch {
      setError("Couldn't save your check-in. Please try again.");
    }
  };

  const executeSkip = async () => {
    setError(null);
    try {
      if (onSkip) {
        await onSkip();
      } else {
        onClose();
      }
    } catch {
      setError("Couldn't skip check-in. Please try again.");
    }
  };

  const handleSubmitAttempt = () => {
    const warnings = getSkippedWarnings();
    if (warnings.length > 0) {
      setPendingAction("submit");
      setShowWarningConfirm(true);
    } else {
      void executeSubmit();
    }
  };

  const handleSkipAttempt = () => {
    const warnings: { category: string; days: number; warning: ReturnType<typeof getWarningInfo> }[] = [];
    if (moodWarning.level !== "none") {
      warnings.push({ category: "Mood", days: daysSinceMood, warning: moodWarning });
    }
    if (weightWarning.level !== "none") {
      warnings.push({ category: "Weight", days: daysSinceWeight, warning: weightWarning });
    }

    if (warnings.length > 0) {
      setPendingAction("skip");
      setShowWarningConfirm(true);
    } else {
      void executeSkip();
    }
  };

  const handleWarningConfirm = () => {
    setShowWarningConfirm(false);
    if (pendingAction === "submit") {
      void executeSubmit();
    } else if (pendingAction === "skip") {
      void executeSkip();
    }
    setPendingAction(null);
  };

  const handleWarningCancel = () => {
    setShowWarningConfirm(false);
    setPendingAction(null);
  };

  const faces = [
    { level: 1 as MoodLevel, Face: BadFace, color: colors.destructive },
    { level: 2 as MoodLevel, Face: NotGreatFace, color: colors.accent },
    { level: 3 as MoodLevel, Face: OkayFace, color: colors.accent },
    { level: 4 as MoodLevel, Face: PrettyGoodFace, color: colors.success },
    { level: 5 as MoodLevel, Face: GreatFace, color: colors.success },
  ];

  const unselectedFaceBg = isDark ? colors.muted : colors.border;
  const faceFg = colors.foreground;

  return (
    <Modal
      testID={testID}
      visible={visible}
      onClose={onClose}
      title="Daily check-in"
    >
      {showWarningConfirm ? (
        <View testID="check-in-warning-confirm" style={{ gap: 16, paddingVertical: 8 }}>
          <Text className="text-foreground text-lg font-bold">
            {pendingAction === "skip" ? "Skip Check-in?" : "Missing Data"}
          </Text>
          <Text className="text-muted-foreground text-sm">
            {pendingAction === "skip"
              ? "You haven't logged anything today. Are you sure you want to skip?"
              : "You're about to submit without filling in:"}
          </Text>

          <View style={{ gap: 8 }}>
            {(pendingAction === "skip"
              ? [
                  ...(moodWarning.level !== "none"
                    ? [{ category: "Mood", warning: moodWarning }]
                    : []),
                  ...(weightWarning.level !== "none"
                    ? [{ category: "Weight", warning: weightWarning }]
                    : []),
                ]
              : getSkippedWarnings()
            ).map(({ category, warning }) => (
              <View
                key={category}
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  padding: 8,
                  borderRadius: 8,
                  backgroundColor: tint("muted", 0.3),
                }}
              >
                <Text className="text-foreground font-medium text-sm">
                  {category}
                </Text>
                <Text
                  className={`text-xs font-semibold ${
                    warning.level === "critical"
                      ? "text-destructive"
                      : warning.level === "high" || warning.level === "moderate"
                      ? "text-accent"
                      : "text-muted-foreground"
                  }`}
                >
                  Last logged: {warning.message} ago
                </Text>
              </View>
            ))}
          </View>

          <View style={{ flexDirection: "row", gap: 12, marginTop: 8 }}>
            <View style={{ flex: 1 }}>
              <Button
                testID="check-in-warning-cancel"
                variant="secondary"
                onPress={handleWarningCancel}
              >
                Go Back
              </Button>
            </View>
            <View style={{ flex: 1 }}>
              <Button
                testID="check-in-warning-continue"
                variant="primary"
                onPress={handleWarningConfirm}
              >
                Continue Anyway
              </Button>
            </View>
          </View>
        </View>
      ) : (
        <>
          <View style={{ marginBottom: 16 }}>
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 8,
              }}
            >
              <Text
                className="text-foreground text-sm font-medium"
                style={{ flexShrink: 1 }}
              >
                How are you feeling?
              </Text>
              {(moodWarning.level !== "none" || moodWarning.firstTime) && (
                <Text
                  testID="check-in-modal-mood-warning"
                  style={{ flexShrink: 1 }}
                  className={`text-xs font-medium ${
                    moodWarning.level === "critical"
                      ? "text-destructive"
                      : moodWarning.level === "high" || moodWarning.level === "moderate"
                      ? "text-accent"
                      : "text-muted-foreground"
                  }`}
                >
                  {moodWarning.firstTime
                    ? "First log"
                    : `${moodWarning.message} since last log`}
                </Text>
              )}
            </View>

            <View
              testID={`${testID}-mood-row`}
              accessibilityRole="radiogroup"
              accessibilityLabel="How are you feeling today?"
              style={{ flexDirection: "row", justifyContent: "space-between" }}
            >
              {faces.map(({ level, Face, color }) => {
                const isSelected = mood === level;
                return (
                  <Pressable
                    key={level}
                    testID={`${testID}-mood-${level}`}
                    onPress={() => setMood(isSelected ? null : level)}
                    accessibilityRole="radio"
                    accessibilityLabel={`Mood ${level}: ${MOOD_LABELS[level]}`}
                    accessibilityState={{ checked: isSelected, selected: isSelected }}
                    className={`px-1.5 py-2 rounded-xl items-center justify-center border ${
                      isSelected
                        ? "border-primary bg-primary/10"
                        : "border-border bg-card"
                    }`}
                    style={[minTouchTarget, { flex: 1, marginHorizontal: 2 }]}
                  >
                    <Face
                      selected={isSelected}
                      color={color}
                      unselectedBg={unselectedFaceBg}
                      fg={faceFg}
                    />
                    <Text
                      className={`text-[10px] font-medium mt-1 text-center ${
                        isSelected ? "text-foreground font-bold" : "text-muted-foreground"
                      }`}
                    >
                      {MOOD_LABELS[level]}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View style={{ marginBottom: 16 }}>
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 8,
              }}
            >
              <Text
                className="text-foreground text-sm font-medium"
                style={{ flexShrink: 1 }}
              >
                Current Weight ({weightUnit})
              </Text>
              {(weightWarning.level !== "none" || weightWarning.firstTime) && (
                <Text
                  testID="check-in-modal-weight-warning"
                  style={{ flexShrink: 1 }}
                  className={`text-xs font-medium ${
                    weightWarning.level === "critical"
                      ? "text-destructive"
                      : weightWarning.level === "high" || weightWarning.level === "moderate"
                      ? "text-accent"
                      : "text-muted-foreground"
                  }`}
                >
                  {weightWarning.firstTime
                    ? "First log"
                    : `${weightWarning.message} since last log`}
                </Text>
              )}
            </View>

            <Input
              testID={`${testID}-weight`}
              value={weightText}
              onChangeText={setWeightText}
              keyboardType="decimal-pad"
              placeholder="e.g., 185.5"
              accessibilityLabel="Weight"
              textAlign="center"
            />
            {targetWeight != null && targetWeight > 0 && (
              <Text
                testID="checkin-goal-line"
                className="text-xs text-muted-foreground text-center mt-1.5"
              >
                {goalLine(weightText, targetWeight, weightUnit)}
              </Text>
            )}
          </View>

          {error ? (
            <Text
              testID={`${testID}-error`}
              className="text-destructive text-sm mb-3 text-center"
            >
              {error}
            </Text>
          ) : null}

          <View style={{ gap: 8 }}>
            <Button
              testID={testID === "dashboard-checkin-modal" ? "dashboard-checkin-modal-submit" : `${testID}-submit`}
              onPress={handleSubmitAttempt}
              loading={submitting}
              accessibilityLabel="Save check-in"
            >
              {submitting ? "Saving..." : "Save Check-in"}
            </Button>

            <Button
              testID={testID === "dashboard-checkin-modal" ? "dashboard-checkin-modal-skip" : `${testID}-skip`}
              variant="secondary"
              onPress={handleSkipAttempt}
              disabled={submitting}
              accessibilityLabel="Skip for Today"
            >
              Skip for Today
            </Button>
          </View>
        </>
      )}
    </Modal>
  );
}
