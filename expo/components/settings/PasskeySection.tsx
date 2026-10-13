import { useState } from "react";
import { Pressable, View } from "react-native";
import { Text } from "@/components/Text";
import { openWebSignedIn } from "@/lib/web/openWebSignedIn";
import {
  passkeySupported,
  registerPasskeyNative,
  type PasskeyNativeDeps,
} from "@/lib/auth/passkey";
import { minTouchTarget } from "@/lib/a11y/touchTarget";
import { ExternalLink, Fingerprint } from "lucide-react-native";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";

/**
 * "Passkey" — card `6acdcae0433f8772a69adf8c` first added this section as a
 * hand-off to the web (native had no WebAuthn module yet). NP-161 ("Passkeys
 * natively: webcredentials, a native passkey module and the Android origin")
 * replaces that hand-off with the real ceremony, run on-device through
 * `react-native-passkey` (`@/lib/auth/passkey.ts`) — the same
 * options/verify round trip `webapp/lib/passkeyClient.ts` runs in a browser,
 * against the SAME `webapp/app/api/auth/passkey/*` routes, so a passkey
 * added here is a passkey that works on the web and vice versa (shared
 * `rpID`, unchanged).
 *
 * A device too old for passkeys (`passkeySupported()` false — pre-iOS 15 /
 * pre-API 28) keeps the ORIGINAL hand-off: `openWebSignedIn` to the real web
 * Settings page, which can still run the ceremony in a modern mobile
 * browser. That is the only situation this still defers to web; everywhere
 * else "Add a passkey" never leaves the app.
 *
 * Still true, and unchanged from the hand-off version: there is no list,
 * rename or remove anywhere in the product — `webapp/components/
 * PasskeySetupButton.tsx` and every route under `webapp/app/api/auth/
 * passkey/` offer exactly one affordance, "Add a passkey", and native mirrors
 * that one affordance, nothing more.
 */
export const PASSKEY_SETTINGS_PATH = "/dashboard/settings";

export interface PasskeySectionProps {
  /** The signed-in member's JWT. Required to run the ceremony; with none,
   *  the row still hands off to web (which can prompt for its own session). */
  token?: string | null;
  /** DI for tests — the native WebAuthn capability + fetch. */
  deps?: PasskeyNativeDeps;
  /** DI for tests — overrides the device-support probe. */
  supported?: boolean;
}

export function PasskeySection({ token, deps, supported }: PasskeySectionProps = {}) {
  const { colors } = useThemeTokens();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; msg: string } | null>(null);

  const nativeSupported = supported ?? passkeySupported();

  async function addNative() {
    if (busy || !token) return;
    setStatus(null);
    setBusy(true);
    try {
      const result = await registerPasskeyNative(token, deps);
      if (result.status === "registered") {
        setStatus({ ok: true, msg: "Passkey added. You can use it to sign in next time." });
      } else if (result.status === "cancelled") {
        // The member dismissed the system sheet. Say nothing, same as web.
      } else if (result.status === "unsupported") {
        setStatus({ ok: false, msg: "This device does not support passkeys." });
      } else {
        setStatus({ ok: false, msg: result.message });
      }
    } finally {
      setBusy(false);
    }
  }

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
      {nativeSupported ? (
        <Pressable
          testID="passkey-add-button"
          accessibilityRole="button"
          accessibilityLabel="Add a passkey"
          accessibilityHint="Follow your device prompt to add a passkey"
          onPress={() => {
            void addNative();
          }}
          disabled={busy || !token}
          style={[
            minTouchTarget,
            {
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              paddingVertical: 8,
              opacity: busy || !token ? 0.5 : 1,
            },
          ]}
        >
          <Text className="text-foreground text-sm font-medium">
            {busy ? "Follow your device prompt…" : "Add a passkey"}
          </Text>
          <Fingerprint size={16} color={colors["muted-foreground"]} />
        </Pressable>
      ) : (
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
      )}
      {status && (
        <Text
          testID="passkey-add-status"
          className={`text-xs ${status.ok ? "text-success" : "text-destructive"}`}
        >
          {status.msg}
        </Text>
      )}
      <Text className="text-muted-foreground text-xs">
        {nativeSupported
          ? "Managing or removing an existing passkey stays on web for now; that is not offered on this screen because it is not offered on web's Settings page either today."
          : "This device is too old to add a passkey here — opens on web, signed in, to finish on your device instead. Managing or removing an existing passkey also stays on web for now; that is not offered on this screen because it is not offered on web's Settings page either today."}
      </Text>
    </View>
  );
}
