import { View, Pressable, StyleSheet } from "react-native";
import { Dumbbell, ArrowRight, Compass, BellOff } from "lucide-react-native";
import { Modal } from "@/components/Modal";
import { Text } from "@/components/Text";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";
import { minTouchTarget } from "@/lib/a11y/touchTarget";

export type FitnessGoal =
  | "lose_weight"
  | "gain_muscle"
  | "maintain"
  | "improve_performance"
  | "general_health";

export const GOAL_COPY: Record<FitnessGoal, { headline: string; sub: string }> = {
  lose_weight: {
    headline: "Ready to build your fat loss plan?",
    sub: "A structured program will get you there faster than going it alone.",
  },
  gain_muscle: {
    headline: "Ready to build serious muscle?",
    sub: "Progressive overload needs a plan. Let's find yours.",
  },
  maintain: {
    headline: "Keep what you've built.",
    sub: "A maintenance program keeps your results without burning you out.",
  },
  improve_performance: {
    headline: "Ready to train with purpose?",
    sub: "Performance gains come from structured work. Let's map it out.",
  },
  general_health: {
    headline: "Start building the habit.",
    sub: "A program gives you structure so healthy movement becomes automatic.",
  },
};

export const DEFAULT_COPY = {
  headline: "Ready to start a training program?",
  sub: "A structured plan gets you from where you are to where you want to be.",
};

export const DONT_SHOW_AGAIN_THRESHOLD = 1;

export function offersDontShowAgain(priorShowings: number): boolean {
  return priorShowings >= DONT_SHOW_AGAIN_THRESHOLD;
}

export function getNudgeCopy(goal?: string | null): { headline: string; sub: string } {
  if (goal && goal in GOAL_COPY) {
    return GOAL_COPY[goal as FitnessGoal];
  }
  return DEFAULT_COPY;
}

export interface ProgramNudgeModalProps {
  visible: boolean;
  fitnessGoal?: string | null;
  /** Times this member has already been shown the nudge, NOT counting this one. */
  priorShowings?: number;
  onExplore: () => void;
  onFindProgram?: () => void;
  onDismissForever: () => void;
  testID?: string;
}

export function ProgramNudgeModal({
  visible,
  fitnessGoal,
  priorShowings = 0,
  onExplore,
  onFindProgram,
  onDismissForever,
  testID,
}: ProgramNudgeModalProps) {
  const { colors, tint } = useThemeTokens();
  const copy = getNudgeCopy(fitnessGoal);
  const showOptOut = offersDontShowAgain(priorShowings);

  const modalId = testID ?? "program-nudge-modal";

  return (
    <Modal visible={visible} onClose={onExplore} testID={modalId}>
      <View style={styles.content}>
        {/* Dumbbell Icon */}
        <View
          testID="program-nudge-icon"
          style={[styles.iconContainer, { backgroundColor: colors.foreground }]}
        >
          <Dumbbell size={28} color={colors.background} />
        </View>

        {/* Copy */}
        <Text
          testID="program-nudge-headline"
          accessibilityRole="header"
          style={styles.headline}
          className="text-foreground"
        >
          {copy.headline}
        </Text>
        <Text
          testID="program-nudge-sub"
          style={styles.sub}
          className="text-muted-foreground"
        >
          {copy.sub}
        </Text>

        {/* CTAs */}
        <View style={styles.ctaGroup}>
          <Pressable
            testID="program-nudge-find-program"
            accessibilityRole="button"
            accessibilityLabel="Find My Program"
            onPress={onFindProgram ?? onExplore}
            style={[
              styles.primaryBtn,
              { backgroundColor: colors.foreground },
              minTouchTarget,
            ]}
          >
            <Text style={[styles.primaryBtnText, { color: colors.background }]}>
              Find My Program
            </Text>
            <ArrowRight size={16} color={colors.background} />
          </Pressable>

          <Pressable
            testID="program-nudge-explore"
            accessibilityRole="button"
            accessibilityLabel="Explore first"
            onPress={onExplore}
            style={[
              styles.secondaryBtn,
              { borderColor: colors.border },
              minTouchTarget,
            ]}
          >
            <Compass size={16} color={colors.foreground} />
            <Text style={[styles.secondaryBtnText, { color: colors.foreground }]}>
              Explore first
            </Text>
          </Pressable>
        </View>

        {/* Dismissal context */}
        <Text
          testID="program-nudge-context"
          style={styles.caption}
          className="text-muted-foreground"
        >
          You can always start a program later from Workout
        </Text>

        {/* Permanent opt-out */}
        {showOptOut && (
          <Pressable
            testID="program-nudge-dismiss-forever"
            accessibilityRole="button"
            accessibilityLabel="Don't show this again"
            onPress={onDismissForever}
            style={[
              styles.optOutBtn,
              {
                borderColor: colors.border,
                backgroundColor: tint("muted", 0.4),
              },
              minTouchTarget,
            ]}
          >
            <BellOff size={16} color={colors.foreground} />
            <Text style={[styles.optOutBtnText, { color: colors.foreground }]}>
              Don’t show this again
            </Text>
          </Pressable>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  content: {
    alignItems: "center",
  },
  iconContainer: {
    width: 56,
    height: 56,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  headline: {
    fontSize: 20,
    fontWeight: "700",
    textAlign: "center",
  },
  sub: {
    fontSize: 14,
    textAlign: "center",
    marginTop: 8,
    lineHeight: 20,
  },
  ctaGroup: {
    width: "100%",
    marginTop: 24,
    gap: 12,
  },
  primaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    gap: 8,
  },
  primaryBtnText: {
    fontSize: 14,
    fontWeight: "700",
  },
  secondaryBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    gap: 8,
  },
  secondaryBtnText: {
    fontSize: 14,
    fontWeight: "600",
  },
  caption: {
    fontSize: 12,
    textAlign: "center",
    marginTop: 16,
  },
  optOutBtn: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginTop: 16,
    gap: 8,
  },
  optOutBtnText: {
    fontSize: 14,
    fontWeight: "600",
  },
});

export default ProgramNudgeModal;
