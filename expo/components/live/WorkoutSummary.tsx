import { ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Flame } from "lucide-react-native";
import { Text } from "@/components/Text";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";
import {
  isFloorsExercise,
  normalizeTracking,
  tracksTime,
} from "@become/core";

// ─── WorkoutSummary ─────────────────────────────────────────────────────────
// Native port of `webapp/components/WorkoutSummary.tsx` (NP-086).
//
// The web's summary is the source of truth for what finishing celebrates:
// elapsed time, sets and volume; "YOU CRUSHED IT" with PRs beaten against the
// PREVIOUS session (`exerciseHistory` — never the server's all-time
// `newPRsAchieved`, which no web screen reads); each exercise's best set with
// PR badges; a streak card with progress to the next milestone
// (`GET /api/streak?tz`); a closing line for the member's goal
// (`GET /api/profile`); and the program-complete state on the last workout of
// a program, with a link to the journey recap. Done returns to the Workout tab.
//
// Two deliberate divergences from the web, both on the record:
//   1. Cardio shows its tracked metrics by tracking type (duration, distance,
//      speed) instead of `0 × 0`. The web's summary computes volume as weight
//      × reps even for timed work — Jon's open card asks the web to fix that,
//      so volume here counts loaded work only (timed sets carry no
//      weight/reps on the wire) and each timed set renders its duration and
//      distance. Strength numbers match the web's exactly.
//   2. No animation library: the web's framer-motion entrance is plain layout
//      here. Same sections, same order, same words.
//   3. The web's hero swaps its icon by state (Award for a PR day, Dumbbell
//      otherwise, Rocket on the program-complete CTA, TrendingUp on the log
//      link). This port keeps the words and leaves the iconography to the
//      streak Flame until NP-123 signs off on hero art.
// ────────────────────────────────────────────────────────────────────────────

export const WORKOUT_QUOTES = [
  "Every rep is a vote for the person you want to become.",
  "You didn't come this far to only come this far.",
  "The pain you feel today is the strength you feel tomorrow.",
  "Discipline is choosing what you want most over what you want now.",
  "Champions aren't made in gyms. They're made from what they have deep inside.",
  "Small daily improvements are the key to staggering long-term results.",
  "You showed up. That's the hardest part.",
  "Consistency beats intensity every single time.",
  "Become who you were meant to be — one session at a time.",
  "The body achieves what the mind believes.",
  "Results happen over time, not overnight. Work hard, stay consistent, be patient.",
  "Be stronger than your strongest excuse.",
];

export const GOAL_CLOSINGS: Record<string, string> = {
  lose_weight:
    "Every session is burning closer to the best version of you. Keep showing up.",
  gain_muscle:
    "Those micro-tears are building something greater. Recover hard, come back stronger.",
  maintain:
    "Consistency is its own kind of strength. You showed up — that's the whole game.",
  improve_performance:
    "Another session logged. Another step toward elite. The work is compounding.",
  general_health:
    "Your future self is grateful you did this today. Keep stacking those wins.",
};

export function getDayOfYear(date = new Date()): number {
  return Math.floor(
    (date.getTime() - new Date(date.getFullYear(), 0, 0).getTime()) / 86400000,
  );
}

/**
 * Human words for a server PR dimension id. The live route used to render
 * `dimensions` verbatim ("maxWeight, maxE1RM"); a dimension id is never
 * member-facing copy. Unknown ids are humanized (underscores to spaces,
 * camelCase split) so a fourth dimension degrades to plain words, never an id.
 */
const PR_DIMENSION_LABELS: Record<string, string> = {
  maxWeight: "Heaviest lift",
  maxReps: "Most reps",
  maxE1RM: "Best estimated 1RM",
};

