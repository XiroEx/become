/** Format a program start date as a smart label (mirrors webapp WorkoutClient) */
export function formatStartLabel(
  startDate: string | null | undefined,
  now: Date = new Date(),
): { label: string; isFuture: boolean } {
  if (!startDate) return { label: '', isFuture: false };
  const start =
    typeof startDate === 'string'
      ? startDate.split('T')[0]!
      : new Date(startDate).toISOString().split('T')[0]!;
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

  if (start > todayStr) {
    const startMs = new Date(start + 'T12:00:00').getTime();
    const todayMs = new Date(todayStr + 'T12:00:00').getTime();
    const diffDays = Math.round((startMs - todayMs) / (1000 * 60 * 60 * 24));
    if (diffDays === 1) return { label: 'Starts tomorrow', isFuture: true };
    if (diffDays <= 7) return { label: `Starts in ${diffDays} days`, isFuture: true };
    const d = new Date(start + 'T12:00:00');
    return {
      label: `Starts ${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`,
      isFuture: true,
    };
  }
  return { label: '', isFuture: false };
}
