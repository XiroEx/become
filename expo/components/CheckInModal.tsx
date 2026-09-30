import { useState } from "react";
import { View, Pressable } from "react-native";
import Svg, { Circle, Path, Line } from "react-native-svg";
import { Text } from "@/components/Text";
import { Modal } from "@/components/Modal";
import { Button } from "@/components/Button";
import { Input } from "@/components/Input";
import { minTouchTarget } from "@/lib/a11y/touchTarget";
import { useUnits } from "@/lib/hooks/useUnits";
import { goalLine } from "@/lib/goals/goalLine";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";
import type { WeightUnit } from "@become/core";

export type MoodLevel = 1 | 2 | 3 | 4 | 5;

export interface CheckInPayload {
  mood: MoodLevel | null;
  weightLbs: number | null;
  weight?: number | null;
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
  weightUnit?: WeightUnit;
  targetWeight?: number | null;
}

export const MOOD_LABELS: Record<MoodLevel, string> = {
  1: "Bad",
  2: "Not Great",
  3: "Okay",
  4: "Pretty Good",
  5: "Great",
};

/** The sentinel returned when the member has never logged an entry. */
export const NEVER_LOGGED = 999;

export interface WarningInfo {
  level: "none" | "mild" | "moderate" | "high" | "critical";
  message: string;
  firstTime?: boolean;
}

