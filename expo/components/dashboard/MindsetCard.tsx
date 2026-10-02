import React from "react";
import { View, Pressable, StyleSheet } from "react-native";
import { useRouter } from "expo-router";
import { Brain, Check, Sparkles } from "lucide-react-native";
import { Text } from "@/components/Text";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";
import { minTouchTarget } from "@/lib/a11y/touchTarget";
import { moodGateway } from "@become/core";
import type { MindSummaryResponse } from "@become/api-client";
import type { MoodLevel } from "@/components/CheckInModal";
import {
  chapterProgressPct,
  mindsetCta,
  mindsetStatus,
  resolveMindsetMood,
  visibleLastState,
} from "@/lib/mind/mindsetCard";

export interface MindsetCardProps {
  /** The cheap read-only summary from GET /api/mind/summary (NP-037). */
  summary?: MindSummaryResponse | null;
  /** Today's 1–5 mood from the check-in; falls back to summary.todayMood. */
  todaysMood?: MoodLevel | number | null;
  /** Opens the native Mind tab. Defaults to the tab route (NP-097). */
  onOpenMind?: () => void;
  testID?: string;
}

/**
 * The dashboard's Mindset card, ported from
 * `webapp/components/dashboard/MindsetCard.tsx`.
 *
 * Shows the level and chapter with sessions into the chapter, whether today's
 * session is done or ready, this week's mood check-ins and sessions, the last
 * reported state (within 24 hours only), and a button whose words follow
 * today's mood. The button opens the native Mind tab — never the web.
 */
export function MindsetCard({
  summary = null,
  todaysMood = null,
  onOpenMind,
  testID = "mindset-card",
}: MindsetCardProps) {
  const { colors, tint } = useThemeTokens();
  const router = useRouter();

  const mood = resolveMindsetMood(todaysMood, summary);
  const gateway = mood ? moodGateway(mood) : null;
  const cta = mindsetCta(summary, mood);
  const status = mindsetStatus(summary);
  const lastStateWord = visibleLastState(summary);
  const pct = summary ? chapterProgressPct(summary) : 0;

  const handlePress = () => {
    if (onOpenMind) {
      onOpenMind();
    } else {
      router.push("/(tabs)/mind?start=1" as never);
    }
  };

  const moodCount = summary?.moodCheckinsLast7Days ?? 0;
  const sessionCount = summary?.sessionsLast7Days ?? 0;

  return (
    <Card testID={testID}>
      <View style={styles.headerRow}>
        <Text
          testID={`${testID}-title`}
          className="text-foreground text-base font-semibold"
        >
          Mindset
        </Text>
        <Pressable
          testID={`${testID}-view`}
          accessibilityRole="button"
          accessibilityLabel="View Mindset"
          onPress={handlePress}
          style={[minTouchTarget, styles.viewLink]}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text className="text-sm font-medium text-blue-600 dark:text-blue-400">
            View
          </Text>
        </Pressable>
      </View>

      {summary ? (
        <>
          {/* Level · chapter */}
          <View style={styles.levelRow}>
            <View
              style={[
                styles.iconBadge,
                { backgroundColor: tint("accent", 0.15) },
              ]}
            >
              <Brain size={20} color={colors.accent} />
            </View>
            <View style={styles.levelMeta}>
              <Text
                testID={`${testID}-level`}
                numberOfLines={1}
                ellipsizeMode="tail"
                className="text-foreground font-medium"
              >
                Level {summary.level} · Chapter {summary.chapter}
                {summary.chapterName ? `: ${summary.chapterName}` : ""}
              </Text>
              <View style={styles.progressRow}>
                <View className="h-1.5 flex-1 rounded-full bg-muted overflow-hidden">
                  <View
                    testID={`${testID}-progress-bar`}
                    className="h-full rounded-full bg-amber-500"
                    style={{ width: `${pct}%` }}
                  />
                </View>
                <Text
                  testID={`${testID}-progress-label`}
                  className="text-muted-foreground text-[11px] tabular-nums"
                >
                  {summary.sessionsIntoChapter}/{summary.sessionsPerChapter}{" "}
                  sessions
                </Text>
              </View>
            </View>
          </View>

          {/* Today + this week */}
          <View
            style={[
              styles.weekBlock,
              { backgroundColor: tint("muted", 0.3) },
            ]}
          >
            {status ? (
              <View
                testID={`${testID}-status`}
                accessible
                accessibilityRole="text"
                accessibilityLabel={status.text}
                style={styles.statusRow}
              >
                {status.done ? (
                  <Check size={14} color={colors.success} />
                ) : (
                  <Sparkles size={14} color={colors.accent} />
                )}
                <Text
                  className={`text-sm font-medium ${
                    status.done ? "text-green-600" : "text-foreground"
                  }`}
                >
                  {status.text}
                </Text>
              </View>
            ) : null}
            <Text
              testID={`${testID}-week`}
              className="text-muted-foreground text-xs mt-0.5"
            >
              {`This week: ${moodCount} mood check-in${moodCount === 1 ? "" : "s"} · ${sessionCount} session${sessionCount === 1 ? "" : "s"}`}
              {lastStateWord ? ` · last check-in ${lastStateWord}` : ""}
            </Text>
            {gateway && !summary.sessionDoneToday ? (
              <Text
                testID={`${testID}-gateway`}
                className="text-muted-foreground text-xs mt-1"
              >
                {`${gateway.headline} ${gateway.body}`}
              </Text>
            ) : null}
          </View>
        </>
      ) : (
        <View
          testID={`${testID}-skeleton`}
          style={styles.skeleton}
          accessible
          accessibilityRole="progressbar"
          accessibilityLabel="Loading mindset"
        >
          <View
            style={[styles.skeletonBar, { backgroundColor: colors.muted }]}
          />
          <View
            style={[styles.skeletonBlock, { backgroundColor: colors.muted }]}
          />
        </View>
      )}

      <Button
        testID={`${testID}-cta`}
        accessibilityLabel={cta}
        onPress={handlePress}
      >
        {cta}
      </Button>
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
  viewLink: {
    alignItems: "center",
    justifyContent: "center",
  },
  levelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 12,
  },
  iconBadge: {
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
  },
  progressRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 4,
  },
  weekBlock: {
    borderRadius: 8,
    padding: 10,
    marginBottom: 12,
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  skeleton: {
    gap: 8,
    marginBottom: 12,
  },
  skeletonBar: {
    height: 40,
    width: "66%",
    borderRadius: 8,
  },
  skeletonBlock: {
    height: 56,
    width: "100%",
    borderRadius: 8,
  },
});
