export const STREAK_VISIBLE_MIN = 2;

export type StreakPageId =
  | "super"
  | "overall"
  | "workout"
  | "nutrition"
  | "mindset";

export interface StreaksLite {
  overall: {
    current: number;
    best: number;
    nextMilestone: number | null;
    activeToday: boolean;
    freezes: number;
  };
  pillars: {
    workout: {
      unit: "days" | "weeks";
      current: number;
      best: number;
      thisWeek: number;
      target: number | null;
      remainingThisWeek?: number;
      weekLost: boolean;
    };
    nutrition: { current: number; best: number; activeToday: boolean };
    mindset: { current: number; best: number; activeToday: boolean };
    super: {
      current: number;
      best: number;
      activeToday: boolean;
      today: {
        nutrition: boolean;
        mindset: boolean;
        trained: boolean;
        restDay: boolean;
        weekOnTrack: boolean;
      };
      freeze?: {
        available: boolean;
        returnsOn: string | null;
        usedDays: string[];
        frozenToday: boolean;
      };
    };
  };
}

export interface StreakPage {
  id: StreakPageId;
  label: string;
  fullLabel: string;
  value: string;
  unit?: string;
  footer: string;
  pct: number;
  doneToday: boolean;
  emphasis: boolean;
}

export function superMissing(
  s: StreaksLite,
): ("food" | "mindset" | "training")[] {
  const t = s.pillars.super.today;
  const out: ("food" | "mindset" | "training")[] = [];
  if (!t.nutrition) out.push("food");
  if (!t.mindset) out.push("mindset");
  if (!t.trained) out.push("training");
  return out;
}

function list(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

const MISSING_LABEL: Record<"food" | "mindset" | "training", string> = {
  food: "log food",
  mindset: "check in",
  training: "train",
};

export function streakPages(s: StreaksLite | null): StreakPage[] {
  if (!s) return [];
  const pages: StreakPage[] = [];
  const sup = s.pillars?.super;

  if (sup && sup.current >= STREAK_VISIBLE_MIN) {
    const missing = superMissing(s);
    pages.push({
      id: "super",
      label: "Super Streak",
      fullLabel: "Super streak",
      value: String(sup.current),
      unit: sup.current === 1 ? "day" : "days",
      footer: sup.activeToday
        ? sup.best > sup.current
          ? `All three · best ${sup.best}`
          : "All three today"
        : missing.length === 0
          ? `Best ${sup.best}`
          : `Today: ${list(missing.map((m) => MISSING_LABEL[m]))}`,
      pct:
        sup.best > 0
          ? Math.min(
              100,
              Math.round((sup.current / Math.max(sup.best, sup.current)) * 100),
            )
          : 100,
      doneToday: sup.activeToday,
      emphasis: true,
    });
  }

  const days = s.overall?.current ?? 0;
  const visible = days >= STREAK_VISIBLE_MIN;
  const next = s.overall?.nextMilestone ?? (days > 0 ? (days < 3 ? 3 : days < 7 ? 7 : days < 14 ? 14 : days < 30 ? 30 : days + 7) : 3);
  const prevMilestone = next ? Math.max(0, next - 7) : 0;
  pages.push({
    id: "overall",
    label: "Day Streak",
    fullLabel: "Day streak",
    value: visible ? String(days) : "Building",
    unit: visible ? (days === 1 ? "day" : "days") : undefined,
    footer: visible
      ? next
        ? `${next - days}d to ${next}-day 🏆`
        : "Every milestone reached"
      : `${days}/${STREAK_VISIBLE_MIN} · ${STREAK_VISIBLE_MIN - days} more ${STREAK_VISIBLE_MIN - days === 1 ? "day" : "days"}`,
    pct: visible
      ? next
        ? Math.min(
            100,
            Math.round(
              ((days - prevMilestone) / Math.max(1, next - prevMilestone)) *
                100,
            ),
          )
        : 100
      : Math.round(
          (Math.min(days, STREAK_VISIBLE_MIN) / STREAK_VISIBLE_MIN) * 100,
        ),
    doneToday: s.overall?.activeToday ?? false,
    emphasis: false,
  });

  const w = s.pillars?.workout;
  if (w && w.current >= STREAK_VISIBLE_MIN && w.target) {
    pages.push({
      id: "workout",
      label: "Workout",
      fullLabel: "Workout streak",
      value: String(w.current),
      unit: w.current === 1 ? "day" : "days",
      footer: `${w.thisWeek}/${w.target} workouts this week${w.weekLost ? " · off track" : ""}`,
      pct: w.target
        ? Math.min(100, Math.round((w.thisWeek / w.target) * 100))
        : 100,
      doneToday: !w.weekLost,
      emphasis: false,
    });
  }

  const n = s.pillars?.nutrition;
  if (n && n.current >= STREAK_VISIBLE_MIN) {
    pages.push({
      id: "nutrition",
      label: "Nutrition",
      fullLabel: "Nutrition streak",
      value: String(n.current),
      unit: n.current === 1 ? "day" : "days",
      footer: n.activeToday
        ? `Logged today · best ${n.best}`
        : "Log a meal to keep it",
      pct: Math.min(
        100,
        Math.round((n.current / Math.max(n.best, n.current)) * 100),
      ),
      doneToday: n.activeToday,
      emphasis: false,
    });
  }

  const m = s.pillars?.mindset;
  if (m && m.current >= STREAK_VISIBLE_MIN) {
    pages.push({
      id: "mindset",
      label: "Mindset",
      fullLabel: "Mindset streak",
      value: String(m.current),
      unit: m.current === 1 ? "day" : "days",
      footer: m.activeToday
        ? `Checked in today · best ${m.best}`
        : "Check in to keep it",
      pct: Math.min(
        100,
        Math.round((m.current / Math.max(m.best, m.current)) * 100),
      ),
      doneToday: m.activeToday,
      emphasis: false,
    });
  }

  return pages;
}
