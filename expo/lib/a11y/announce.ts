import { AccessibilityInfo } from "react-native";

/**
 * SAY THE THING THAT JUST APPEARED.
 *
 * A sighted member reads a new paragraph the moment it paints. VoiceOver does
 * not: focus stays where it was, so a screen that answers a tap by REPLACING
 * content — sign-in swapping the email field for "Check your inbox" — is
 * silence, and the member taps the button again.
 *
 * Two mechanisms, and both are needed:
 *
 * - `accessibilityLiveRegion="polite"` on the new View. Android's TalkBack
 *   reads it; iOS ignores the prop entirely.
 * - this function, which is `UIAccessibility.post(.announcement)` underneath and
 *   is how VoiceOver is told.
 *
 * Guarded because the API is a no-op without an accessibility manager attached
 * (tests, and any platform that does not implement it): an announcement is
 * never worth an exception.
 */
export function announce(message: string): void {
  if (!message) return;
  const speak = AccessibilityInfo.announceForAccessibility;
  if (typeof speak !== "function") return;
  try {
    speak.call(AccessibilityInfo, message);
  } catch {
    /* nothing to announce to */
  }
}
