import { ScrollView, View } from "react-native";
import { Trophy, Flame } from "lucide-react-native";
import { Text } from "@/components/Text";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { ScreenState } from "@/components/ScreenState";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";
import { WRAPPABLE_TEXT } from "@/lib/a11y/dynamicType";
import type {
  ProgramJourneyPR,
  ProgramJourneyResponse,
} from "@become/api-client";

// ─── ProgramJourney ─────────────────────────────────────────────────────────
// Native port of `webapp/app/dashboard/workout/[programId]/journey/page.tsx`
// (NP-167). The numbers come straight from
// `GET /api/programs/[programId]/journey` — sessions, total volume, weight
// change and the top PRs — so the recap matches the web's by construction;
// nothing is recomputed on the device.
//
// Same sections, same order, same words as the web: the PROGRAM COMPLETE hero
// with the program date range, the sessions / volume / length / weight stat
// grid, the top-PR list (heaviest first, at most six), then the two closing
// CTAs (next challenge, training log). Every colour comes from
// `useThemeTokens()` or a Tailwind class (NP-123): no hard-coded ink, so the
// recap reads in light and dark mode.
// ────────────────────────────────────────────────────────────────────────────

export interface ProgramJourneyActions {
  onFindNext: () => void;
  onViewLog: () => void;
}

/**
 * The web's volume chip: `12.4k` with a `lbs lifted` sub-line, `—` when the
 * program logged no loaded work. Kept in one place so the screen and the
 * tests agree.
 */
export function formatJourneyVolume(totalVolumeLbs: number): {
  value: string;
  sub: string | null;
} {
  if (totalVolumeLbs <= 0) return { value: "—", sub: null };
  return {
    value: `${(totalVolumeLbs / 1000).toFixed(1)}k`,
    sub: "lbs lifted",
  };
}

/**
 * The web's weight-change line: `+4.8 lbs` with a `180.4 → 185.2 lbs`
 * sub-line. The sign is part of the value — a gain reads `+`, a loss reads
 * `-` from the number itself, and zero reads plain.
 */
export function formatJourneyWeightChange(change: number): string {
  return `${change > 0 ? "+" : ""}${change} lbs`;
}

function StatCell({
  testID,
  value,
  sub,
  label,
  valueTestID,
}: {
  testID: string;
  value: string;
  sub?: string | null;
  label: string;
  valueTestID?: string;
}) {
  return (
    <View testID={testID} style={{ flex: 1, minWidth: 140 }}>
      <Card style={{ alignItems: "center" }}>
        <Text
          testID={valueTestID}
          className="text-foreground text-2xl font-black text-center"
          style={WRAPPABLE_TEXT}
        >
          {value}
        </Text>
        {sub ? (
          <Text className="text-muted-foreground text-xs mt-0.5 text-center">
            {sub}
          </Text>
        ) : null}
        <Text className="text-muted-foreground text-xs font-medium uppercase mt-1 text-center">
          {label}
        </Text>
      </Card>
    </View>
  );
}

function TopPRRow({
  pr,
  rank,
  testID,
}: {
  pr: ProgramJourneyPR;
  rank: number;
  testID: string;
}) {
  return (
    <Card testID={testID}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12, flex: 1 }}>
          <View
            style={{
              width: 28,
              height: 28,
              borderRadius: 999,
              alignItems: "center",
              justifyContent: "center",
            }}
            className="bg-muted"
          >
            <Text className="text-muted-foreground text-xs font-bold">{rank}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text
              className="text-foreground text-sm font-semibold"
              style={WRAPPABLE_TEXT}
            >
              {pr.name}
            </Text>
            <Text className="text-muted-foreground text-xs">{pr.date}</Text>
          </View>
        </View>
        <View style={{ alignItems: "flex-end" }}>
          <Text className="text-accent text-base font-black">{pr.weight} lbs</Text>
          <Text className="text-muted-foreground text-xs">× {pr.reps} reps</Text>
        </View>
      </View>
    </Card>
  );
}

