import { ProfileSettingsScreen } from "@/components/profile/ProfileSettingsScreen";

/**
 * SETTINGS. Profile, body stats, and unit preference using shared conversion
 * maths (NP-017 / NP-048).
 *
 * NP-302: this screen's content is now ALSO reachable from Settings >
 * Profile (`app/(app)/settings.tsx`), which renders the same
 * `ProfileSettingsScreen` with `embedded={true}`. This route stays — the
 * deep link `become:///profile/health` still resolves here — but keeps its
 * original full-screen behavior (its own header, SafeAreaView and
 * DangerZone) by rendering the default, non-embedded form.
 */
export default function HealthSettingsRoute() {
  return <ProfileSettingsScreen />;
}
