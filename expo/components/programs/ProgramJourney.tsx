import { Pressable, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import {
  Trophy,
  Flame,
  TrendingUp,
  TrendingDown,
  Minus,
  ChevronLeft,
  Dumbbell,
  Calendar,
} from "lucide-react-native";
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
// (NP-167). NP-286 is the full-pass visual-parity pass the first port
// skipped: a header (back arrow, "Your Journey", program name — the web's
// `<h1>` + sub-line, which native had folded the name into the hero and had
// no back arrow or "Your Journey" title at all), the hero's gold treatment,
// coloured stat values, amber PR weights and an icon on each footer button.
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
//   2. The web's hero and stat cards use FIXED dark classes (`text-yellow-400`,
//      `text-emerald-400`, `bg-zinc-900`, no `dark:` variant anywhere on this
//      page) — so the web page itself only reads correctly in dark mode. Here
//      every colour is a semantic token class (`text-accent`, `text-success`,
//      `text-info`, `text-mind-violet`) or comes from `useThemeTokens()`
//      (NP-123), which carries the SAME gold/green/blue/violet/amber
//      treatment into light mode too, rather than copying the web's
//      dark-only literals verbatim.
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

type WeightTone = "muted" | "success" | "accent";

/**
 * The web's weight-change colour rule: `text-zinc-400` with no change,
 * `emerald-400` down, `amber-400` up — mapped onto tokens here (`success` /
 * `accent`) so light mode gets a correct value too, instead of the web's
 * dark-only literal pair.
 */
function weightTone(change: ProgramJourneyWeightChange | null): WeightTone {
  if (!change || change.change === 0) return "muted";
  return change.change < 0 ? "success" : "accent";
}

/** The weight-change VALUE's className for a given tone — text and glyph agree. */
export function journeyWeightToneClass(change: ProgramJourneyWeightChange | null): string {
  const tone = weightTone(change);
  return tone === "muted"
    ? "text-muted-foreground"
    : tone === "success"
      ? "text-success"
      : "text-accent";
}

export interface ProgramJourneyProps {
  journey: ProgramJourneyResponse;
  /** Header back arrow — the web's `<ArrowLeft>` button back to the Workout tab. */
  onBack: () => void;
  /** "Find My Next Challenge" — back to the Workout tab. */
  onFindNext: () => void;
  /** "View Full Training Log" — the native Training Log. */
  onViewLog: () => void;
  testID?: string;
}

function WeightGlyph({ change }: { change: ProgramJourneyWeightChange | null }) {
  const { colors } = useThemeTokens();
  const tone = weightTone(change);
  const glyphColor =
    tone === "muted"
      ? colors["muted-foreground"]
      : tone === "success"
        ? colors.success
        : colors.accent;
  const Glyph = tone === "muted" ? Minus : tone === "success" ? TrendingDown : TrendingUp;
  return <Glyph size={20} color={glyphColor} />;
}

export function ProgramJourney({
  journey,
  onBack,
  onFindNext,
  onViewLog,
  testID = JOURNEY_TEST_ID,
}: ProgramJourneyProps) {
  const { colors, tint } = useThemeTokens();
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
        {/* Header — the web's back arrow, "Your Journey" title and program
            name sub-line. Previously missing entirely; the program name sat
            in the hero instead (it still does, below, matching the web). */}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <Pressable
            testID={`${testID}-back`}
            accessibilityRole="button"
            accessibilityLabel="Back"
            onPress={onBack}
            style={{
              width: 36,
              height: 36,
              borderRadius: 10,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: colors.card,
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            <ChevronLeft size={18} color={colors.foreground} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text
              testID={`${testID}-header-title`}
              className="text-foreground text-xl font-black"
            >
              Your Journey
            </Text>
            <Text
              testID={`${testID}-header-program`}
              className="text-muted-foreground text-sm"
            >
              {journey.programName}
            </Text>
          </View>
        </View>

        {/* Hero banner — the web's amber/gold-tinted card with a gold ring
            around the trophy and a gold "PROGRAM COMPLETE"
            (`from-yellow-500/20 to-amber-600/10`, `ring-yellow-500/30`,
            `text-yellow-400`), carried over via the `accent` token. */}
        <View testID={`${testID}-hero`} style={{ borderRadius: 16, overflow: "hidden" }}>
          <LinearGradient
            colors={[tint("accent", 0.2), tint("accent", 0.08)]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={{
              borderRadius: 16,
              borderWidth: 1,
              borderColor: tint("accent", 0.3),
              paddingVertical: 20,
              paddingHorizontal: 16,
              alignItems: "center",
            }}
          >
            <View
              style={{
                width: 64,
                height: 64,
                borderRadius: 32,
                backgroundColor: tint("accent", 0.2),
                borderWidth: 4,
                borderColor: tint("accent", 0.3),
                alignItems: "center",
                justifyContent: "center",
                marginBottom: 12,
              }}
            >
              <Trophy size={32} color={colors.accent} strokeWidth={1.5} />
            </View>
            <Text
              testID={`${testID}-title`}
              className="text-accent text-2xl font-black text-center"
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
          </LinearGradient>
        </View>

        {/* Key stats grid — coloured like the web's: green sessions, blue
            volume, violet length, success/amber weight change (never
            neutral `text-foreground`). */}
        <View style={{ flexDirection: "row", gap: 8 }}>
          <View style={{ flex: 1 }}>
            <Card testID={`${testID}-stat-sessions`} style={{ alignItems: "center" }}>
              <Text
                testID={`${testID}-sessions`}
                className="text-success text-2xl font-black text-center"
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
                className="text-info text-2xl font-black text-center"
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
                  className="text-mind-violet text-2xl font-black text-center"
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
                    className={`${journeyWeightToneClass(journey.weightChange)} text-2xl font-black`}
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

        {/* Top PRs — the web's amber PR weights, never neutral. */}
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
                      className="text-accent text-sm font-black"
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

        {/* Footer CTAs — the web's Dumbbell on "Find My Next Challenge" and
            Calendar on "View Full Training Log" (previously no icons). */}
        <View style={{ gap: 8, paddingTop: 4 }}>
          <Button
            testID={`${testID}-next`}
            size="lg"
            onPress={onFindNext}
            accessibilityHint="Returns to the Workout tab"
            icon={<Dumbbell size={18} color={colors["primary-foreground"]} />}
          >
            Find My Next Challenge
          </Button>
          <Button
            testID={`${testID}-log`}
            variant="ghost"
            onPress={onViewLog}
            accessibilityHint="Opens the training log"
            icon={<Calendar size={16} color={colors.foreground} />}
          >
            View Full Training Log
          </Button>
        </View>
        <View style={{ height: 8 }} />
      </ScrollView>
    </SafeAreaView>
  );
}
