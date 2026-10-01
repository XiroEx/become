export type WeightUnit = "lbs" | "kg";
export type NutritionDirection = "lose" | "maintain" | "gain";

export interface GoalTileInputs {
  fitnessGoal?: string | null;
  nutritionDirection?: string | null;
  targetWeightKg?: number | null;
  startWeightKg?: number | null;
  latestWeight?: number | null;
  earliestWeight?: number | null;
  weightUnit: WeightUnit;
  pace?: { status: string; eta: string; behindByKg: number } | null;
  program?: {
    name: string;
    completedWorkouts?: number | null;
    totalWorkouts?: number | null;
    currentWeek: number;
    totalWeeks: number;
    programId: string;
  } | null;
}

export interface GoalTileView {
  kind: "weight" | "program" | "unset";
  label: string;
  value: string;
  footer: string;
  pct: number;
  href: string;
  direction: "down" | "up" | "hold" | null;
  atTarget: boolean;
}

const KG_PER_LB = 0.45359237;

export const GOAL_LABELS: Record<string, string> = {
  lose_weight: "Lose weight",
  gain_muscle: "Build muscle",
  maintain: "Maintain",
  improve_performance: "Perform",
  general_health: "General health",
};

export function goalLabel(goal: string | null | undefined): string | null {
  if (!goal) return null;
  return GOAL_LABELS[goal] ?? null;
}

export function kgToUnit(kg: number, unit: WeightUnit): number {
  return unit === "kg" ? kg : kg / KG_PER_LB;
}

export function formatWeightDelta(amount: number, unit: WeightUnit): string {
  const abs = Math.abs(amount);
  const text =
    abs < 10 && Math.round(abs * 10) % 10 !== 0
      ? abs.toFixed(1)
      : String(Math.round(abs));
  return `${text} ${unit}`;
}

export function formatWeight(amount: number, unit: WeightUnit): string {
  return unit === "kg"
    ? (Math.round(amount * 10) / 10).toString()
    : String(Math.round(amount));
}

export function holdBand(unit: WeightUnit): number {
  return unit === "kg" ? 1 : 2;
}

export function describeGoal(input: GoalTileInputs): GoalTileView {
  const unit = input.weightUnit;
  const name = goalLabel(input.fitnessGoal);
  const label = name ? `Goal · ${name}` : "Goal";
  const target =
    input.targetWeightKg && input.targetWeightKg > 0
      ? kgToUnit(input.targetWeightKg, unit)
      : null;
  const latest =
    input.latestWeight != null && input.latestWeight > 0
      ? input.latestWeight
      : null;

  if (target != null && latest != null) {
    const diff = latest - target;
    const band = holdBand(unit);
    const atTarget = Math.abs(diff) <= band;
    const direction: GoalTileView["direction"] = atTarget
      ? "hold"
      : diff > 0
        ? "down"
        : "up";

    const startCandidate =
      input.startWeightKg && input.startWeightKg > 0
        ? kgToUnit(input.startWeightKg, unit)
        : (input.earliestWeight ?? null);
    let pct = 0;
    if (atTarget) pct = 100;
    else if (startCandidate != null) {
      const total = startCandidate - target;
      const done = startCandidate - latest;
      pct =
        total !== 0 && Math.sign(total) === Math.sign(done)
          ? Math.max(0, Math.min(100, Math.round((done / total) * 100)))
          : 0;
    }

    const p = input.pace;
    let footer: string;
    if (atTarget) {
      footer = `Holding ${formatWeight(target, unit)} ${unit}`;
    } else if (p && p.status === "behind" && p.behindByKg > 0) {
      footer = `→ ${formatWeight(target, unit)} ${unit} · ${formatWeightDelta(kgToUnit(p.behindByKg, unit), unit)} behind`;
    } else if (p && (p.status === "on" || p.status === "ahead") && p.eta) {
      footer = `→ ${formatWeight(target, unit)} ${unit} · ${p.eta}${p.status === "ahead" ? " · ahead" : ""}`;
    } else {
      footer = `${formatWeight(latest, unit)} → ${formatWeight(target, unit)} ${unit}`;
    }

    return {
      kind: "weight",
      label,
      value: atTarget ? "Goal reached 🎉" : `${formatWeightDelta(diff, unit)} to go`,
      footer,
      pct,
      href: "/(tabs)/nutrition",
      direction,
      atTarget,
    };
  }

  if (target != null && latest == null) {
    return {
      kind: "weight",
      label,
      value: `${formatWeight(target, unit)} ${unit}`,
      footer: "Log a weigh-in to track it",
      pct: 0,
      href: "/(tabs)/dashboard",
      direction: null,
      atTarget: false,
    };
  }

  const p = input.program;
  if (p) {
    const pct =
      p.totalWorkouts && p.totalWorkouts > 0 && p.completedWorkouts != null
        ? Math.min(
            100,
            Math.round((p.completedWorkouts / p.totalWorkouts) * 100),
          )
        : Math.min(
            100,
            Math.round((p.currentWeek / (p.totalWeeks || 1)) * 100),
          );
    return {
      kind: "program",
      label,
      value: `${pct}%`,
      footer: p.name,
      pct,
      href: `/(tabs)/programming/${p.programId}`,
      direction: null,
      atTarget: false,
    };
  }

  return {
    kind: "unset",
    label,
    value: "Set a goal",
    footer: "Add a target weight in Settings",
    pct: 0,
    href: "/settings",
    direction: null,
    atTarget: false,
  };
}
