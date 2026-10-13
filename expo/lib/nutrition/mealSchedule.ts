import { parseHHMM } from "@become/core/nutrition/mealSchedule";
export * from "@become/core/nutrition/mealSchedule";

/** Format a tag string into Title Case for display (e.g. "before-work" -> "Before Work"). */
export function titleCase(tag: string): string {
  return tag
    .split(/[-_\s]+/)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase())
    .join(" ");
}

/**
 * Parses user-entered time strings into minutes from midnight (0-1439).
 * Accepts 24-hour formats ("08:00", "8:30", "23:15") as well as common 12-hour
 * inputs ("8:30 am", "8:30pm", "8 pm", "12 pm").
 * Returns null if the value is unparseable or outside the day.
 */
export function parseTimeValue(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  // Direct 24-hour match
  const direct = parseHHMM(trimmed);
  if (direct !== null) return direct;

  // 12-hour match (e.g. "8:30 am", "8 pm", "12:00 am")
  const match12 = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/i.exec(trimmed);
  if (match12 && match12[1] && match12[3]) {
    let h = Number(match12[1]);
    const min = match12[2] ? Number(match12[2]) : 0;
    const isPm = match12[3].toLowerCase() === "pm";
    if (h < 1 || h > 12 || min < 0 || min > 59) return null;
    if (isPm && h < 12) h += 12;
    if (!isPm && h === 12) h = 0;
    return h * 60 + min;
  }

  return null;
}
