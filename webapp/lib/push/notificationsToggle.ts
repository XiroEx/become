/**
 * Master notifications on/off switch, shared by the subscribe route's guard
 * and the Settings toggle. Same opt-out convention as notificationPrefs.<category>:
 * undefined/null means the user never touched the switch, which reads as ON —
 * only an explicit false (set when the user turns notifications off) reads as OFF.
 */
export function notificationsAreEnabled(value: boolean | null | undefined): boolean {
  return value !== false
}