export function getWarningInfo(days: number): WarningInfo {
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

const MOOD_FACE_RGB: Record<MoodLevel, string> = {
  1: "248 113 113", // red-400
  2: "251 146 60",  // orange-400
  3: "251 191 36",  // amber-400
  4: "163 230 53",  // lime-400
  5: "52 211 153",  // emerald-400
};

const faceRgb = (triplet: string): string => `rgb(${triplet})`;

interface FaceProps {
  selected: boolean;
  featureColor: string;
  unselectedFill: string;
}

function BadFace({ selected, featureColor, unselectedFill }: FaceProps) {
  return (
    <Svg viewBox="0 0 48 48" width={28} height={28}>
      <Circle cx="24" cy="24" r="22" fill={selected ? faceRgb(MOOD_FACE_RGB[1]) : unselectedFill} />
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

function NotGreatFace({ selected, featureColor, unselectedFill }: FaceProps) {
  return (
    <Svg viewBox="0 0 48 48" width={28} height={28}>
      <Circle cx="24" cy="24" r="22" fill={selected ? faceRgb(MOOD_FACE_RGB[2]) : unselectedFill} />
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

function OkayFace({ selected, featureColor, unselectedFill }: FaceProps) {
  return (
    <Svg viewBox="0 0 48 48" width={28} height={28}>
      <Circle cx="24" cy="24" r="22" fill={selected ? faceRgb(MOOD_FACE_RGB[3]) : unselectedFill} />
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

function PrettyGoodFace({ selected, featureColor, unselectedFill }: FaceProps) {
  return (
    <Svg viewBox="0 0 48 48" width={28} height={28}>
      <Circle cx="24" cy="24" r="22" fill={selected ? faceRgb(MOOD_FACE_RGB[4]) : unselectedFill} />
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

function GreatFace({ selected, featureColor, unselectedFill }: FaceProps) {
  return (
    <Svg viewBox="0 0 48 48" width={28} height={28}>
      <Circle cx="24" cy="24" r="22" fill={selected ? faceRgb(MOOD_FACE_RGB[5]) : unselectedFill} />
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

const FACE_COMPONENTS: Record<MoodLevel, React.ComponentType<FaceProps>> = {
  1: BadFace,
  2: NotGreatFace,
  3: OkayFace,
  4: PrettyGoodFace,
  5: GreatFace,
};

function useSafeUnits() {
  try {
    return useUnits();
  } catch {
    return { unit: "lbs" as WeightUnit };
  }
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
  weightUnit: weightUnitProp,
  targetWeight,
}: CheckInModalProps) {
  const { unit: profileUnit } = useSafeUnits();
  const unit = weightUnitProp ?? profileUnit;
  const { colors, isDark } = useThemeTokens();
  const featureColor = isDark ? colors.muted : colors.foreground;
  const unselectedFill = colors["muted-foreground"];

  const [mood, setMood] = useState<MoodLevel | null>(null);
  const [weightText, setWeightText] = useState<string>(
    lastWeight != null && lastWeight > 0 ? String(lastWeight) : ""
  );
  const [error, setError] = useState<string | null>(null);
  const [showWarningConfirm, setShowWarningConfirm] = useState(false);
  const [pendingAction, setPendingAction] = useState<"submit" | "skip" | null>(null);

  // Sync state when modal opens or lastWeight changes
  const [prevProps, setPrevProps] = useState({ visible, lastWeight });
  if (
    visible !== prevProps.visible ||
    (visible && lastWeight !== prevProps.lastWeight)
  ) {
    setPrevProps({ visible, lastWeight });
    if (visible) {
      setWeightText(lastWeight != null && lastWeight > 0 ? String(lastWeight) : "");
      setMood(null);
      setError(null);
      setShowWarningConfirm(false);
      setPendingAction(null);
    }
  }

  const moodWarning = getWarningInfo(daysSinceMood);
  const weightWarning = getWarningInfo(daysSinceWeight);

  const getSkippedWarnings = () => {
    const warnings: { category: string; days: number; warning: WarningInfo }[] = [];
    if (!mood && moodWarning.level !== "none") {
      warnings.push({ category: "Mood", days: daysSinceMood, warning: moodWarning });
    }
    const enteredWeight = parseFloat(weightText);
    if ((!enteredWeight || enteredWeight <= 0) && weightWarning.level !== "none") {
      warnings.push({ category: "Weight", days: daysSinceWeight, warning: weightWarning });
    }
    return warnings;
  };

  const handleSubmit = async () => {
    if (!mood && !weightText.trim()) {
      setError("Pick a mood");
      return;
    }
    let weightNum: number | null = null;
    if (weightText.trim()) {
      const parsed = Number(weightText);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        setError("Enter a positive weight or leave blank");
        return;
      }
      weightNum = parsed;
    }
    setError(null);
    try {
      await onSubmit({ mood, weightLbs: weightNum });
    } catch {
      setError("Couldn't save your check-in. Please try again.");
    }
  };

  const handleSkip = async () => {
    setError(null);
    try {
      if (onSkip) {
        await onSkip();
      }
      onClose();
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
      void handleSubmit();
    }
  };

  const handleSkipAttempt = () => {
    const warnings: { category: string; days: number; warning: WarningInfo }[] = [];
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
      void handleSkip();
    }
  };

  const handleWarningConfirm = () => {
    setShowWarningConfirm(false);
    if (pendingAction === "submit") {
      void handleSubmit();
    } else if (pendingAction === "skip") {
      void handleSkip();
    }
    setPendingAction(null);
  };

  const handleWarningCancel = () => {
    setShowWarningConfirm(false);
    setPendingAction(null);
  };

  if (showWarningConfirm) {
    const isSkip = pendingAction === "skip";
    const warnings = isSkip
      ? [
          ...(moodWarning.level !== "none"
            ? [{ category: "Mood", days: daysSinceMood, warning: moodWarning }]
            : []),
          ...(weightWarning.level !== "none"
            ? [{ category: "Weight", days: daysSinceWeight, warning: weightWarning }]
            : []),
        ]
      : getSkippedWarnings();

    return (
      <Modal
        testID={`${testID}-warning-confirm`}
        visible={visible}
        onClose={handleWarningCancel}
        title={isSkip ? "Skip Check-in?" : "Missing Data"}
      >
        <Text className="text-muted-foreground text-sm mb-4">
          {isSkip
            ? "You haven't logged anything today. Are you sure you want to skip?"
            : "You're about to submit without filling in:"}
        </Text>
        <View style={{ marginBottom: 16 }}>
          {warnings.map(({ category, warning }) => (
            <View
              key={category}
              className="flex-row items-center justify-between bg-muted/40 rounded-xl p-3 mb-2"
            >
              <Text className="text-sm font-medium text-foreground">
                {category}
              </Text>
              <Text className="text-xs font-semibold text-accent">
                Last logged: {warning.message} ago
              </Text>
            </View>
          ))}
        </View>
        <View style={{ flexDirection: "row", gap: 12 }}>
          <View style={{ flex: 1 }}>
            <Button
              testID={`${testID}-warning-back`}
              variant="secondary"
              onPress={handleWarningCancel}
            >
              Go Back
            </Button>
          </View>
          <View style={{ flex: 1 }}>
            <Button
              testID={`${testID}-warning-continue`}
              onPress={handleWarningConfirm}
            >
              Continue Anyway
            </Button>
          </View>
        </View>
      </Modal>
    );
  }

  const liveGoalLine = goalLine(weightText, targetWeight, unit);

  return (
    <Modal
      testID={testID}
      visible={visible}
      onClose={onClose}
      title="Daily check-in"
    >
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <Text className="text-muted-foreground text-sm">
          How are you feeling today?
        </Text>
        {moodWarning.level !== "none" || moodWarning.firstTime ? (
          <Text
            testID={`${testID}-mood-warning`}
            className={`text-xs font-medium ${
              moodWarning.firstTime ? "text-muted-foreground" : "text-accent"
            }`}
          >
            {moodWarning.firstTime ? "First log" : `${moodWarning.message} since last log`}
          </Text>
        ) : null}
      </View>

      <View
        testID={`${testID}-mood-row`}
        accessibilityRole="radiogroup"
        accessibilityLabel="How are you feeling today?"
        style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 16 }}
      >
        {([1, 2, 3, 4, 5] as MoodLevel[]).map((level) => {
          const FaceComponent = FACE_COMPONENTS[level];
          return (
            <Pressable
              key={level}
              testID={`${testID}-mood-${level}`}
              onPress={() => setMood(mood === level ? null : level)}
              accessibilityRole="radio"
              accessibilityLabel={`Mood ${level}: ${MOOD_LABELS[level]}`}
              accessibilityState={{ checked: mood === level, selected: mood === level }}
              className={`px-1 py-2 rounded-xl items-center justify-center border ${
                mood === level
                  ? "border-primary bg-primary/10"
                  : "border-border bg-card"
              }`}
              style={[minTouchTarget, { flex: 1, marginHorizontal: 2 }]}
            >
              <FaceComponent
                selected={mood === level}
                featureColor={featureColor}
                unselectedFill={unselectedFill}
              />
              <Text
                className={mood === level ? "text-primary font-semibold text-xs mt-1" : "text-foreground text-xs mt-1"}
              >
                {level}
              </Text>
              <Text
                className="text-muted-foreground text-[10px]"
                numberOfLines={1}
              >
                {MOOD_LABELS[level]}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 2 }}>
        <Text className="text-foreground text-sm font-medium">
          Weight ({unit}) — optional
        </Text>
        {weightWarning.level !== "none" || weightWarning.firstTime ? (
          <Text
            testID={`${testID}-weight-warning`}
            className={`text-xs font-medium ${
              weightWarning.firstTime ? "text-muted-foreground" : "text-accent"
            }`}
          >
            {weightWarning.firstTime ? "First log" : `${weightWarning.message} since last log`}
          </Text>
        ) : null}
      </View>

      <Input
        testID={`${testID}-weight`}
        accessibilityLabel={`Weight in ${unit}, optional`}
        keyboardType="decimal-pad"
        value={weightText}
        onChangeText={setWeightText}
        placeholder={unit === "kg" ? "80.0" : "180"}
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
        onPress={handleSubmitAttempt}
        loading={submitting}
        disabled={submitting}
      >
        Save check-in
      </Button>

      <View style={{ height: 8 }} />

      <Button
        testID={`${testID}-skip`}
        variant="secondary"
        onPress={handleSkipAttempt}
        disabled={submitting}
      >
        Skip for Today
      </Button>
    </Modal>
  );
}
