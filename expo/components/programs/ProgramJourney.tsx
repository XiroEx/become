import { ScrollView, View } from "react-native";
import { Trophy, Flame } from "lucide-react-native";
import { Text } from "@/components/Text";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";
import type { ProgramJourneyResponse } from "@become/api-client";

// ─── ProgramJourney ─────────────────────────────────────────────────────────
// Native port of `webapp/app/dashboard/workout/[programId]/journey/page.tsx`
// (NP-167). The numbers are the server's — `GET /api/programs/[programId]/
// journey` parsed by `ProgramJourneyResponseSchema` — never recomputed on the
// device, so the recap carries the web's numbers exactly.
//
// The web's expressions, kept verbatim:
//   volume  `${(totalVolumeLbs / 1000).toFixed(1)}k` with sub "lbs lifted",
//           "—" when there is nothing to count
//   weight  `{change > 0 ? "+" : ""}{change} lbs` with sub
//           `{startLbs} → {endLbs} lbs`; "—" / "no data" when the server sent
//           no weight change
//   PRs     `{weight} lbs` × `{reps} reps`, heaviest first, at most six
//           (the server sorts and caps); the section is absent when empty
//
// Colours travel through Tailwind classes and `useThemeTokens()` only — no
// hex, no rgb() — so the recap reads in light and dark mode (NP-123).
// ────────────────────────────────────────────────────────────────────────────

export const JOURNEY_ENDPOINT = (programId: string): string =>
  `/api/programs/${encodeURIComponent(programId)}/journey`;

/** The web's volume expression: `84.3k`, or "—" when there is no volume. */
export function formatJourneyVolume(totalVolumeLbs: number): string {
  return totalVolumeLbs > 0 ? `${(totalVolumeLbs / 1000).toFixed(1)}k` : "—";
}

/** The web's weight-change expression: `+4.8 lbs`, `-2 lbs`, `0 lbs`. */
export function formatJourneyWeightChange(change: number): string {
  return `${change > 0 ? "+" : ""}${change} lbs`;
}

export interface ProgramJourneyProps {
  journey: ProgramJourneyResponse;
  /** Back to the program list — the web's "Find My Next Challenge". */
  onFindNext: () => void;
  /** The training log — the web's "View Full Training Log". */
  onViewLog: () => void;
  testID?: string;
}

