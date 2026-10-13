import { useState } from "react";
import { Pressable, View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";
import { Text } from "@/components/Text";
import { openWebSignedIn } from "@/lib/web/openWebSignedIn";
import {
  passkeySupported,
  registerPasskeyNative,
  type PasskeyNativeDeps,
} from "@/lib/auth/passkey";
import { minTouchTarget } from "@/lib/a11y/touchTarget";
import { WRAPPABLE_TEXT } from "@/lib/a11y/dynamicType";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";

/**
 * "Passkey" in Settings > Profile > Account, under Email: the native twin of
 * `webapp/components/PasskeySetupButton.tsx`, which the web renders in the
 * same place (`webapp/app/dashboard/settings/page.tsx`, Profile tab,
 * Account section). Same label, same full-width bordered button with the
 * same key icon, same busy text, same status line, same help text.
 *
 * History: card `6acdcae0433f8772a69adf8c` first added a separate "Passkey"
 * card on the Settings tab as a hand-off to the web. NP-161 replaced the
 * hand-off with the real ceremony, run on-device through
 * `react-native-passkey` (`@/lib/auth/passkey.ts`) against the SAME
 * `webapp/app/api/auth/passkey/*` routes, so a passkey added here works on
 * the web and vice versa. That card was then rendered WITHOUT a token, so the
 * native button was disabled on every device. `token` is therefore a
 * REQUIRED prop: forgetting it is now a type error, not a dead button.
 *
 * A device too old for passkeys (`passkeySupported()` false, pre-iOS 15 /
 * pre-API 28) keeps the original hand-off: `openWebSignedIn` to the web
 * Settings page, which can run the ceremony in the system browser.
 *
 * There is no list, rename or remove anywhere in the product: the web offers
 * exactly one affordance, "Add a passkey", and native mirrors that.
 */
export const PASSKEY_SETTINGS_PATH = "/dashboard/settings";

export const PASSKEY_HELP_TEXT = "Sign in with Face ID, Touch ID, or a security key.";

export interface PasskeySectionProps {
  /** The signed-in member's JWT, from `useAuth()`. Required (it may be null
   *  while signed out): without it the native ceremony cannot run. */
  token: string | null | undefined;
  /** DI for tests — the native WebAuthn capability + fetch. */
  deps?: PasskeyNativeDeps;
  /** DI for tests — overrides the device-support probe. */
  supported?: boolean;
}

/** The web button's key icon (the same three strokes, 24×24, stroke 2). */
function PasskeyKeyIcon({ color }: { color: string }) {
  return (
    <Svg
      width={16}
      height={16}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Path d="M2 18v3h6v-3a3 3 0 0 0-6 0z" />
      <Circle cx={5} cy={11} r={3} />
      <Path d="M12 9h9M18 9v4M21 9v3" />
    </Svg>
  );
}

export function PasskeySection({ token, deps, supported }: PasskeySectionProps) {
  const { colors } = useThemeTokens();
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ ok: boolean; msg: string } | null>(null);

  const nativeSupported = supported ?? passkeySupported();
  const disabled = nativeSupported ? busy || !token : false;

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
    <View testID="settings-passkey-section">
      <Text className="text-foreground text-sm font-medium mb-1">Passkey</Text>
      <Pressable
        testID="passkey-add-button"
        accessibilityRole={nativeSupported ? "button" : "link"}
        accessibilityLabel="Add a passkey"
        accessibilityHint={
          nativeSupported
            ? "Follow your device prompt to add a passkey"
            : "Opens Become on web, signed in, to finish adding a passkey"
        }
        accessibilityState={{ disabled, busy }}
        onPress={() => {
          if (nativeSupported) void addNative();
          else void openWebSignedIn(PASSKEY_SETTINGS_PATH);
        }}
        disabled={disabled}
        className="bg-card border border-border rounded-xl px-3 py-2.5"
        style={[
          minTouchTarget,
          {
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            opacity: disabled ? 0.5 : 1,
          },
        ]}
      >
        <PasskeyKeyIcon color={colors.foreground} />
        <Text className="text-foreground text-sm font-medium" style={WRAPPABLE_TEXT}>
          {busy ? "Follow your device prompt…" : "Add a passkey"}
        </Text>
      </Pressable>
      {status && (
        <Text
          testID="passkey-add-status"
          className={`text-xs mt-1 ${status.ok ? "text-success" : "text-destructive"}`}
        >
          {status.msg}
        </Text>
      )}
      <Text className="text-muted-foreground text-xs mt-1">{PASSKEY_HELP_TEXT}</Text>
    </View>
  );
}
