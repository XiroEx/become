import { ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Trophy, Flame, TrendingUp, TrendingDown, Minus } from "lucide-react-native";
import { Text } from "@/components/Text";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";
import { WRAPPABLE_TEXT } from "@/lib/a11y/dynamicType";
import type {
  ProgramJourneyPR,
  ProgramJourneyResponse,
  ProgramJourneyWeightChange,
} from "@become/api-client";

// ─── ProgramJourney ─────────────────────────────────────────────────────────
// Native port of `webapp/app/dashboard/workout/[programId]/journey/page.tsx`
// (NP-167).
//
// The web's recap is the source of truth for what finishing a program shows:
// sessions completed, total volume, weight change and the top PRs across the
// program. The numbers come straight from
// `GET /api/programs/[programId]/journey` — no client-side recomputation — so
// the native recap matches the web's by construction.
//
// Two deliberate divergences from the web, both on the record:
//   1. No animation library: the web's framer-motion entrances are plain
//      layout here. Same sections, same order, same words.
//   2. The web's hero swaps its icon by state (Trophy) and its stat cards use
//      fixed dark classes; here every colour comes from a Tailwind class or
//      `useThemeTokens()` (NP-123) so the recap reads in light and dark mode.
// ────────────────────────────────────────────────────────────────────────────

export const JOURNEY_TEST_ID = "program-journey";

/**
 * The web's volume cell: `totalVolumeLbs > 0 ? `${(v/1000).toFixed(1)}k` : "—"`.
 * Kept as a named export so the suite pins the exact expression.
 */
export function formatJourneyVolume(totalVolumeLbs: number): string {
  return totalVolumeLbs > 0 ? `${(totalVolumeLbs / 1000).toFixed(1)}k` : "—";
}

/**
 * The web's weight-change cell: `{change > 0 ? "+" : ""}{change} lbs` with the
 * `{startLbs} → {endLbs} lbs` sub-line. Rendered as ONE string — a split
 * `{value}{" lbs"}` pair reads as two fragments to a screen reader and to
 * `props.children` assertions alike.
 */
export function formatJourneyWeightChange(change: ProgramJourneyWeightChange): string {
  return `${change.change > 0 ? "+" : ""}${change.change} lbs`;
}

export function journeyWeightSub(change: ProgramJourneyWeightChange): string {
  return `${change.startLbs} → ${change.endLbs} lbs`;
}

export interface ProgramJourneyProps {
  journey: ProgramJourneyResponse;
  /** "Find My Next Challenge" — back to the Workout tab. */
  onFindNext: () => void;
  /** "View Full Training Log" — the native Training Log. */
  onViewLog: () => void;
  testID?: string;
}

function WeightGlyph({ change }: { change: ProgramJourneyWeightChange | null }) {
  const { colors } = useThemeTokens();
  const glyphColor = !change || change.change === 0
    ? colors["muted-foreground"]
    : change.change < 0
      ? colors.success
      : colors.accent;
  const Glyph = !change || change.change === 0 ? Minus : change.change < 0 ? TrendingDown : TrendingUp;
  return <Glyph size={20} color={glyphColor} />;
}

