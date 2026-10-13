import { Pressable, View } from "react-native";
import { Text } from "@/components/Text";
import { openWebSignedIn } from "@/lib/web/openWebSignedIn";
import { minTouchTarget } from "@/lib/a11y/touchTarget";
import { ExternalLink } from "lucide-react-native";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";

/**
 * "Passkey" — card `6acdcae0433f8772a69adf8c` (Visual QA 2026-10-12, lane run
 * `20261012T234649Z`): native Settings had no Passkey section at all while
 * `webapp/app/dashboard/settings/page.tsx` renders one inside its Account
 * card (`<PasskeySetupButton />`). This closes that gap, styled like the
 * Security section next door (`BiometricUnlockSection`, NP-187).
 *
 * **What this can and cannot mirror, checked before building:**
 *
 * - `webapp/components/PasskeySetupButton.tsx` — the whole of what the web
 *   Settings page actually offers today — is ONE affordance: "Add a
 *   passkey", which runs a WebAuthn registration ceremony in the browser
 *   (`webapp/lib/passkeyClient.ts` → `navigator.credentials.create`). There
 *   is no list, no rename and no remove anywhere in the product: no API
 *   route under `webapp/app/api/auth/passkey/*` answers one, `models/`
 *   defines no endpoint for it, and `@redbtn/redauth@1.4.2`'s
 *   `IPasskeyCredential` (the record a passkey is stored as) has no name/
 *   label field at all — so "rename" is not buildable on ANY platform, web
 *   included, without a data-model change, which is out of scope for this
 *   one-screen card. Native therefore has nothing to mirror for list/rename/
 *   remove; the acceptance text assumed that part of the web screen exists,
 *   and it does not (verified by reading every route under
 *   `webapp/app/api/auth/passkey/` and the redauth 1.4.2 service contract,
 *   `services/passkey-wallet-methods.d.ts`, which DOES expose
 *   `listPasskeyCredentials` / `deletePasskeyCredential` at the service
 *   layer — but wiring a web-facing route to them is new backend surface
 *   the card explicitly says not to add here: "reuse the existing passkey
 *   API ... rather than inventing a new endpoint" and "do not widen this
 *   into an auth refactor. One screen."). That wiring is real, scoped work —
 *   worth its own card — not a silent omission.
 * - Registering a passkey is a WebAuthn ceremony against the OS/browser
 *   credential manager. Native has no module for that yet — NP-161
 *   ("Passkeys natively: webcredentials, a native passkey module and the
 *   Android origin") is still open — so a native "Add a passkey" button
 *   cannot itself run the ceremony. Rather than ship a button that does
 *   nothing (or worse, one that throws), this one reuses the SAME pattern
 *   already used elsewhere on this exact screen for other web-only
 *   surfaces (the Admin tools row, just above): `openWebSignedIn`, which
 *   hands the member to the real web Settings page, already signed in, to
 *   finish the ceremony there. `/dashboard/settings` was added to
 *   `HANDOFF_ALLOWED_PATHS` (`webapp/lib/authHandoff.ts`) for this — the
 *   SAME hand-off endpoint the Admin tools row already calls, not a new one.
 */
export const PASSKEY_SETTINGS_PATH = "/dashboard/settings";

export function PasskeySection() {
  const { colors } = useThemeTokens();

  return (
    <View
      testID="settings-passkey-section"
      className="rounded-xl border border-border bg-card p-4"
      style={{ gap: 12 }}
    >
      <Text
        accessibilityRole="header"
        className="text-foreground text-base font-semibold"
      >
        Passkey
      </Text>
      <Text className="text-muted-foreground text-xs">
        Sign in with Face ID, Touch ID, or a security key.
      </Text>
      <Pressable
        testID="passkey-add-button"
        accessibilityRole="link"
        accessibilityLabel="Add a passkey"
        accessibilityHint="Opens Become on web, signed in, to finish adding a passkey"
        onPress={() => {
          void openWebSignedIn(PASSKEY_SETTINGS_PATH);
        }}
        style={[
          minTouchTarget,
          {
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            paddingVertical: 8,
          },
        ]}
      >
        <Text className="text-foreground text-sm font-medium">
          Add a passkey
        </Text>
        <ExternalLink size={16} color={colors["muted-foreground"]} />
      </Pressable>
      <Text className="text-muted-foreground text-xs">
        Opens on web, signed in, to finish on your device — Become for iOS
        and Android does not yet support setting up a passkey without
        leaving the app. Managing or removing an existing passkey also stays
        on web for now; that is not offered on this screen because it is not
        offered on web&apos;s Settings page either today.
      </Text>
    </View>
  );
}
