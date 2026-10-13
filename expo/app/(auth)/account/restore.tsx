import { useCallback, useState } from "react";
import { Linking, Pressable, View } from "react-native";
import { Text } from "@/components/Text";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ArrowLeft } from "lucide-react-native";
import { Button } from "@/components/Button";
import { restoreAccount } from "@/lib/account/deleteAccount";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";
import { useAuth } from "@/lib/auth/useAuth";
import { minTouchTarget } from "@/lib/a11y/touchTarget";
import { LEGAL_CONTACT_EMAIL } from "@become/core";

/**
 * THE RESTORE LINK, WHEN IT OPENS IN THE APP.
 *
 * The link in the deletion email is
 * `https://become.redbtn.io/account/restore?u=…&t=…`. Where it opens is the
 * phone's decision, not ours:
 *   • iOS — `applinks:become.redbtn.io` in app.json's associatedDomains covers
 *     every path on the domain, so an installed app gets it.
 *   • Android — app.json declares an autoVerify intent filter for
 *     `/account/restore`, so an installed and verified app gets it.
 *   • Neither (uninstalled app, desktop mail, a browser that opts out) — the
 *     web page at the same URL handles it.
 *
 * All three end at the SAME public endpoint, POST /api/me/account/restore, with
 * the same `u` + `t`. That is what makes "the restore link works whether it
 * opens in the app or a browser" true rather than hopeful.
 *
 * NO SESSION IS REQUIRED OR USED. Requesting deletion signed every device out;
 * the MAC in `t` is the credential. And nothing is restored on mount — a
 * member presses a button — because mail scanners open links before people do.
 *
 * NP-253: the web page's "← Back to Become" sits above the title on every
 * state, because a member who opens the link from mail and has nothing to do
 * here (or changes their mind) must not be stuck on this screen — native had
 * no exit at all. There is no session attached to the link itself, but the
 * DEVICE this opens on may still hold one (the link can land on the same
 * phone that requested the deletion, before the app has re-checked it), so
 * the exit goes to Home when this device is signed in and to sign-in when it
 * is not — never a dead end either way.
 *
 * NP-311: dead-link failure copy parity with web, including the support email
 * mailto link so a member with an expired or invalid link can reach support.
 */
function SupportEmailLink({ onPress }: { onPress: () => void }) {
  return (
    <Text
      testID="restore-support-email"
      accessibilityRole="link"
      accessibilityLabel={`Email support at ${LEGAL_CONTACT_EMAIL}`}
      onPress={onPress}
      className="text-foreground text-sm font-medium underline"
    >
      {LEGAL_CONTACT_EMAIL}
    </Text>
  );
}

export default function RestoreAccountRoute() {
  const { colors } = useThemeTokens();
  const params = useLocalSearchParams<{ u?: string | string[]; t?: string | string[] }>();
  const router = useRouter();
  const { isAuthed } = useAuth();
  const [state, setState] = useState<"idle" | "working" | "done" | "failed">("idle");

  const first = (value: string | string[] | undefined): string =>
    (Array.isArray(value) ? value[0] : value)?.trim() ?? "";
  const userId = first(params.u);
  const token = first(params.t);

  const onRestore = async (): Promise<void> => {
    setState("working");
    try {
      const result = await restoreAccount({ userId, token });
      setState(result.ok ? "done" : "failed");
    } catch {
      setState("failed");
    }
  };

  const onBackToBecome = useCallback((): void => {
    router.replace(isAuthed ? "/(tabs)/dashboard" : "/login");
  }, [router, isAuthed]);

  const onEmailSupport = useCallback((): void => {
    void Linking.openURL(`mailto:${LEGAL_CONTACT_EMAIL}`);
  }, []);

  return (
    <SafeAreaView
      edges={["top", "bottom"]}
      style={{ flex: 1, backgroundColor: colors.background }}
      testID="restore-account-route"
    >
      <View style={{ padding: 16, gap: 12 }}>
        <Pressable
          testID="restore-back-link"
          accessibilityRole="link"
          accessibilityLabel="Back to Become"
          onPress={onBackToBecome}
          style={[
            minTouchTarget,
            { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start" },
          ]}
        >
          <ArrowLeft size={16} color={colors["muted-foreground"]} />
          <Text className="text-muted-foreground text-sm font-medium">Back to Become</Text>
        </Pressable>

        <Text className="text-foreground text-3xl font-extrabold">Restore your account</Text>

        {!userId || !token ? (
          <Text testID="restore-missing" className="text-muted-foreground text-sm">
            This link is incomplete. Open the one in the email we sent when the deletion was
            requested, or email{" "}
            <SupportEmailLink onPress={onEmailSupport} />{" "}
            from the address on the account.
          </Text>
        ) : state === "done" ? (
          <View style={{ gap: 12 }}>
            <Text testID="restore-done" className="text-muted-foreground text-sm">
              Your account is back and nothing was deleted. Sign in to carry on — notifications were
              switched off when the request was made, so turn them back on in Settings if you want
              them.
            </Text>
            <Button
              testID="restore-sign-in"
              onPress={() => {
                router.replace("/login");
              }}
            >
              Sign in
            </Button>
          </View>
        ) : state === "failed" ? (
          <View testID="restore-failed" style={{ gap: 12 }}>
            <Text className="text-muted-foreground text-sm">
              This link no longer works. That happens when the deletion was already cancelled, when a
              newer request replaced it, or when the window to change your mind has closed and the
              data is gone.
            </Text>
            <Text className="text-muted-foreground text-sm">
              If you think that is wrong, email{" "}
              <SupportEmailLink onPress={onEmailSupport} />{" "}
              from the address on the account.
            </Text>
          </View>
        ) : (
          <View style={{ gap: 12 }}>
            <Text className="text-muted-foreground text-sm">
              Pressing this cancels the deletion request on your account. Nothing has been deleted
              yet.
            </Text>
            <Button
              testID="restore-confirm"
              variant="inverted"
              loading={state === "working"}
              disabled={state === "working"}
              onPress={() => {
                void onRestore();
              }}
            >
              Restore my account
            </Button>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}
