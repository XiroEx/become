import React, { useState, useEffect, useMemo } from "react";
import { View, Pressable } from "react-native";
import Svg, { Circle, Path, Line } from "react-native-svg";
import { Text } from "@/components/Text";
import { Modal } from "@/components/Modal";
import { Button } from "@/components/Button";
import { Input } from "@/components/Input";
import { minTouchTarget } from "@/lib/a11y/touchTarget";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";
import type { TokenName } from "@/lib/theme/tokens";
import { goalLine } from "@/lib/goalLine";
import type { WeightUnit } from "@become/core";

export { goalLine } from "@/lib/goalLine";

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
  testID?: string;
  daysSinceMood?: number;
  daysSinceWeight?: number;
  lastWeight?: number | null;
  targetWeight?: number | null;
  unit?: WeightUnit;
}

export const MOOD_LABELS: Record<MoodLevel, string> = {
  1: "Bad",
  2: "Not Great",
  3: "Okay",
  4: "Pretty Good",
  5: "Great",
};

export const NEVER_LOGGED = 999;

export function getWarningInfo(days?: number | null): {
  level: "none" | "mild" | "moderate" | "high" | "critical";
  message: string;
  firstTime?: boolean;
} {
  if (days == null) return { level: "none", message: "" };
  if (days >= NEVER_LOGGED) {
    return {
      level: "none",
      message: "First log",
      firstTime: true,
    };
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

function getWarningColor(
  warning: ReturnType<typeof getWarningInfo>,
  colors: Record<TokenName, string>,
): string {
  if (warning.firstTime) return colors["muted-foreground"];
  if (warning.level === "critical") return colors.destructive;
  if (
    warning.level === "high" ||
    warning.level === "moderate" ||
    warning.level === "mild"
  ) {
    return colors.accent;
  }
  return colors["muted-foreground"];
}

function BadFace({
  selected,
  colors,
}: {
  selected: boolean;
  colors: Record<TokenName, string>;
}) {
  const featureColor = selected
    ? colors["destructive-foreground"]
    : colors.foreground;
  return (
    <Svg viewBox="0 0 48 48" width={32} height={32}>
      <Circle
        cx="24"
        cy="24"
        r="22"
        fill={selected ? colors.destructive : colors.muted}
      />
      <Circle cx="16" cy="20" r="3" fill={featureColor} />
      <Circle cx="32" cy="20" r="3" fill={featureColor} />
      <Path
        d="M14 35 Q24 26 34 35"
        fill="none"
        stroke={featureColor}
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </Svg>
  );
}

function NotGreatFace({
  selected,
  colors,
}: {
  selected: boolean;
  colors: Record<TokenName, string>;
}) {
  const featureColor = selected
    ? colors["accent-foreground"]
    : colors.foreground;
  return (
    <Svg viewBox="0 0 48 48" width={32} height={32}>
      <Circle
        cx="24"
        cy="24"
        r="22"
        fill={selected ? colors.accent : colors.muted}
      />
      <Circle cx="16" cy="20" r="3" fill={featureColor} />
      <Circle cx="32" cy="20" r="3" fill={featureColor} />
      <Path
        d="M16 34 Q24 30 32 34"
        fill="none"
        stroke={featureColor}
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </Svg>
  );
}

function OkayFace({
  selected,
  colors,
}: {
  selected: boolean;
  colors: Record<TokenName, string>;
}) {
  const featureColor = selected
    ? colors["accent-foreground"]
    : colors.foreground;
  return (
    <Svg viewBox="0 0 48 48" width={32} height={32}>
      <Circle
        cx="24"
        cy="24"
        r="22"
        fill={selected ? colors.accent : colors.muted}
      />
      <Circle cx="16" cy="20" r="3" fill={featureColor} />
      <Circle cx="32" cy="20" r="3" fill={featureColor} />
      <Line
        x1="16"
        y1="32"
        x2="32"
        y2="32"
        stroke={featureColor}
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </Svg>
  );
}

function PrettyGoodFace({
  selected,
  colors,
}: {
  selected: boolean;
  colors: Record<TokenName, string>;
}) {
  const featureColor = selected
    ? colors["primary-foreground"]
    : colors.foreground;
  return (
    <Svg viewBox="0 0 48 48" width={32} height={32}>
      <Circle
        cx="24"
        cy="24"
        r="22"
        fill={selected ? colors.success : colors.muted}
      />
      <Circle cx="16" cy="20" r="3" fill={featureColor} />
      <Circle cx="32" cy="20" r="3" fill={featureColor} />
      <Path
        d="M16 31 Q24 36 32 31"
        fill="none"
        stroke={featureColor}
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </Svg>
  );
}

function GreatFace({
  selected,
  colors,
}: {
  selected: boolean;
  colors: Record<TokenName, string>;
}) {
  const featureColor = selected
    ? colors["primary-foreground"]
    : colors.foreground;
  return (
    <Svg viewBox="0 0 48 48" width={32} height={32}>
      <Circle
        cx="24"
        cy="24"
        r="22"
        fill={selected ? colors.success : colors.muted}
      />
      <Circle cx="16" cy="20" r="3" fill={featureColor} />
      <Circle cx="32" cy="20" r="3" fill={featureColor} />
      <Path
        d="M14 30 Q24 40 34 30"
        fill="none"
        stroke={featureColor}
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </Svg>
  );
}

const MOOD_FACES: Record<
  MoodLevel,
  React.ComponentType<{
    selected: boolean;
    colors: Record<TokenName, string>;
  }>
> = {
  1: BadFace,
  2: NotGreatFace,
  3: OkayFace,
  4: PrettyGoodFace,
  5: GreatFace,
};

function getTimeBasedGreeting(): string {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return "Good morning!";
  if (hour >= 12 && hour < 17) return "Good afternoon!";
  return "Good evening!";
}

export function CheckInModal({
  visible,
  onClose,
  onSubmit,
  onSkip,
  submitting = false,
  testID = "check-in-modal",
  daysSinceMood = 0,
  daysSinceWeight = 0,
  lastWeight,
  targetWeight,
  unit = "lbs",
}: CheckInModalProps) {
  const { colors, tint } = useThemeTokens();
  const [mood, setMood] = useState<MoodLevel | null>(null);
  const [weightText, setWeightText] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState<boolean>(false);
  const [pendingAction, setPendingAction] = useState<"submit" | "skip" | null>(
    null,
  );

  const greeting = useMemo(() => getTimeBasedGreeting(), []);
  const moodWarning = getWarningInfo(daysSinceMood);
  const weightWarning = getWarningInfo(daysSinceWeight);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (visible) {
      if (lastWeight != null && lastWeight > 0) {
        setWeightText(String(lastWeight));
      } else {
        setWeightText("");
      }
      setMood(null);
      setError(null);
      setShowConfirm(false);
      setPendingAction(null);
    }
  }, [visible, lastWeight]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const getMissingWarnings = () => {
    const warnings: {
      category: string;
      days: number;
      warning: ReturnType<typeof getWarningInfo>;
    }[] = [];
    if (!mood && moodWarning.level !== "none") {
      warnings.push({
        category: "Mood",
        days: daysSinceMood,
        warning: moodWarning,
      });
    }
    const parsed = parseFloat(weightText);
    if ((!weightText.trim() || !(parsed > 0)) && weightWarning.level !== "none") {
      warnings.push({
        category: "Weight",
        days: daysSinceWeight,
        warning: weightWarning,
      });
    }
    return warnings;
  };

  const getSkipWarnings = () => {
    const warnings: {
      category: string;
      days: number;
      warning: ReturnType<typeof getWarningInfo>;
    }[] = [];
    if (moodWarning.level !== "none") {
      warnings.push({
        category: "Mood",
        days: daysSinceMood,
        warning: moodWarning,
      });
    }
    if (weightWarning.level !== "none") {
      warnings.push({
        category: "Weight",
        days: daysSinceWeight,
        warning: weightWarning,
      });
    }
    return warnings;
  };

  const performSubmit = async () => {
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
      await onSubmit({
        mood,
        weight: parsedWeight,
        weightLbs: parsedWeight,
      });
    } catch {
      setError("Couldn't save your check-in. Please try again.");
    }
  };

  const performSkip = async () => {
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
    const warnings = getMissingWarnings();
    if (warnings.length > 0) {
      setPendingAction("submit");
      setShowConfirm(true);
    } else {
      void performSubmit();
    }
  };

  const handleSkipAttempt = () => {
    const warnings = getSkipWarnings();
    if (warnings.length > 0) {
      setPendingAction("skip");
      setShowConfirm(true);
    } else {
      void performSkip();
    }
  };

  const handleConfirmProceed = () => {
    const action = pendingAction;
    setShowConfirm(false);
    setPendingAction(null);
    if (action === "submit") {
      void performSubmit();
    } else if (action === "skip") {
      void performSkip();
    }
  };

  const handleConfirmBack = () => {
    setShowConfirm(false);
    setPendingAction(null);
  };

  const confirmWarnings =
    pendingAction === "skip" ? getSkipWarnings() : getMissingWarnings();

  return (
    <Modal
      testID={testID}
      visible={visible}
      onClose={onClose}
      title={showConfirm ? (pendingAction === "skip" ? "Skip Check-in?" : "Missing Data") : greeting}
    >
      {showConfirm ? (
        <View style={{ gap: 12 }}>
          <Text style={{ fontSize: 14, color: colors["muted-foreground"] }}>
            {pendingAction === "skip"
              ? "You haven't logged anything today. Are you sure you want to skip?"
              : "You're about to submit without filling in:"}
          </Text>

          <View style={{ gap: 8 }}>
            {confirmWarnings.map((item) => (
              <View
                key={item.category}
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: 10,
                  borderRadius: 8,
                  backgroundColor: tint("muted", 0.3),
                }}
              >
                <Text
                  style={{
                    flexShrink: 1,
                    fontSize: 14,
                    fontWeight: "500",
                    color: colors.foreground,
                  }}
                >
                  {item.category}
                </Text>
                <Text
                  style={{
                    flexShrink: 1,
                    fontSize: 12,
                    fontWeight: "600",
                    color: getWarningColor(item.warning, colors),
                  }}
                >
                  Last logged: {item.warning.message} ago
                </Text>
              </View>
            ))}
          </View>

          <View style={{ gap: 8, marginTop: 8 }}>
            <Button
              testID={`${testID}-confirm-continue`}
              onPress={handleConfirmProceed}
              accessibilityLabel="Continue Anyway"
              variant="primary"
            >
              Continue Anyway
            </Button>
            <Button
              testID={`${testID}-confirm-back`}
              onPress={handleConfirmBack}
              accessibilityLabel="Go Back"
              variant="secondary"
            >
              Go Back
            </Button>
          </View>
        </View>
      ) : (
        <View style={{ gap: 16 }}>
          <Text style={{ fontSize: 13, color: colors["muted-foreground"] }}>
            Daily check-in — all fields optional
          </Text>

          {/* Mood Section */}
          <View style={{ gap: 8 }}>
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <Text
                style={{
                  flexShrink: 1,
                  fontSize: 14,
                  fontWeight: "500",
                  color: colors.foreground,
                }}
              >
                How are you feeling?
              </Text>
              {moodWarning.level !== "none" || moodWarning.firstTime ? (
                <Text
                  testID={`${testID}-mood-warning`}
                  style={{
                    flexShrink: 1,
                    fontSize: 12,
                    fontWeight: "500",
                    color: getWarningColor(moodWarning, colors),
                  }}
                >
                  {moodWarning.firstTime
                    ? "First log"
                    : `${moodWarning.message} since last log`}
                </Text>
              ) : null}
            </View>

            <View
              testID={`${testID}-mood-row`}
              accessibilityRole="radiogroup"
              accessibilityLabel="How are you feeling today?"
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
              }}
            >
              {([1, 2, 3, 4, 5] as MoodLevel[]).map((level) => {
                const FaceComponent = MOOD_FACES[level];
                const isSelected = mood === level;
                return (
                  <Pressable
                    key={level}
                    testID={`${testID}-mood-${level}`}
                    onPress={() => setMood(isSelected ? null : level)}
                    accessibilityRole="radio"
                    accessibilityLabel={`Mood ${level}: ${MOOD_LABELS[level]}`}
                    accessibilityState={{
                      checked: isSelected,
                      selected: isSelected,
                    }}
                    style={[
                      minTouchTarget,
                      {
                        flex: 1,
                        marginHorizontal: 2,
                        paddingVertical: 8,
                        paddingHorizontal: 2,
                        borderRadius: 12,
                        alignItems: "center",
                        justifyContent: "center",
                        borderWidth: 1,
                        borderColor: isSelected
                          ? colors.primary
                          : colors.border,
                        backgroundColor: isSelected
                          ? tint("primary", 0.12)
                          : colors.card,
                      },
                    ]}
                  >
                    <FaceComponent selected={isSelected} colors={colors} />
                    <Text
                      style={{
                        marginTop: 4,
                        fontSize: 10,
                        fontWeight: "500",
                        textAlign: "center",
                        color: isSelected
                          ? colors.primary
                          : colors["muted-foreground"],
                      }}
                    >
                      {MOOD_LABELS[level]}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {/* Weight Section */}
          <View style={{ gap: 8 }}>
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <Text
                style={{
                  flexShrink: 1,
                  fontSize: 14,
                  fontWeight: "500",
                  color: colors.foreground,
                }}
              >
                {`Current Weight (${unit})`}
              </Text>
              {weightWarning.level !== "none" || weightWarning.firstTime ? (
                <Text
                  testID={`${testID}-weight-warning`}
                  style={{
                    flexShrink: 1,
                    fontSize: 12,
                    fontWeight: "500",
                    color: getWarningColor(weightWarning, colors),
                  }}
                >
                  {weightWarning.firstTime
                    ? "First log"
                    : `${weightWarning.message} since last log`}
                </Text>
              ) : null}
            </View>

            <Input
              testID={`${testID}-weight`}
              value={weightText}
              onChangeText={(t) => {
                setWeightText(t);
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
                  marginTop: 2,
                }}
              >
                {goalLine(weightText, targetWeight, unit)}
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

          {/* Action Buttons */}
          <View style={{ gap: 10, marginTop: 4 }}>
            <Button
              testID={`${testID}-submit`}
              accessibilityLabel="Save check-in"
              onPress={handleSubmitAttempt}
              disabled={submitting}
              loading={submitting}
              variant="primary"
            >
              Save Check-in
            </Button>
            <Button
              testID={`${testID}-skip`}
              accessibilityLabel="Skip for Today"
              onPress={handleSkipAttempt}
              disabled={submitting}
              variant="secondary"
            >
              Skip for Today
            </Button>
          </View>
        </View>
      )}
    </Modal>
  );
}
