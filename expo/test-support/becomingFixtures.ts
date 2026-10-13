import type { JourneyPayload, WeekSnapshot } from "@/lib/becoming/types";

/**
 * A YEAR OF WEEKS, deterministically — the fixture the stage tests share.
 *
 * Fifty-two Sunday-keyed weeks (plus a Horizon once laid out) with the path
 * shape `webapp/lib/becoming/weeks.ts` produces: a `start`, then climbs,
 * holds and dips that never fall more than 1.5 below the best, scores and
 * subjects that rotate, two collapsed gaps, a live final week. Nothing random:
 * `Math.random` in a test is how the NP-213 flake happened.
 */

const STEP_UP = 1;
const STEP_FLAT = 0.25;
const STEP_DOWN = -0.5;
const FLOOR_BELOW_PEAK = 1.5;

const PATTERN: ("up" | "flat" | "down")[] = ["up", "up", "flat", "down", "up", "flat", "up", "down", "down", "up", "flat", "up", "up"];
const SUBJECTS: WeekSnapshot["subject"][] = ["training", "fuel", "mind", "all", "training", "empty"];

function shiftDays(key: string, days: number): string {
  const [y, m, d] = key.split("-").map(Number);
  const dt = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, (d ?? 1) + days));
  return dt.toISOString().slice(0, 10);
}

function labelFor(weekKey: string): string {
  const [y, m, d] = weekKey.split("-").map(Number);
  const start = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1));
  const end = new Date(start.getTime() + 6 * 86_400_000);
  const mo = (dt: Date) => dt.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" });
  return start.getUTCMonth() === end.getUTCMonth()
    ? `${mo(start)} ${start.getUTCDate()}–${end.getUTCDate()}`
    : `${mo(start)} ${start.getUTCDate()} – ${mo(end)} ${end.getUTCDate()}`;
}

export function yearOfWeeks(count = 52, firstSunday = "2025-10-05"): WeekSnapshot[] {
  const out: WeekSnapshot[] = [];
  let altitude = 0;
  let peak = 0;
  let lastStep: WeekSnapshot["step"] = "start";
  for (let i = 0; i < count; i++) {
    const isCurrent = i === count - 1;
    const isFirst = i === 0;
    let step: WeekSnapshot["step"] = isFirst ? "start" : PATTERN[(i - 1) % PATTERN.length]!;
    if (i > 0 && !isCurrent) {
      const delta = step === "up" ? STEP_UP : step === "flat" ? STEP_FLAT : STEP_DOWN;
      const floor = Math.max(0, peak - FLOOR_BELOW_PEAK);
      const effective = step === "down" && lastStep === "down" ? 0 : delta;
      const next = Math.max(floor, altitude + effective);
      if (step === "down" && next >= altitude) step = "flat";
      altitude = next;
      peak = Math.max(peak, altitude);
      lastStep = step;
    }
    const weekKey = shiftDays(firstSunday, i * 7);
    const score = step === "up" ? 72 + (i % 5) * 5 : step === "flat" ? 40 + (i % 4) * 4 : step === "down" ? 12 + (i % 3) * 5 : 55;
    const subject = SUBJECTS[i % SUBJECTS.length]!;
    const workouts = step === "up" ? 3 + (i % 2) : step === "flat" ? 2 : 0;
    const gap = i === 20 || i === 37 ? { weeks: 3, fromKey: weekKey, toKey: shiftDays(weekKey, 14) } : undefined;
    out.push({
      index: i,
      weekKey,
      label: labelFor(weekKey),
      isCurrent,
      isFirst,
      daysElapsed: isCurrent ? 5 : 7,
      score,
      step,
      altitude,
      subject: gap ? "empty" : subject,
      days: Array.from({ length: 7 }, (_, di) => ({
        key: shiftDays(weekKey, di),
        workout: di < workouts,
        workoutCount: di < workouts ? 1 : 0,
        food: di % 2 === 0 && step !== "down",
        mind: di % 3 === 0,
        mindSession: di % 3 === 0 && step === "up",
        future: isCurrent && di >= 5,
      })),
      ...(gap ? { gap } : {}),
      uses: { training: true, fuel: true, mind: true, mindMode: "sessions" },
      mind: {
        sessions: step === "up" ? 3 : step === "flat" ? 1 : 0,
        moodDays: step === "down" ? 1 : 4,
        dominant: i % 4 === 0 ? "locked_in" : i % 4 === 1 ? "stressed" : null,
        wins: i % 9 === 0 ? ["Showed up on a hard day"] : [],
        chapterUnlocked: i === 12 ? 2 : null,
      },
      nutrition: {
        logDays: step === "up" ? 5 : step === "flat" ? 3 : 0,
        proteinDays: step === "up" ? 4 : 1,
        avgCalories: step === "down" ? null : 2100 + (i % 7) * 20,
        weightStart: i % 6 === 0 ? 190 - i * 0.2 : null,
        weightEnd: i % 6 === 0 ? 189.4 - i * 0.2 : null,
        delta: i % 6 === 0 ? -0.6 : null,
      },
      training: {
        workouts,
        target: 3,
        hit: workouts >= 3,
        prs: i % 7 === 3 ? [{ name: "Back Squat", e1RM: 200 + i }] : [],
        prCount: i % 7 === 3 ? 1 : 0,
      },
      headline: gap ? "Away for 3 weeks" : step === "up" ? `${workouts} of 3. Week hit.` : step === "flat" ? "Holding steady" : step === "down" ? "A quieter week" : "Where it started",
      sub: gap ? "Nothing logged. The path held its ground and waited." : "Level with the week before.",
      said: [],
      tags: workouts ? [`${workouts}/3 workouts`] : [],
    });
  }
  return out;
}

export function journeyWith(weeks: WeekSnapshot[], over: Partial<JourneyPayload> = {}): JourneyPayload {
  const live = weeks[weeks.length - 1];
  return {
    todayKey: live ? shiftDays(live.weekKey, 4) : "2026-10-01",
    identity: "Someone who shows up, especially on the hard days",
    firstActivity: weeks[0]?.weekKey ?? null,
    unit: "lbs",
    target: { weight: 180, direction: "lose", pace: "on", eta: null },
    weeklyTarget: 3,
    weeks,
    next: {
      nutrition: { key: "log-dinner", title: "Log dinner", sub: "Close the day", severity: "info", url: "/dashboard/nutrition" },
      training: { key: "one-more", title: "One more workout", sub: "Hit 3 this week", severity: "nudge", url: "/dashboard/workout" },
    },
    becomingScore: 1250,
    chapter: 2,
    weights: [],
    ...over,
  };
}
