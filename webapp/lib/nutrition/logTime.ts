/**
 * Translate a stored MealLog timestamp into the value expected by a native
 * `input[type=time]`. Untimed logs deliberately render an empty field: their
 * timestamp only pins the calendar day and is not a user-entered clock time.
 */
export function mealLogTimeInputValue(loggedAt: string | Date | undefined, untimed = false): string {
  if (!loggedAt || untimed) return ''
  const date = loggedAt instanceof Date ? new Date(loggedAt) : new Date(loggedAt)
  if (Number.isNaN(date.getTime())) return ''
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}

/**
 * Build the time fields accepted by MealLog PATCH routes. The calendar date
 * comes from the existing instant; only its local clock is changed. Clearing
 * the input returns to the explicit no-time state without dropping loggedAt,
 * because the schema and day-level queries still require a timestamp.
 */
export function mealLogTimePatch(
  loggedAt: string | Date | undefined,
  time: string,
): { loggedAt?: string; untimed: boolean } {
  if (!time) return { untimed: true }

  const match = /^(\d{2}):(\d{2})$/.exec(time)
  const basis = loggedAt instanceof Date ? new Date(loggedAt) : new Date(loggedAt ?? '')
  if (!match || Number.isNaN(basis.getTime())) return { untimed: true }

  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (hours > 23 || minutes > 59) return { untimed: true }

  basis.setHours(hours, minutes, 0, 0)
  return { loggedAt: basis.toISOString(), untimed: false }
}