export function ProgramJourney({
  journey,
  onFindNext,
  onViewLog,
  testID = "program-journey",
}: ProgramJourneyProps) {
  const { colors, tint } = useThemeTokens();

  const dateRange =
    journey.startDate && journey.endDate
      ? `${journey.startDate} — ${journey.endDate}`
      : journey.durationWeeks > 0
        ? `${journey.durationWeeks} weeks`
        : null;

  return (
    <ScrollView
      testID={testID}
      contentContainerStyle={{ padding: 20, gap: 16 }}
    >
      {/* Header */}
      <View style={{ gap: 2 }}>
        <Text
          testID={`${testID}-title`}
          className="text-foreground text-xl font-black"
        >
          Your Journey
        </Text>
        <Text
          testID={`${testID}-program-name`}
          className="text-muted-foreground text-sm"
        >
          {journey.programName}
        </Text>
      </View>

      {/* Hero banner — the web's PROGRAM COMPLETE trophy card. */}
      <View
        testID={`${testID}-hero`}
        style={{
          borderRadius: 16,
          borderWidth: 1,
          borderColor: tint("accent", 0.3),
          backgroundColor: tint("accent", 0.1),
          padding: 20,
          alignItems: "center",
          gap: 8,
        }}
      >
        <View
          style={{
            height: 64,
            width: 64,
            borderRadius: 32,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: tint("accent", 0.2),
            borderWidth: 4,
            borderColor: tint("accent", 0.3),
          }}
        >
          <Trophy size={32} color={colors.accent} strokeWidth={1.5} />
        </View>
        <Text
          testID={`${testID}-hero-title`}
          style={{ color: colors.accent }}
          className="text-2xl font-black text-center"
        >
          PROGRAM COMPLETE
        </Text>
        {dateRange ? (
          <Text
            testID={`${testID}-hero-dates`}
            className="text-muted-foreground text-sm text-center"
          >
            {dateRange}
          </Text>
        ) : null}
        <Text className="text-muted-foreground text-xs text-center">
          You showed up and did the work. That&apos;s everything.
        </Text>
      </View>

      {/* Key stats grid — sessions, volume, length, weight change. */}
      <View
        testID={`${testID}-stats`}
        style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}
      >
        <View style={{ flex: 1, minWidth: 140 }}>
          <Card testID={`${testID}-stat-sessions`} style={{ alignItems: "center" }}>
            <Text
              testID={`${testID}-sessions`}
              style={{ color: colors.success }}
              className="text-2xl font-black tabular-nums"
            >
              {String(journey.totalSessions)}
            </Text>
            <Text className="text-muted-foreground text-xs font-medium uppercase mt-1 text-center">
              Sessions Completed
            </Text>
          </Card>
        </View>
        <View style={{ flex: 1, minWidth: 140 }}>
          <Card testID={`${testID}-stat-volume`} style={{ alignItems: "center" }}>
            <Text
              testID={`${testID}-volume`}
              className="text-2xl font-black tabular-nums text-foreground"
            >
              {formatJourneyVolume(journey.totalVolumeLbs)}
            </Text>
            {journey.totalVolumeLbs > 0 ? (
              <Text className="text-muted-foreground text-xs mt-0.5">
                lbs lifted
              </Text>
            ) : null}
            <Text className="text-muted-foreground text-xs font-medium uppercase mt-1 text-center">
              Total Volume
            </Text>
          </Card>
        </View>
        {journey.durationWeeks > 0 ? (
          <View style={{ flex: 1, minWidth: 140 }}>
            <Card testID={`${testID}-stat-length`} style={{ alignItems: "center" }}>
              <Text
                testID={`${testID}-length`}
                className="text-2xl font-black tabular-nums text-foreground"
              >
                {`${journey.durationWeeks}w`}
              </Text>
              <Text className="text-muted-foreground text-xs font-medium uppercase mt-1 text-center">
                Program Length
              </Text>
            </Card>
          </View>
        ) : null}
        {journey.weightChange ? (
          <View style={{ flex: 1, minWidth: 140 }}>
            <Card testID={`${testID}-stat-weight`} style={{ alignItems: "center" }}>
              <Text
                testID={`${testID}-weight-change`}
                style={{ color: colors.accent }}
                className="text-2xl font-black tabular-nums text-center"
              >
                {formatJourneyWeightChange(journey.weightChange.change)}
              </Text>
              <Text className="text-muted-foreground text-xs mt-0.5 text-center">
                {journey.weightChange.startLbs} → {journey.weightChange.endLbs}{" "}
                lbs
              </Text>
              <Text className="text-muted-foreground text-xs font-medium uppercase mt-1 text-center">
                Weight Change
              </Text>
            </Card>
          </View>
        ) : journey.durationWeeks === 0 ? null : (
          <View style={{ flex: 1, minWidth: 140 }}>
            <Card testID={`${testID}-stat-weight`} style={{ alignItems: "center" }}>
              <Text
                testID={`${testID}-weight-change`}
                className="text-2xl font-black tabular-nums text-foreground"
              >
                —
              </Text>
              <Text className="text-muted-foreground text-xs mt-0.5">
                no data
              </Text>
              <Text className="text-muted-foreground text-xs font-medium uppercase mt-1 text-center">
                Weight Change
              </Text>
            </Card>
          </View>
        )}
      </View>

      {/* Top PRs — absent when the server sent none, like the web. */}
      {journey.topPRs.length > 0 ? (
        <View testID={`${testID}-prs`}>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
              marginBottom: 12,
            }}
          >
            <Flame size={16} color={colors.accent} />
            <Text className="text-foreground font-bold">
              Top Personal Records
            </Text>
          </View>
          <View style={{ gap: 8 }}>
            {journey.topPRs.map((pr, i) => (
              <Card
                key={pr.name}
                testID={`${testID}-pr-${i}`}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 12,
                    flex: 1,
                  }}
                >
                  <View
                    style={{
                      height: 28,
                      width: 28,
                      borderRadius: 14,
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: colors.muted,
                    }}
                  >
                    <Text className="text-muted-foreground text-xs font-bold">
                      {i + 1}
                    </Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text
                      testID={`${testID}-pr-${i}-name`}
                      className="text-foreground text-sm font-semibold"
                    >
                      {pr.name}
                    </Text>
                    <Text className="text-muted-foreground text-xs">
                      {pr.date}
                    </Text>
                  </View>
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <Text
                    testID={`${testID}-pr-${i}-weight`}
                    style={{ color: colors.accent }}
                    className="font-black"
                  >
                    {pr.weight} lbs
                  </Text>
                  <Text className="text-muted-foreground text-xs">
                    × {pr.reps} reps
                  </Text>
                </View>
              </Card>
            ))}
          </View>
        </View>
      ) : null}

      {/* Footer CTAs — the web's two buttons, same words, same order. */}
      <View testID={`${testID}-ctas`} style={{ gap: 8 }}>
        <Button
          testID={`${testID}-next`}
          size="lg"
          onPress={onFindNext}
          accessibilityHint="Returns to the program list"
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
  );
}