export function prDimensionLabel(dimension: string): string {
  const known = PR_DIMENSION_LABELS[dimension];
  if (known) return known;
  const words = dimension
    .replace(/_/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** The web's `formatTime`: minutes without padding, seconds with. */
export function formatSummaryTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** A timed set's duration: seconds under a minute, m:ss above. */
export function formatDurationSec(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export interface WorkoutSummaryExercise {
  name: string;
  trackingType?: string | null;
}

export interface WorkoutSummarySet {
  reps: number | null;
  weight: number | null;
  completed: boolean;
  /** Seconds — for time / time_distance / intervals tracking types. */
  durationSec?: number | null;
  /** Meters (or floors) — for time_distance. */
  distance?: number | null;
  /** mph — rendered when present; native does not capture it yet (NP-080). */
  speed?: number | null;
}

export interface WorkoutSummaryHistoryEntry {
  weight: number;
  reps: number;
  duration?: number | null;
  date: string;
}

function measures(s: WorkoutSummarySet): {
  w: number;
  r: number;
  dur: number;
  dist: number;
} {
  return {
    w: s.weight ?? 0,
    r: s.reps ?? 0,
    dur: s.durationSec ?? 0,
    dist: s.distance ?? 0,
  };
}

/**
 * Whether a completed set counts as work. The web drops sets logged `0 × 0`
 * (its skip marker); timed sets carry their work in duration/distance instead
 * of reps/weight, so they are judged on those. An intervals set tapped Done
 * with nothing typed is a completed round, not a skip — the web never asks an
 * intervals exercise for input either.
 */
export function isActiveSummarySet(
  s: WorkoutSummarySet | null | undefined,
  trackingType?: string | null,
): boolean {
  if (!s?.completed) return false;
  if (normalizeTracking(trackingType) === "intervals") return true;
  const m = measures(s);
  return m.w > 0 || m.r > 0 || m.dur > 0 || m.dist > 0;
}

/**
 * One set's chip label, by tracking type. Strength reads like the web
 * (`135×5`, `12 reps`); timed work reads its duration and distance
 * (`10:00 · 2000 m`, `45s`) — never `0 × 0`.
 */
export function formatSummarySet(
  s: WorkoutSummarySet,
  trackingType?: string | null,
  exerciseName?: string,
): string {
  const t = normalizeTracking(trackingType);
  const m = measures(s);
  if (tracksTime(t)) {
    const parts: string[] = [];
    if (m.dur > 0) parts.push(formatDurationSec(m.dur));
    if (t === "time_distance" && m.dist > 0) {
      parts.push(
        isFloorsExercise(exerciseName) ? `${m.dist} floors` : `${m.dist} m`,
      );
    }
    if (s.speed != null && s.speed > 0) parts.push(`${s.speed} mph`);
    return parts.length > 0 ? parts.join(" · ") : "Done";
  }
  if (m.w > 0) return `${m.w}×${m.r}`;
  if (m.r > 0) return `${m.r} reps`;
  return "Done";
}

/**
 * Time, sets and volume — the web's summary math, verbatim: sets counts every
 * completed set (skips included), volume is weight × reps over completed sets.
 * Timed sets carry no weight/reps on the wire, so they count sets but add no
 * volume — the web's duration-×-distance volume for cardio is the bug Jon's
 * card has open, not the behaviour to copy.
 */
export function summaryTotals(setsByExercise: WorkoutSummarySet[][]): {
  totalSets: number;
  totalVolume: number;
} {
  let totalSets = 0;
  let totalVolume = 0;
  for (const sets of setsByExercise ?? []) {
    for (const s of sets ?? []) {
      if (!s?.completed) continue;
      totalSets += 1;
      totalVolume += (s.weight ?? 0) * (s.reps ?? 0);
    }
  }
  return { totalSets, totalVolume: Math.round(totalVolume) };
}

export interface SummaryPR {
  name: string;
  bestLabel: string;
  prevLabel: string;
}

/**
 * New records, the web's rule: each exercise's best set of the session beaten
 * against the previous session (`exerciseHistory`), keyed by exercise NAME.
 * Strength compares weight then reps; timed work compares duration (the
 * previous session's distance is not stored, so there is nothing to beat it
 * against). No history, or no completed work, is never a record.
 */
export function computeSummaryPRs(
  exercises: WorkoutSummaryExercise[],
  setsByExercise: WorkoutSummarySet[][],
  exerciseHistory: Record<string, WorkoutSummaryHistoryEntry>,
): SummaryPR[] {
  const out: SummaryPR[] = [];
  exercises.forEach((exercise, exIdx) => {
    const sets = setsByExercise[exIdx] ?? [];
    const active = sets.filter((s) => isActiveSummarySet(s, exercise.trackingType));
    const history = exerciseHistory[exercise.name];
    if (!history || active.length === 0) return;
    const first = active[0];
    if (!first) return;

    if (tracksTime(exercise.trackingType)) {
      let best = first;
      for (const s of active) {
        const b = measures(best);
        const c = measures(s);
        if (c.dur > b.dur || (c.dur === b.dur && c.dist > b.dist)) best = s;
      }
      const prevDur = history.duration ?? 0;
      if (measures(best).dur > prevDur) {
        out.push({
          name: exercise.name,
          bestLabel: formatSummarySet(best, exercise.trackingType, exercise.name),
          prevLabel: prevDur > 0 ? formatDurationSec(prevDur) : "—",
        });
      }
      return;
    }

    let best = first;
    for (const s of active) {
      const b = measures(best);
      const c = measures(s);
      if (c.w > b.w || (c.w === b.w && c.r > b.r)) best = s;
    }
    const bw = measures(best);
    if (bw.w > history.weight || (bw.w === history.weight && bw.r > history.reps)) {
      out.push({
        name: exercise.name,
        bestLabel:
          bw.w > 0 ? `${bw.w} × ${bw.r}` : `${bw.r} reps`,
        prevLabel:
          history.weight > 0
            ? `${history.weight} × ${history.reps}`
            : `${history.reps} reps`,
      });
    }
  });
  return out;
}

export interface WorkoutSummaryStreak {
  streakDays: number;
  nextMilestone: number | null;
}

export interface WorkoutSummaryProps {
  programCompleted: boolean;
  completedProgramName: string;
  programId: string;
  workoutDay: string;
  workoutTitle: string;
  /** Wall-clock seconds at finish — frozen, like the web's stopped timer. */
  elapsedSeconds: number;
  exercises: WorkoutSummaryExercise[];
  /** Aligned with `exercises`: the finished grid's sets per exercise. */
  setsByExercise: WorkoutSummarySet[][];
  exerciseHistory: Record<string, WorkoutSummaryHistoryEntry>;
  streak: WorkoutSummaryStreak | null;
  goal: string | null;
  onDone: () => void;
  /** Program-complete secondary: the journey recap (nearest native screen). */
  onViewJourney: () => void;
  /** Training-log secondary. */
  onViewLog: () => void;
  testID?: string;
}

export function WorkoutSummary({
  programCompleted,
  completedProgramName,
  workoutDay,
  workoutTitle,
  elapsedSeconds,
  exercises,
  setsByExercise,
  exerciseHistory,
  streak,
  goal,
  onDone,
  onViewJourney,
  onViewLog,
  testID = "workout-summary",
}: WorkoutSummaryProps) {
  const quote = WORKOUT_QUOTES[getDayOfYear() % WORKOUT_QUOTES.length];
  const { colors } = useThemeTokens();
  const { totalSets, totalVolume } = summaryTotals(setsByExercise);
  const newPRs = computeSummaryPRs(exercises, setsByExercise, exerciseHistory);
  const closing =
    (goal && GOAL_CLOSINGS[goal]) || GOAL_CLOSINGS.general_health!;
  const streakProgress =
    streak?.nextMilestone && streak.nextMilestone > 0
      ? Math.min((streak.streakDays / streak.nextMilestone) * 100, 100)
      : 0;

  return (
    <SafeAreaView
      edges={["top", "bottom"]}
      style={{ flex: 1 }}
      testID={testID}
    >
      <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }}>
        {/* Hero header */}
        <View style={{ alignItems: "center", paddingTop: 12 }}>
          <Text
            testID={`${testID}-title`}
            className="text-foreground text-3xl font-black text-center"
          >
            {programCompleted
              ? "PROGRAM COMPLETE"
              : newPRs.length > 0
                ? "YOU CRUSHED IT"
                : "WORKOUT DONE"}
          </Text>
          {programCompleted ? (
            <Text
              testID={`${testID}-program-name`}
              className="text-muted-foreground text-sm mt-2 text-center"
            >
              {completedProgramName
                ? `You finished every workout of ${completedProgramName}. That's elite.`
                : "You finished every single workout. That's elite."}
            </Text>
          ) : (
            <View style={{ alignItems: "center" }}>
              <Text className="text-muted-foreground text-sm mt-2 text-center">
                {workoutDay} — {workoutTitle}
              </Text>
              {newPRs.length > 0 ? (
                <Text
                  testID={`${testID}-pr-count`}
                  className="text-foreground text-sm font-semibold mt-2"
                >
                  🏆 {newPRs.length} new personal record
                  {newPRs.length > 1 ? "s" : ""} today
                </Text>
              ) : null}
            </View>
          )}
          <Text className="text-muted-foreground text-sm italic mt-4 px-4 text-center">
            &ldquo;{quote}&rdquo;
          </Text>
        </View>

        {/* Stats row */}
        <View style={{ flexDirection: "row", gap: 8 }}>
          <View style={{ flex: 1 }}>
            <Card testID={`${testID}-stat-time`} style={{ alignItems: "center" }}>
              <Text
                testID={`${testID}-time`}
                className="text-foreground text-2xl font-bold"
              >
                {formatSummaryTime(elapsedSeconds)}
              </Text>
              <Text className="text-muted-foreground text-xs uppercase mt-1">
                Duration
              </Text>
            </Card>
          </View>
          <View style={{ flex: 1 }}>
            <Card testID={`${testID}-stat-sets`} style={{ alignItems: "center" }}>
              <Text
                testID={`${testID}-sets`}
                className="text-foreground text-2xl font-bold"
              >
                {totalSets}
              </Text>
              <Text className="text-muted-foreground text-xs uppercase mt-1">
                Sets
              </Text>
            </Card>
          </View>
          <View style={{ flex: 1 }}>
            <Card testID={`${testID}-stat-volume`} style={{ alignItems: "center" }}>
              <Text
                testID={`${testID}-volume`}
                className="text-foreground text-2xl font-bold"
              >
                {totalVolume.toLocaleString()}
              </Text>
              <Text className="text-muted-foreground text-xs uppercase mt-1">
                Volume lbs
              </Text>
            </Card>
          </View>
        </View>

        {/* Streak card */}
        {streak !== null ? (
          <Card testID={`${testID}-streak`}>
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
            >
              <Flame
                color={colors.primary}
                size={28}
                strokeWidth={1.5}
              />
              <View style={{ flex: 1 }}>
                <Text
                  testID={`${testID}-streak-days`}
                  className="text-foreground text-lg font-bold"
                >
                  {streak.streakDays} day streak
                </Text>
                <Text className="text-muted-foreground text-xs">
                  {streak.streakDays === 1
                    ? "The streak starts here. Don't break it."
                    : streak.streakDays < 7
                      ? "Building momentum. Keep it going."
                      : streak.streakDays < 30
                        ? "You're on fire. Stay consistent."
                        : "Elite consistency. Legendary work."}
                </Text>
              </View>
            </View>
            {streak.nextMilestone ? (
              <View style={{ marginTop: 12 }}>
                <View
                  style={{
                    height: 8,
                    borderRadius: 999,
                    overflow: "hidden",
                    backgroundColor: colors.muted,
                  }}
                >
                  <View
                    testID={`${testID}-streak-progress`}
                    style={{
                      height: "100%",
                      width: `${streakProgress}%`,
                      borderRadius: 999,
                      backgroundColor: colors.primary,
                    }}
                  />
                </View>
                <Text
                  testID={`${testID}-streak-milestone`}
                  className="text-muted-foreground text-xs mt-1.5"
                >
                  {streak.streakDays} / {streak.nextMilestone} days to next
                  milestone
                </Text>
              </View>
            ) : null}
          </Card>
        ) : null}

        {/* PR highlights */}
        {newPRs.length > 0 ? (
          <Card testID={`${testID}-prs`}>
            <Text className="text-foreground text-xs font-bold uppercase mb-3">
              🏆 New Personal Records
            </Text>
            {newPRs.map((pr) => (
              <View
                key={pr.name}
                testID={`${testID}-pr-${pr.name}`}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginBottom: 8,
                }}
              >
                <Text className="text-foreground text-sm font-semibold">
                  {pr.name}
                </Text>
                <View style={{ alignItems: "flex-end" }}>
                  <Text className="text-foreground text-sm font-bold">
                    {pr.bestLabel}
                  </Text>
                  <Text className="text-muted-foreground text-xs">
                    prev {pr.prevLabel}
                  </Text>
                </View>
              </View>
            ))}
          </Card>
        ) : null}

        {/* Exercise breakdown */}
        <View>
          <Text className="text-muted-foreground text-xs font-bold uppercase mb-2">
            Exercise Breakdown
          </Text>
          {exercises.map((exercise, exIdx) => {
            const sets = setsByExercise[exIdx] ?? [];
            const active = sets.filter((s) =>
              isActiveSummarySet(s, exercise.trackingType),
            );
            const skipped =
              sets.filter((s) => s?.completed).length - active.length;
            const isPR = newPRs.some((pr) => pr.name === exercise.name);
            return (
              <View key={`${exercise.name}-${exIdx}`} style={{ marginBottom: 8 }}>
                <Card testID={`${testID}-exercise-${exIdx}`}>
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "space-between",
                      marginBottom: 6,
                    }}
                  >
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 6,
                        flex: 1,
                      }}
                    >
                      <Text className="text-foreground text-sm font-semibold">
                        {exercise.name}
                      </Text>
                      {isPR ? (
                        <Text testID={`${testID}-exercise-${exIdx}-pr`}>
                          🏆 PR
                        </Text>
                      ) : null}
                    </View>
                    <Text className="text-muted-foreground text-xs">
                      {active.length}/{sets.length} sets
                      {skipped > 0 ? ` (${skipped} skipped)` : ""}
                    </Text>
                  </View>
                  {active.length > 0 ? (
                    <View
                      style={{
                        flexDirection: "row",
                        flexWrap: "wrap",
                        gap: 6,
                      }}
                    >
                      {active.map((s, i) => (
                        <View
                          key={i}
                          testID={`${testID}-exercise-${exIdx}-set-${i}`}
                          style={{
                            borderRadius: 999,
                            paddingHorizontal: 10,
                            paddingVertical: 4,
                            backgroundColor: colors.muted,
                          }}
                        >
                          <Text className="text-xs">
                            {formatSummarySet(
                              s,
                              exercise.trackingType,
                              exercise.name,
                            )}
                          </Text>
                        </View>
                      ))}
                    </View>
                  ) : null}
                </Card>
              </View>
            );
          })}
        </View>

        {/* Closing message */}
        <Card testID={`${testID}-closing`} style={{ alignItems: "center" }}>
          <Text className="text-muted-foreground text-sm text-center">
            {closing}
          </Text>
        </Card>

        {/* CTA */}
        <View style={{ gap: 8, paddingTop: 4 }}>
          <Button
            testID={`${testID}-done`}
            size="lg"
            onPress={onDone}
            accessibilityHint="Returns to the Workout tab"
          >
            {programCompleted ? "Find My Next Challenge" : "I'll Be Back"}
          </Button>
          {programCompleted ? (
            <Button
              testID={`${testID}-secondary`}
              variant="ghost"
              onPress={onViewJourney}
            >
              See Your Full Journey
            </Button>
          ) : (
            <Button
              testID={`${testID}-secondary`}
              variant="ghost"
              onPress={onViewLog}
            >
              View Training Log
            </Button>
          )}
        </View>
        <View style={{ height: 8 }} />
      </ScrollView>
    </SafeAreaView>
  );
}
