/**
 * The Notifications-settings copy for a member who has installed the native
 * app (NP-205). Pure, and the ONE place the wording lives, so Settings and
 * its test can never drift apart.
 */

export const NATIVE_APP_SETTINGS_NOTICE =
  "Reminders now come from the Become app on your phone, not the browser — you won't get them twice."

/** `preferences.nativeAppActive` (GET /api/notifications/preferences) decides this. */
export function shouldShowNativeAppSettingsNotice(nativeAppActive: boolean | undefined): boolean {
  return nativeAppActive === true
}