export function ProgramJourneyLoaded({
  journey,
  onFindNext,
  onViewLog,
  testID = "program-journey",
}: {
  journey: ProgramJourneyResponse;
  testID?: string;
} & ProgramJourneyActions) {
  const { colors } = useThemeTokens();
  const volume = formatJourneyVolume(journey.totalVolumeLbs);
  const dateRange =
    journey.startDate && journey.endDate
      ? `${journey.startDate} — ${journey.endDate}`
      : journey.durationWeeks > 0
        ? `${journey.durationWeeks} weeks`
        : null;
  const weightLabel =
    journey.weightChange !== null
      ? formatJourneyWeightChange(journey.weightChange.change)
      : null;
  const weightSub =
    journey.weightChange !== null
      ? `${journey.weightChange.startLbs} → ${journey.weightChange.endLbs} lbs`
      : null;

  return (
    <ScrollView
      contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 48 }}
      testID={testID}
    >
      {/* Hero banner */}
      <Card
        testID={`${testID}-hero`}
        style={{ alignItems: "center", paddingVertical: 20 }}
      >
        <View
          style={{
            width: 64,
            height: 64,
            borderRadius: 999,
            alignItems: "center",
            justifyContent: "center",
            marginBottom: 12,
            borderWidth: 4,
            borderColor: colors.accent,
            backgroundColor: colors.muted,
          }}
        >
          <Trophy size={32} color={colors.accent} strokeWidth={1.5} />
        </View>
        <Text
          testID={`${testID}-title`}
          className="text-accent text-2xl font-black text-center"
          style={WRAPPABLE_TEXT}
        >
          PROGRAM COMPLETE
        </Text>
        <Text
          testID={`${testID}-program-name`}
          className="text-muted-foreground text-sm mt-1 text-center"
          style={WRAPPABLE_TEXT}
        >
          {journey.programName}
        </Text>
        {dateRange ? (
          <Text className="text-muted-foreground text-sm mt-1 text-center">
            {dateRange}
          </Text>
        ) : null}
        <Text className="text-muted-foreground text-xs mt-2 text-center">
          You showed up and did the work. That&apos;s everything.
        </Text>
      </Card>

      {/* Key stats grid */}
      <View testID={`${testID}-stats`}>
        <View style={{ flexDirection: "row", gap: 12 }}>
          <StatCell
            testID={`${testID}-stat-sessions`}
            valueTestID={`${testID}-sessions`}
            value={String(journey.totalSessions)}
            label="Sessions Completed"
          />
          <StatCell
            testID={`${testID}-stat-volume`}
            valueTestID={`${testID}-volume`}
            value={volume.value}
            sub={volume.sub}
            label="Total Volume"
          />
        </View>
        <View style={{ flexDirection: "row", gap: 12, marginTop: 12 }}>
          {journey.durationWeeks > 0 ? (
            <StatCell
              testID={`${testID}-stat-length`}
              valueTestID={`${testID}-length`}
              value={`${journey.durationWeeks}w`}
              label="Program Length"
            />
          ) : null}
          {journey.weightChange !== null && weightLabel !== null ? (
            <View testID={`${testID}-stat-weight`} style={{ flex: 1, minWidth: 140 }}>
              <Card style={{ alignItems: "center" }}>
                <Text
                  testID={`${testID}-weight`}
                  className="text-foreground text-2xl font-black text-center"
                  style={WRAPPABLE_TEXT}
                >
                  {weightLabel}
                </Text>
                {weightSub ? (
                  <Text className="text-muted-foreground text-xs mt-0.5 text-center">
                    {weightSub}
                  </Text>
                ) : null}
                <Text className="text-muted-foreground text-xs font-medium uppercase mt-1 text-center">
                  Weight Change
                </Text>
              </Card>
            </View>
          ) : journey.durationWeeks === 0 ? null : (
            <StatCell
              testID={`${testID}-stat-weight`}
              valueTestID={`${testID}-weight`}
              value="—"
              sub="no data"
              label="Weight Change"
            />
          )}
        </View>
      </View>

      {/* Top PRs */}
      {journey.topPRs.length > 0 ? (
        <View testID={`${testID}-prs`} style={{ gap: 8 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Flame size={16} color={colors.accent} strokeWidth={2} />
            <Text className="text-foreground font-bold">Top Personal Records</Text>
          </View>
          {journey.topPRs.map((pr, i) => (
            <TopPRRow
              key={`${pr.name}-${i}`}
              pr={pr}
              rank={i + 1}
              testID={`${testID}-pr-${i}`}
            />
          ))}
        </View>
      ) : null}

      {/* Footer CTAs */}
      <View style={{ gap: 8, paddingTop: 4 }}>
        <Button
          testID={`${testID}-next`}
          size="lg"
          onPress={onFindNext}
          accessibilityHint="Returns to the Workout tab"
          accessibilityLabel="Find My Next Challenge"
        >
          Find My Next Challenge
        </Button>
        <Button
          testID={`${testID}-log`}
          variant="ghost"
          onPress={onViewLog}
          accessibilityHint="Opens the training log"
          accessibilityLabel="View Full Training Log"
        >
          View Full Training Log
        </Button>
      </View>
    </ScrollView>
  );
}

export function ProgramJourneyScreen({
  journey,
  loading,
  error,
  onRetry,
  onFindNext,
  onViewLog,
  testID = "program-journey",
}: {
  journey: ProgramJourneyResponse | null;
  loading: boolean;
  error: unknown;
  onRetry: () => void | Promise<void>;
  testID?: string;
} & ProgramJourneyActions) {
  const { colors } = useThemeTokens();
  return (
    <ScreenState
      testID={`${testID}-state`}
      loading={loading && !journey}
      error={journey ? null : error}
      onRetry={onRetry}
      hasData={journey !== null}
      empty={!loading && !error && journey !== null && journey.totalSessions === 0}
      emptyTitle="No sessions yet"
      emptyMessage="Finish a workout in this program to see your journey recap."
    >
      {journey ? (
        <ProgramJourneyLoaded
          journey={journey}
          onFindNext={onFindNext}
          onViewLog={onViewLog}
          testID={testID}
        />
      ) : (
        <View
          testID={testID}
          style={{ flex: 1, backgroundColor: colors.background }}
        />
      )}
    </ScreenState>
  );
}