export function ProgramJourney({
  journey,
  onFindNext,
  onViewLog,
  testID = JOURNEY_TEST_ID,
}: ProgramJourneyProps) {
  const { colors } = useThemeTokens();
  const volumeLabel = formatJourneyVolume(journey.totalVolumeLbs);
  const dateLine =
    journey.startDate && journey.endDate
      ? `${journey.startDate} — ${journey.endDate}`
      : journey.durationWeeks > 0
        ? `${journey.durationWeeks} weeks`
        : null;

  return (
    <SafeAreaView
      edges={["top", "bottom"]}
      style={{ flex: 1, backgroundColor: colors.background }}
      testID={testID}
    >
      <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }}>
        {/* Hero banner */}
        <Card
          testID={`${testID}-hero`}
          style={{ alignItems: "center", paddingVertical: 20 }}
        >
          <View
            style={{
              width: 64,
              height: 64,
              borderRadius: 32,
              backgroundColor: colors.muted,
              alignItems: "center",
              justifyContent: "center",
              marginBottom: 12,
            }}
          >
            <Trophy size={32} color={colors.accent} strokeWidth={1.5} />
          </View>
          <Text
            testID={`${testID}-title`}
            className="text-foreground text-2xl font-black text-center"
          >
            PROGRAM COMPLETE
          </Text>
          <Text
            testID={`${testID}-program-name`}
            className="text-muted-foreground text-sm mt-1 text-center"
          >
            {journey.programName}
          </Text>
          {dateLine ? (
            <Text
              testID={`${testID}-dates`}
              className="text-muted-foreground text-sm mt-1 text-center"
            >
              {dateLine}
            </Text>
          ) : null}
          <Text className="text-muted-foreground text-xs mt-2 text-center">
            You showed up and did the work. That&apos;s everything.
          </Text>
        </Card>

        {/* Key stats grid */}
        <View style={{ flexDirection: "row", gap: 8 }}>
          <View style={{ flex: 1 }}>
            <Card testID={`${testID}-stat-sessions`} style={{ alignItems: "center" }}>
              <Text
                testID={`${testID}-sessions`}
                className="text-foreground text-2xl font-black text-center"
              >
                {String(journey.totalSessions)}
              </Text>
              <Text className="text-muted-foreground text-xs font-medium uppercase mt-1 text-center">
                Sessions Completed
              </Text>
            </Card>
          </View>
          <View style={{ flex: 1 }}>
            <Card testID={`${testID}-stat-volume`} style={{ alignItems: "center" }}>
              <Text
                testID={`${testID}-volume`}
                className="text-foreground text-2xl font-black text-center"
              >
                {volumeLabel}
              </Text>
              {journey.totalVolumeLbs > 0 ? (
                <Text className="text-muted-foreground text-xs mt-0.5 text-center">
                  lbs lifted
                </Text>
              ) : null}
              <Text className="text-muted-foreground text-xs font-medium uppercase mt-1 text-center">
                Total Volume
              </Text>
            </Card>
          </View>
        </View>
        <View style={{ flexDirection: "row", gap: 8 }}>
          {journey.durationWeeks > 0 ? (
            <View style={{ flex: 1 }}>
              <Card testID={`${testID}-stat-length`} style={{ alignItems: "center" }}>
                <Text
                  testID={`${testID}-length`}
                  className="text-foreground text-2xl font-black text-center"
                >
                  {`${journey.durationWeeks}w`}
                </Text>
                <Text className="text-muted-foreground text-xs font-medium uppercase mt-1 text-center">
                  Program Length
                </Text>
              </Card>
            </View>
          ) : null}
          <View style={{ flex: 1 }}>
            {journey.weightChange ? (
              <Card testID={`${testID}-stat-weight`} style={{ alignItems: "center" }}>
                <View
                  style={{ flexDirection: "row", alignItems: "center", gap: 4 }}
                >
                  <WeightGlyph change={journey.weightChange} />
                  <Text
                    testID={`${testID}-weight-change`}
                    style={[WRAPPABLE_TEXT, { textAlign: "center" }]}
                    className="text-foreground text-2xl font-black"
                  >
                    {formatJourneyWeightChange(journey.weightChange)}
                  </Text>
                </View>
                <Text
                  testID={`${testID}-weight-range`}
                  className="text-muted-foreground text-xs mt-0.5 text-center"
                >
                  {journeyWeightSub(journey.weightChange)}
                </Text>
                <Text className="text-muted-foreground text-xs font-medium uppercase mt-1 text-center">
                  Weight Change
                </Text>
              </Card>
            ) : (
              <Card testID={`${testID}-stat-weight`} style={{ alignItems: "center" }}>
                <Text
                  testID={`${testID}-weight-change`}
                  className="text-foreground text-2xl font-black text-center"
                >
                  —
                </Text>
                <Text className="text-muted-foreground text-xs mt-0.5 text-center">
                  no data
                </Text>
                <Text className="text-muted-foreground text-xs font-medium uppercase mt-1 text-center">
                  Weight Change
                </Text>
              </Card>
            )}
          </View>
        </View>

        {/* Top PRs */}
        {journey.topPRs.length > 0 ? (
          <View testID={`${testID}-prs`}>
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 }}
            >
              <Flame size={16} color={colors.accent} />
              <Text className="text-foreground font-bold">
                Top Personal Records
              </Text>
            </View>
            <View style={{ gap: 8 }}>
              {journey.topPRs.map((pr: ProgramJourneyPR, i: number) => (
                <Card
                  key={`${pr.name}-${i}`}
                  testID={`${testID}-pr-${i}`}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                  }}
                >
                  <View
                    style={{ flexDirection: "row", alignItems: "center", gap: 12, flex: 1 }}
                  >
                    <View
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: 14,
                        backgroundColor: colors.muted,
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Text className="text-muted-foreground text-xs font-bold">
                        {i + 1}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text
                        testID={`${testID}-pr-${i}-name`}
                        style={WRAPPABLE_TEXT}
                        className="text-foreground text-sm font-semibold"
                      >
                        {pr.name}
                      </Text>
                      <Text
                        testID={`${testID}-pr-${i}-date`}
                        className="text-muted-foreground text-xs"
                      >
                        {pr.date}
                      </Text>
                    </View>
                  </View>
                  <View style={{ alignItems: "flex-end" }}>
                    <Text
                      testID={`${testID}-pr-${i}-weight`}
                      className="text-foreground text-sm font-black"
                    >
                      {`${pr.weight} lbs`}
                    </Text>
                    <Text
                      testID={`${testID}-pr-${i}-reps`}
                      className="text-muted-foreground text-xs"
                    >
                      {`× ${pr.reps} reps`}
                    </Text>
                  </View>
                </Card>
              ))}
            </View>
          </View>
        ) : null}

        {/* Footer CTAs */}
        <View style={{ gap: 8, paddingTop: 4 }}>
          <Button
            testID={`${testID}-next`}
            size="lg"
            onPress={onFindNext}
            accessibilityHint="Returns to the Workout tab"
          >
            Find My Next Challenge
          </Button>
          <Button
            testID={`${testID}-log`}
            variant="ghost"
            onPress={onViewLog}
            accessibilityHint="Opens the training log"
          >
            View Full Training Log
          </Button>
        </View>
        <View style={{ height: 8 }} />
      </ScrollView>
    </SafeAreaView>
  );
}
