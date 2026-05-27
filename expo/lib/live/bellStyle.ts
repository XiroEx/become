/**
 * Detect the implement type from an exercise name so the live screen can
 * label the weight input correctly. Mirrors the regex shipped in the webapp
 * (commit 3b3a84d) — `[[weight-clarity-dumbbell-kettlebell]]`.
 */
export type BellStyle = "dumbbell" | "kettlebell" | "barbell" | "other";

const DB_RE = /\b(db|dumbbells?)\b/i;
const KB_RE = /\b(kb|kettlebells?)\b/i;
const BB_RE = /\b(bb|barbells?)\b/i;

export function detectBellStyle(exerciseName: string): BellStyle {
  if (!exerciseName) return "other";
  if (KB_RE.test(exerciseName)) return "kettlebell";
  if (DB_RE.test(exerciseName)) return "dumbbell";
  if (BB_RE.test(exerciseName)) return "barbell";
  return "other";
}

export function weightLabel(style: BellStyle): string {
  switch (style) {
    case "dumbbell":
      return "Weight per DB (lbs)";
    case "kettlebell":
      return "Weight per KB (lbs)";
    case "barbell":
    case "other":
      return "Weight (lbs)";
  }
}

/**
 * Returns an informative helper string under the weight field for dumbbells.
 * `120 lbs per DB` ⇒ `= 240 lbs total`. Null for everything else.
 */
export function totalWeightHelper(
  style: BellStyle,
  perBell: number | null | undefined,
): string | null {
  if (style !== "dumbbell") return null;
  if (perBell === null || perBell === undefined) return null;
  if (!Number.isFinite(perBell) || perBell <= 0) return null;
  return `= ${perBell * 2} lbs total`;
}
