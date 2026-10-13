import { ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Award, Dumbbell, Flame, TrendingUp } from "lucide-react-native";
import { Text } from "@/components/Text";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";
import type { TokenName } from "@/lib/theme/tokens";
import {
  isFloorsExercise,
  normalizeTracking,
  setUnitLabel,
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
// Where this screen stands relative to the web, on the record:
//   1. No divergence left on the metrics: everything this screen says about a
//      set is a function of the exercise's TRACKING TYPE, the same way
//      `webapp/lib/workout/summaryMetrics.ts` says it (Jon's "other metrics …
//      on the summary workout screen" card). Cardio reads its duration,
//      distance and speed instead of `0 × 0`; volume counts LOADED work only;
//      the stat row drops a tile that would read `0` and shows work time and
//      distance in its place; the count tile says Rounds when every exercise
//      worked was timed; and the breakdown draws the circuit / superset
//      blocks the session was actually run in.
//   2. No animation library: the web's framer-motion entrance is plain layout
//      here. Same sections, same order, same words.
//   3. The web's hero swaps its icon by state (Award for a PR day, Dumbbell
//      otherwise) inside an emerald ring — ported below, now that NP-123's
//      token file makes the colour ring-safe for light AND dark. The
//      program-complete hero and its Rocket CTA stay text-only pending a
//      card that actually reports them broken; this one's screenshots are
//      all the non-program "WORKOUT DONE" / "I'll Be Back" state.
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

/** Round to 2dp and drop a trailing `.00` — `2000`, `1.5`, never `1.50`. */
function trimNumber(n: number): string {
  return Number(n.toFixed(2)).toString();
}

export interface WorkoutSummaryExercise {
  name: string;
  trackingType?: string | null;
  /** Group membership, so the breakdown can draw the block it was run in. */
  groupId?: string | null;
  groupType?: string | null;
  groupLabel?: string | null;
  groupRounds?: number | null;
}

/** What a group of this kind goes by on screen. */
const GROUP_KIND_LABELS: Record<string, string> = {
  superset: "Superset",
  circuit: "Circuit",
  triset: "Triset",
  giant_set: "Giant set",
  emom: "EMOM",
  amrap: "AMRAP",
};

/**
 * What to call a group: the coach's own label wins, then the kind. A group
 * with no kind reads "Superset", which is what every other surface assumes.
 */
export function summaryGroupLabel(
  kind?: string | null,
  groupLabel?: string | null,
): string {
  const explicit = (groupLabel ?? "").trim();
  if (explicit) return explicit;
  const k = (kind ?? "").trim().toLowerCase();
  if (!k) return GROUP_KIND_LABELS.superset!;
  const known = GROUP_KIND_LABELS[k];
  if (known) return known;
  const words = k.replace(/_/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export interface WorkoutSummaryGroupMember {
  exercise: WorkoutSummaryExercise;
  /** Index into the flat `exercises` / `setsByExercise` arrays. */
  index: number;
}

export interface WorkoutSummaryGroupBlock {
  groupId: string | null;
  kind: string | null;
  /** null when the exercise ran on its own. */
  label: string | null;
  rounds: number | null;
  members: WorkoutSummaryGroupMember[];
}

/**
 * The session's shape: consecutive exercises sharing a `groupId` collapse into
 * one block, everything else stands alone — the web's `groupExercises`
 * adjacency rule, so the summary draws the circuit the live view ran. A group
 * of one is not a group, so a leftover groupId cannot badge a lone exercise.
 */
export function summaryGroupBlocks(
  exercises: WorkoutSummaryExercise[],
  setsByExercise?: WorkoutSummarySet[][],
): WorkoutSummaryGroupBlock[] {
  const list = exercises ?? [];
  const blocks: WorkoutSummaryGroupBlock[] = [];
  let i = 0;
  while (i < list.length) {
    const head = list[i]!;
    const groupId = (head.groupId ?? "").trim();
    if (!groupId) {
      blocks.push({
        groupId: null,
        kind: null,
        label: null,
        rounds: null,
        members: [{ exercise: head, index: i }],
      });
      i += 1;
      continue;
    }
    const members: WorkoutSummaryGroupMember[] = [];
    while (i < list.length && (list[i]!.groupId ?? "").trim() === groupId) {
      members.push({ exercise: list[i]!, index: i });
      i += 1;
    }
    if (members.length < 2) {
      blocks.push({ groupId: null, kind: null, label: null, rounds: null, members });
      continue;
    }
    const prescribed = Number(head.groupRounds ?? 0);
    const logged = members.reduce(
      (n, m) => Math.max(n, (setsByExercise?.[m.index] ?? []).length),
      0,
    );
    const rounds =
      prescribed > 0 ? Math.floor(prescribed) : logged > 0 ? logged : null;
    blocks.push({
      groupId,
      kind: (head.groupType ?? "").trim() || "superset",
      label: summaryGroupLabel(head.groupType, head.groupLabel),
      rounds,
      members,
    });
  }
  return blocks;
}

/**
 * The token each group kind wears — the nearest native equivalent of the web
 * Track view's `GROUP_STYLES` palette (purple superset, orange circuit,
 * indigo triset, rose giant set, teal EMOM). AMRAP's web amber has no token,
 * so it borrows orange.
 */
const GROUP_KIND_TOKENS: Record<string, TokenName> = {
  superset: "mind-violet",
  circuit: "orange",
  triset: "indigo",
  giant_set: "rose",
  emom: "teal",
  amrap: "orange",
};

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
 * of reps/weight, so they are judged on those. An intervals round — or a
 * `none` exercise, which is never given an input at all — is finished by
 * tapping Done, so for those "completed" is the whole answer. The web says
 * the same (`summaryMetrics.ts#isActiveSummarySet`); native used to judge a
 * `none` exercise on numbers it is never asked for and called every one of
 * them a skip.
 */
export function isActiveSummarySet(
  s: WorkoutSummarySet | null | undefined,
  trackingType?: string | null,
): boolean {
  if (!s?.completed) return false;
  const t = normalizeTracking(trackingType);
  if (t === "intervals" || t === "none") return true;
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
    // Any distance that was logged, whatever the type says it should be: a
    // metre the member covered is not the summary's to withhold because the
    // exercise is filed as `time` rather than `time_distance` (web parity).
    if (m.dist > 0) {
      parts.push(
        isFloorsExercise(exerciseName)
          ? `${trimNumber(m.dist)} floors`
          : `${trimNumber(m.dist)} m`,
      );
    }
    if (s.speed != null && s.speed > 0) {
      parts.push(`${trimNumber(s.speed)} mph`);
    }
    return parts.length > 0 ? parts.join(" · ") : "Done";
  }
  if (m.w > 0) return `${m.w}×${m.r}`;
  if (m.r > 0) return `${m.r} reps`;
  return "Done";
}

export interface WorkoutSummaryTotals {
  /** Every completed set, skips included — what the count tile shows. */
  totalSets: number;
  /** weight × reps over LOADED work only. Cardio adds nothing. */
  totalVolume: number;
  /** Seconds of logged timed work (not wall-clock session time). */
  totalWorkSeconds: number;
  /** Meters logged by distance-tracked work. */
  totalMeters: number;
  /** Floors logged by stair machines, which do not measure meters. */
  totalFloors: number;
  /** Was any load moved? Decides whether a volume tile means anything. */
  hasLoadedWork: boolean;
  /** Was any time logged against an exercise? */
  hasTimedWork: boolean;
  /** "Sets" or "Rounds" — the word for what this session counted. */
  countLabel: string;
}

/**
 * The session's numbers, read PER EXERCISE so each one is measured on what it
 * tracks — `webapp/lib/workout/summaryMetrics.ts#summaryTotals`, verbatim.
 *
 * Sets counts every completed set (skips included). Volume is weight × reps
 * over LOADED work only: a 12-minute walk is not 2160 lbs, and a timed set
 * that happens to carry a stray weight is still not a lift. Time, distance
 * and floors are totalled alongside it so the stat row has something true to
 * say about a session with no barbell in it.
 */
export function summaryTotals(
  exercises: WorkoutSummaryExercise[],
  setsByExercise: WorkoutSummarySet[][],
): WorkoutSummaryTotals {
  let totalSets = 0;
  let totalVolume = 0;
  let totalWorkSeconds = 0;
  let totalMeters = 0;
  let totalFloors = 0;
  let hasLoadedWork = false;
  let hasTimedWork = false;
  let workedExercises = 0;
  let timedWorkedExercises = 0;

  (exercises ?? []).forEach((exercise, exIdx) => {
    const timed = tracksTime(exercise?.trackingType);
    const sets = setsByExercise?.[exIdx] ?? [];
    let didWork = false;
    for (const s of sets) {
      if (!s?.completed) continue;
      totalSets += 1;
      didWork = true;
      const m = measures(s);
      if (!timed && m.w > 0 && m.r > 0) {
        totalVolume += m.w * m.r;
        hasLoadedWork = true;
      }
      if (m.dur > 0) {
        totalWorkSeconds += m.dur;
        hasTimedWork = true;
      }
      if (m.dist > 0) {
        if (isFloorsExercise(exercise?.name)) totalFloors += m.dist;
        else totalMeters += m.dist;
      }
    }
    if (didWork) {
      workedExercises += 1;
      if (timed) timedWorkedExercises += 1;
    }
  });

  // "Rounds" only when EVERY exercise that was worked is timed — a session
  // with one plank in it still counted sets.
  const allTimed =
    workedExercises > 0 && timedWorkedExercises === workedExercises;
  return {
    totalSets,
    totalVolume: Math.round(totalVolume),
    totalWorkSeconds,
    totalMeters,
    totalFloors,
    hasLoadedWork,
    hasTimedWork,
    countLabel: allTimed ? "Rounds" : "Sets",
  };
}

export type SummaryTileKey = "count" | "volume" | "time" | "distance";

export interface SummaryTile {
  key: SummaryTileKey;
  value: string;
  label: string;
}

/** How many metric tiles sit beside the count tile. */
const MAX_METRIC_TILES = 2;

/**
 * The stat tiles this session earned: always the count, then up to two of the
 * metrics it actually produced, in order of how much they say about the work
 * (the web's `summaryMetricTiles`). A cardio-only session gets work time and
 * distance where a lifting session gets volume — before this, every session
 * got a volume tile, so finishing a treadmill walk celebrated `0`.
 */
export function summaryMetricTiles(
  exercises: WorkoutSummaryExercise[],
  setsByExercise: WorkoutSummarySet[][],
): SummaryTile[] {
  const t = summaryTotals(exercises, setsByExercise);
  const metrics: SummaryTile[] = [];
  if (t.hasLoadedWork) {
    metrics.push({
      key: "volume",
      value: t.totalVolume.toLocaleString(),
      label: "Volume lbs",
    });
  }
  if (t.hasTimedWork) {
    metrics.push({
      key: "time",
      value: formatDurationSec(t.totalWorkSeconds),
      label: "Work time",
    });
  }
  if (t.totalMeters > 0) {
    metrics.push({
      key: "distance",
      value: trimNumber(t.totalMeters),
      label: "Distance m",
    });
  } else if (t.totalFloors > 0) {
    metrics.push({
      key: "distance",
      value: trimNumber(t.totalFloors),
      label: "Floors",
    });
  }
  // Nothing measurable at all (an all-`none` session, or everything skipped):
  // keep the volume tile so the row does not collapse to two cards.
  if (metrics.length === 0) {
    metrics.push({
      key: "volume",
      value: t.totalVolume.toLocaleString(),
      label: "Volume lbs",
    });
  }
  return [
    { key: "count", value: String(t.totalSets), label: t.countLabel },
    ...metrics.slice(0, MAX_METRIC_TILES),
  ];
}

/** The colour each stat tile wears — the web's `TILE_TONES`, verbatim. */
const TILE_TONES: Record<SummaryTileKey, string> = {
  count: "text-blue-600 dark:text-blue-400",
  volume: "text-violet-600 dark:text-violet-400",
  time: "text-amber-600 dark:text-amber-400",
  distance: "text-cyan-600 dark:text-cyan-400",
};

/**
 * The testID suffix each tile keeps. `count` stays `sets` and `volume` stays
 * `volume` because screens and tests have addressed them by those names since
 * NP-086; the work-time tile cannot be `time`, which the Duration tile owns.
 */
const TILE_TEST_IDS: Record<SummaryTileKey, string> = {
  count: "sets",
  volume: "volume",
  time: "work-time",
  distance: "distance",
};

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
  const { colors, tint, isDark } = useThemeTokens();
  const newPRs = computeSummaryPRs(exercises, setsByExercise, exerciseHistory);
  // Duration is always first (wall-clock, nothing to do with tracking type);
  // the rest are whatever this session measured. The count tile keeps the
  // `-sets` testID whether it reads Sets or Rounds — it is the same tile.
  const statTiles = [
    {
      key: "duration",
      testId: "time",
      tone: "text-emerald-600 dark:text-emerald-400",
      value: formatSummaryTime(elapsedSeconds),
      label: "Duration",
    },
    ...summaryMetricTiles(exercises, setsByExercise).map((t) => ({
      key: t.key,
      testId: TILE_TEST_IDS[t.key],
      tone: TILE_TONES[t.key],
      value: t.value,
      label: t.label,
    })),
  ];
  const closing =
    (goal && GOAL_CLOSINGS[goal]) || GOAL_CLOSINGS.general_health!;
  const streakProgress =
    streak?.nextMilestone && streak.nextMilestone > 0
      ? Math.min((streak.streakDays / streak.nextMilestone) * 100, 100)
      : 0;
  const groupBlocks = summaryGroupBlocks(exercises, setsByExercise);

  // One exercise's card. Shared by the group blocks and the standalone
  // exercises, so a circuit member reads exactly like a lone exercise — just
  // inside the block that says it was a circuit.
  const renderExerciseCard = (
    exercise: WorkoutSummaryExercise,
    exIdx: number,
  ) => {
    const sets = setsByExercise[exIdx] ?? [];
    const active = sets.filter((s) =>
      isActiveSummarySet(s, exercise.trackingType),
    );
    const skipped = sets.filter((s) => s?.completed).length - active.length;
    const isPR = newPRs.some((pr) => pr.name === exercise.name);
    const noun = setUnitLabel(exercise.trackingType, sets.length).toLowerCase();
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
                <Text testID={`${testID}-exercise-${exIdx}-pr`}>🏆 PR</Text>
              ) : null}
            </View>
            <Text className="text-muted-foreground text-xs">
              {active.length}/{sets.length} {noun}
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
                  {/* `text-foreground` — the web's chip is
                      `bg-zinc-100 text-zinc-700 dark:bg-zinc-800
                      dark:text-zinc-300`; no text colour here (before this
                      fix) meant RN's default ink on `colors.muted`, unreadable
                      in dark mode (NP-334). */}
                  <Text className="text-foreground text-xs">
                    {formatSummarySet(s, exercise.trackingType, exercise.name)}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}
        </Card>
      </View>
    );
  };

  return (
    <SafeAreaView
      edges={["top", "bottom"]}
      style={{ flex: 1 }}
      testID={testID}
    >
      <ScrollView contentContainerStyle={{ padding: 20, gap: 16 }}>
        {/* Hero header — the ring (or trophy, program-complete) comes
            FIRST, the title under it: the web's order
            (`motion.div` ring → `h1` → subtitle). Native used to draw the
            title text above the ring instead. */}
        <View style={{ alignItems: "center", paddingTop: 12 }}>
          {programCompleted ? (
            <>
              <Text
                testID={`${testID}-title`}
                className="text-foreground text-3xl font-black text-center"
              >
                PROGRAM COMPLETE
              </Text>
              <Text
                testID={`${testID}-program-name`}
                className="text-muted-foreground text-sm mt-2 text-center"
              >
                {completedProgramName
                  ? `You finished every workout of ${completedProgramName}. That's elite.`
                  : "You finished every single workout. That's elite."}
              </Text>
            </>
          ) : (
            <View style={{ alignItems: "center" }}>
              {/* Hero ring — the web's emerald circle behind Award (a PR
                  day) or Dumbbell (otherwise), bg-emerald-500/15 (20% in
                  dark) with a 30%-alpha ring in both modes. */}
              <View
                testID={`${testID}-hero-icon`}
                style={{
                  width: 96,
                  height: 96,
                  borderRadius: 48,
                  alignItems: "center",
                  justifyContent: "center",
                  marginBottom: 16,
                  backgroundColor: tint("success", isDark ? 0.2 : 0.15),
                  borderWidth: 4,
                  borderColor: tint("success", 0.3),
                }}
              >
                {newPRs.length > 0 ? (
                  <Award color={colors.success} size={48} strokeWidth={1.5} />
                ) : (
                  <Dumbbell
                    color={colors.success}
                    size={48}
                    strokeWidth={1.5}
                  />
                )}
              </View>
              <Text
                testID={`${testID}-title`}
                className="text-foreground text-3xl font-black text-center"
              >
                {newPRs.length > 0 ? "YOU CRUSHED IT" : "WORKOUT DONE"}
              </Text>
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

        {/* Stats row — Duration, then the metrics this session actually
            produced (summaryMetricTiles). Four tiles wrap two-up, which is
            what the web's `grid-cols-2` does at the same count. */}
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {statTiles.map((tile) => (
            <View
              key={tile.key}
              style={{
                flexGrow: 1,
                flexBasis: statTiles.length > 3 ? "45%" : 0,
              }}
            >
              <Card
                testID={`${testID}-stat-${tile.testId}`}
                style={{ alignItems: "center" }}
              >
                <Text
                  testID={`${testID}-${tile.testId}`}
                  className={`${tile.tone} text-2xl font-bold`}
                >
                  {tile.value}
                </Text>
                <Text className="text-muted-foreground text-xs uppercase mt-1">
                  {tile.label}
                </Text>
              </Card>
            </View>
          ))}
        </View>

        {/* Streak card */}
        {streak !== null ? (
          <Card testID={`${testID}-streak`}>
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
            >
              {/* Orange, like the web's flat `text-orange-500` — never
                  `primary` (brand red), which is what native drew before. */}
              <Flame
                color={colors.orange}
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
                  {/* The web's `bg-gradient-to-r from-orange-500
                      to-amber-400` — a solid fill (`primary`, brand red) is
                      what native drew before. */}
                  <LinearGradient
                    testID={`${testID}-streak-progress`}
                    colors={[colors.orange, colors.amber]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={{
                      height: "100%",
                      width: `${streakProgress}%`,
                      borderRadius: 999,
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
          {groupBlocks.map((block, blockIdx) => {
            const cards = block.members.map(({ exercise, index }) =>
              renderExerciseCard(exercise, index),
            );
            if (!block.label) {
              return <View key={`solo-${blockIdx}`}>{cards}</View>;
            }
            const token = GROUP_KIND_TOKENS[block.kind ?? "superset"] ?? "mind-violet";
            return (
              <View
                key={`group-${blockIdx}`}
                testID={`${testID}-group-${blockIdx}`}
                style={{
                  borderWidth: 1,
                  borderColor: tint(token, 0.4),
                  backgroundColor: tint(token, isDark ? 0.12 : 0.08),
                  borderRadius: 12,
                  padding: 8,
                  marginBottom: 8,
                }}
              >
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 6,
                    marginBottom: 6,
                    flexWrap: "wrap",
                  }}
                >
                  <View
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: 5,
                      backgroundColor: colors[token],
                    }}
                  />
                  <Text
                    testID={`${testID}-group-${blockIdx}-label`}
                    className="text-foreground text-xs font-bold uppercase"
                  >
                    {block.label}
                  </Text>
                  <Text
                    testID={`${testID}-group-${blockIdx}-meta`}
                    className="text-muted-foreground text-xs"
                  >
                    {block.rounds
                      ? `${block.rounds} ${block.rounds === 1 ? "round" : "rounds"} · ${block.members.length} exercises`
                      : `${block.members.length} exercises`}
                  </Text>
                </View>
                {cards}
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
            // The web's non-program done button is foreground-on-background
            // (`bg-zinc-900 dark:bg-white`), never the brand red — `primary`
            // is reserved for destructive-adjacent actions (Button.tsx).
            variant={programCompleted ? "primary" : "inverted"}
            onPress={onDone}
            accessibilityHint="Returns to the Workout tab"
            icon={
              programCompleted ? undefined : (
                <Dumbbell color={colors.background} size={20} />
              )
            }
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
              icon={<TrendingUp color={colors.foreground} size={16} />}
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
