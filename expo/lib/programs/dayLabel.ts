/**
 * THE DAY TAB LABEL (NP-220).
 *
 * `ProgramWorkoutSchema.day` is optional, and catalogue/custom documents in
 * the wild carry `""` (or whitespace-only) — `??` lets those through, and a
 * tab whose `<Text>` child is `""` renders as a blank pill in both themes
 * while collapsing `key`/`testID`/`accessibilityLabel` onto duplicates. So
 * the fallback fires on blank as well as absent, and trims — the web trims
 * on the way in (`webapp/lib/workout/importProgram.ts`).
 *
 * Every site that derives a day label — the view model
 * (`lib/programs/programDetail.ts`), the tab render and selection
 * (`components/programs/ProgramDetail.tsx`), and the route's defaults
 * (`app/(app)/(tabs)/programming/[id]/index.tsx`) — reads this, so a label
 * computed in one place can never mismatch one matched in another.
 */
export function workoutDayLabel(
  day: string | undefined,
  workoutIndex: number,
): string {
  const trimmed = day?.trim();
  return trimmed ? trimmed : `Day ${workoutIndex + 1}`;
}
