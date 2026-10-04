import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import {
  ArrowRight,
  ClipboardList,
  Dumbbell,
  TrendingUp,
  UtensilsCrossed,
} from "lucide-react-native";
import { Text } from "@/components/Text";
import { Card } from "@/components/Card";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";
import { minTouchTarget } from "@/lib/a11y/touchTarget";
import { WRAPPABLE_TEXT } from "@/lib/a11y/dynamicType";

/**
 * First-time empty state + quick links — the native half of the web's
 * `DashboardClient.tsx` bottom sections.
 *
 * The empty state renders when there is no current program and no logged
 * workouts yet ("No program yet / Browse programs and enroll when you're
 * ready / Browse"), opening the Workout tab.
 *
 * Quick links mirror the web's 2×2 grid minus Connect: chat is on hold for
 * the store release, so there is no chat link. Progress points at History
 * (NP-112) until native progress (NP-130) exists — the Training Log at
 * `/progress` is the closest shipped screen that means "your history".
 */
export interface DashboardQuickLinksProps {
  showEmptyState?: boolean;
  onBrowsePrograms?: () => void;
  onOpenPrograms?: () => void;
  onOpenNutrition?: () => void;
  onOpenHistory?: () => void;
  nutritionDescription?: string | null;
  testID?: string;
}

export function DashboardQuickLinks({
  showEmptyState = false,
  onBrowsePrograms,
  onOpenPrograms,
  onOpenNutrition,
  onOpenHistory,
  nutritionDescription,
  testID = "dashboard-quick-links",
}: DashboardQuickLinksProps) {
  const { colors } = useThemeTokens();

  return (
    <View testID={testID} style={styles.wrapper}>
      {showEmptyState ? (
        <Card testID="dashboard-empty-state">
          <View style={styles.emptyRow}>
            <View
              style={[styles.emptyIcon, { backgroundColor: colors.muted }]}
            >
              <Dumbbell size={24} color={colors["muted-foreground"]} />
            </View>
            <View style={styles.emptyMeta}>
              <Text
                testID="dashboard-empty-state-title"
                className="text-foreground font-semibold text-base"
              >
                No program yet
              </Text>
              <Text className="text-muted-foreground text-sm mt-0.5">
                Browse programs and enroll when you&apos;re ready.
              </Text>
            </View>
            <Pressable
              testID="dashboard-empty-state-browse"
              accessibilityRole="button"
              accessibilityLabel="Browse programs"
              onPress={onBrowsePrograms}
              style={[
                minTouchTarget,
                styles.browseButton,
                { backgroundColor: colors.foreground },
              ]}
            >
              <Text
                style={[styles.browseText, { color: colors.background }]}
              >
                Browse
              </Text>
              <ArrowRight size={16} color={colors.background} />
            </Pressable>
          </View>
        </Card>
      ) : null}

      <View testID="dashboard-quick-links-grid" style={styles.grid}>
        <Pressable
          testID="dashboard-quick-link-programs"
          accessibilityRole="button"
          accessibilityLabel="All Programs. Training plans"
          onPress={onOpenPrograms}
          style={[
            minTouchTarget,
            styles.link,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          <View
            style={[styles.linkIcon, { backgroundColor: colors.muted }]}
          >
            <ClipboardList size={20} color={colors["muted-foreground"]} />
          </View>
          <View style={[styles.linkMeta, WRAPPABLE_TEXT]}>
            <Text className="text-foreground text-sm font-semibold">
              All Programs
            </Text>
            <Text className="text-muted-foreground text-xs">
              Training plans
            </Text>
          </View>
        </Pressable>

        <Pressable
          testID="dashboard-quick-link-nutrition"
          accessibilityRole="button"
          accessibilityLabel={`Nutrition. ${nutritionDescription ?? "Track meals & macros"}`}
          onPress={onOpenNutrition}
          style={[
            minTouchTarget,
            styles.link,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          <View
            style={[styles.linkIcon, { backgroundColor: colors.muted }]}
          >
            <UtensilsCrossed size={20} color={colors["muted-foreground"]} />
          </View>
          <View style={[styles.linkMeta, WRAPPABLE_TEXT]}>
            <Text className="text-foreground text-sm font-semibold">
              Nutrition
            </Text>
            <Text className="text-muted-foreground text-xs">
              {nutritionDescription ?? "Track meals & macros"}
            </Text>
          </View>
        </Pressable>

        <Pressable
          testID="dashboard-quick-link-progress"
          accessibilityRole="button"
          accessibilityLabel="Progress. Weight & PRs"
          onPress={onOpenHistory}
          style={[
            minTouchTarget,
            styles.link,
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          <View
            style={[styles.linkIcon, { backgroundColor: colors.muted }]}
          >
            <TrendingUp size={20} color={colors["muted-foreground"]} />
          </View>
          <View style={[styles.linkMeta, WRAPPABLE_TEXT]}>
            <Text className="text-foreground text-sm font-semibold">
              Progress
            </Text>
            <Text className="text-muted-foreground text-xs">
              Weight &amp; PRs
            </Text>
          </View>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    gap: 8,
  },
  emptyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  emptyIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  emptyMeta: {
    flex: 1,
    minWidth: 0,
  },
  browseButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
    flexShrink: 0,
  },
  browseText: {
    fontSize: 14,
    fontWeight: "600",
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  link: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 12,
    borderWidth: 1,
    padding: 10,
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: "45%",
    minHeight: 56,
  },
  linkIcon: {
    width: 36,
    height: 36,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  linkMeta: {
    flex: 1,
    minWidth: 0,
  },
});

export default DashboardQuickLinks;
