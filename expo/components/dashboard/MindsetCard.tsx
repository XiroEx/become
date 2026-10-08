import React from "react";
import { View, Pressable, StyleSheet } from "react-native";
import { Text } from "@/components/Text";
import { Card } from "@/components/Card";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";
import { useRouter } from "expo-router";
import { ArrowRight, Brain, Check, Sparkles } from "lucide-react-native";
import type { MindSummaryResponse } from "@become/api-client";
import { moodGateway, type MoodLevel } from "@become/core";
import { minTouchTarget } from "@/lib/a11y/touchTarget";
import { WRAPPABLE_TEXT } from "@/lib/a11y/dynamicType";
import { usePressed } from "@/lib/a11y/usePressed";
import {
  computeMindsetCta,
  computeMindsetStatus,
  computeChapterProgress,
  isLastStateWithin24Hours,
  formatLastStateFeeling,
  getEffectiveMood,
} from "@/lib/mind/mindsetCard";

export interface MindsetCardProps {
  summary?: MindSummaryResponse | null;
  todaysMood?: MoodLevel | null;
  onOpenMind?: () => void;
  testID?: string;
}

export function MindsetCard({
  summary,
  todaysMood,
  onOpenMind,
  testID = "mindset-card",
}: MindsetCardProps) {
  const { colors, tint } = useThemeTokens();
  const router = useRouter();
  const ctaPress = usePressed();

  const handleOpenMind = () => {
    if (onOpenMind) {
      onOpenMind();
    } else {
      router.push("/(tabs)/mind" as never);
    }
  };

  const mood = getEffectiveMood(todaysMood, summary);
  const gateway = mood ? moodGateway(mood) : null;
  const cta = computeMindsetCta(summary, mood);
  const status = computeMindsetStatus(summary);
  const lastState =
    summary?.lastState && isLastStateWithin24Hours(summary.lastState)
      ? summary.lastState
      : null;

  const progressPct = summary
    ? computeChapterProgress(
        summary.sessionsIntoChapter,
        summary.sessionsPerChapter,
      )
    : 0;

  return (
    <Card testID={testID}>
      {/* Header */}
      <View style={styles.headerRow}>
        <Text
          testID="mindset-card-title"
          style={[
            styles.headerTitle,
            WRAPPABLE_TEXT,
            { color: colors.foreground },
          ]}
        >
          Mindset
        </Text>
        <Pressable
          testID="mindset-card-view"
          accessibilityRole="button"
          accessibilityLabel="View Mindset"
          onPress={handleOpenMind}
          style={[minTouchTarget, styles.viewLink, { flexShrink: 1 }]}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text
            style={[
              styles.viewLinkText,
              WRAPPABLE_TEXT,
              { color: colors.primary },
            ]}
          >
            View
          </Text>
        </Pressable>
      </View>

      {summary ? (
        <>
          {/* Level · chapter */}
          <View style={styles.levelRow}>
            {/* The web's brain tile is violet (`bg-purple-100` /
                `text-purple-600`), not the orange accent (NP-316). */}
            <View
              style={[
                styles.brainBadge,
                { backgroundColor: tint("mind-violet", 0.15) },
              ]}
            >
              <Brain size={20} color={colors["mind-violet"]} />
            </View>
            <View style={styles.levelMeta}>
              <Text
                testID="mindset-level-chapter"
                style={[styles.levelTitleText, { color: colors.foreground }]}
              >
                Level {summary.level}
                <Text style={styles.dotText}> · </Text>
                Chapter {summary.chapter}
                {summary.chapterName ? `: ${summary.chapterName}` : ""}
              </Text>
              <View style={styles.progressRow}>
                <View
                  style={[
                    styles.progressTrack,
                    { backgroundColor: tint("muted", 0.5) },
                  ]}
                >
                  <View
                    style={[
                      styles.progressBar,
                      {
                        backgroundColor: colors["mind-violet"],
                        width: `${progressPct}%`,
                      },
                    ]}
                  />
                </View>
                <Text
                  testID="mindset-sessions-progress"
                  style={[
                    styles.sessionsCountText,
                    WRAPPABLE_TEXT,
                    { color: colors["muted-foreground"] },
                  ]}
                >
                  {summary.sessionsIntoChapter}/{summary.sessionsPerChapter} sessions
                </Text>
              </View>
            </View>
          </View>

          {/* Today + this week — flat tinted block */}
          <View
            style={[
              styles.statusBlock,
              { backgroundColor: tint("muted", 0.3) },
            ]}
          >
            {status ? (
              <View style={styles.statusLineRow}>
                {status.done ? (
                  <Check size={16} color={colors.success} />
                ) : (
                  <Sparkles size={16} color={colors["mind-violet"]} />
                )}
                <Text
                  testID="mindset-status-text"
                  style={[
                    styles.statusText,
                    WRAPPABLE_TEXT,
                    { color: status.done ? colors.success : colors.foreground },
                  ]}
                >
                  {status.text}
                </Text>
              </View>
            ) : null}

            <Text
              testID="mindset-week-text"
              style={[styles.weekText, { color: colors["muted-foreground"] }]}
            >
              This week: {summary.moodCheckinsLast7Days} mood check-in
              {summary.moodCheckinsLast7Days === 1 ? "" : "s"}
              {" · "}
              {summary.sessionsLast7Days} session
              {summary.sessionsLast7Days === 1 ? "" : "s"}
              {lastState ? (
                <>
                  {" · "}last check-in{" "}
                  <Text
                    style={[
                      styles.feelingText,
                      { color: colors.foreground },
                    ]}
                  >
                    {formatLastStateFeeling(lastState)}
                  </Text>
                </>
              ) : null}
            </Text>

            {gateway && !summary.sessionDoneToday ? (
              <Text
                testID="mindset-gateway-text"
                style={[
                  styles.gatewayText,
                  { color: colors["muted-foreground"] },
                ]}
              >
                <Text
                  style={[
                    styles.gatewayHeadline,
                    { color: colors.foreground },
                  ]}
                >
                  {gateway.headline}{" "}
                </Text>
                {gateway.body}
              </Text>
            ) : null}
          </View>
        </>
      ) : (
        /* Loading placeholder */
        <View
          testID="mindset-card-placeholder"
          accessible={false}
          importantForAccessibility="no"
          style={styles.placeholderContainer}
        >
          <View
            style={[
              styles.placeholderTop,
              { backgroundColor: tint("muted", 0.5) },
            ]}
          />
          <View
            style={[
              styles.placeholderBottom,
              { backgroundColor: tint("muted", 0.5) },
            ]}
          />
        </View>
      )}

      {/* CTA Button */}
      <Pressable
        testID="mindset-cta"
        accessibilityRole="button"
        accessibilityLabel={cta}
        onPress={handleOpenMind}
        onPressIn={ctaPress.onPressIn}
        onPressOut={ctaPress.onPressOut}
        style={[
          styles.ctaButton,
          {
            backgroundColor: colors.foreground,
            opacity: ctaPress.pressed ? 0.85 : 1,
          },
        ]}
      >
        <Text
          style={[
            styles.ctaText,
            WRAPPABLE_TEXT,
            { color: colors.background },
          ]}
        >
          {cta}
        </Text>
        <ArrowRight size={16} color={colors.background} />
      </Pressable>
    </Card>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: "600",
  },
  viewLink: {
    justifyContent: "center",
    alignItems: "flex-end",
  },
  viewLinkText: {
    fontSize: 14,
    fontWeight: "500",
  },
  levelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 12,
  },
  brainBadge: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  levelMeta: {
    flex: 1,
    minWidth: 0,
    justifyContent: "center",
  },
  levelTitleText: {
    fontSize: 14,
    fontWeight: "600",
  },
  dotText: {
    opacity: 0.5,
  },
  progressRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 4,
  },
  progressTrack: {
    flex: 1,
    height: 6,
    borderRadius: 9999,
    overflow: "hidden",
  },
  progressBar: {
    height: "100%",
    borderRadius: 9999,
  },
  sessionsCountText: {
    fontSize: 11,
    fontWeight: "500",
  },
  statusBlock: {
    borderRadius: 10,
    padding: 10,
    marginBottom: 12,
    gap: 4,
  },
  statusLineRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  statusText: {
    fontSize: 14,
    fontWeight: "500",
  },
  weekText: {
    fontSize: 12,
    lineHeight: 16,
  },
  feelingText: {
    fontWeight: "600",
  },
  gatewayText: {
    fontSize: 12,
    lineHeight: 16,
    marginTop: 2,
  },
  gatewayHeadline: {
    fontWeight: "700",
  },
  placeholderContainer: {
    marginBottom: 12,
    gap: 8,
  },
  placeholderTop: {
    minHeight: 36,
    width: "66%",
    borderRadius: 8,
  },
  placeholderBottom: {
    minHeight: 52,
    width: "100%",
    borderRadius: 10,
  },
  ctaButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    minHeight: 44,
    minWidth: 44,
  },
  ctaText: {
    fontSize: 14,
    fontWeight: "600",
  },
});

export default MindsetCard;
