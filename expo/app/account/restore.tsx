import { useState } from "react";
import { Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Button } from "@/components/Button";
import { restoreAccount } from "@/lib/account/deleteAccount";

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
 */
export default function RestoreAccountRoute() {
  const params = useLocalSearchParams<{ u?: string | string[]; t?: string | string[] }>();
  const router = useRouter();
  const [state, setState] = useState<"idle" | "working" | "done" | "failed">("idle");

  const first = (value: string | string[] | undefined): string =>
    (Array.isArray(value) ? value[0] : value)?.trim() ?? "";
  const userId = first(params.u);
  const token = first(params.t);

  const onRestore = async (): Promise<void> => {
    setState("working");
    const result = await restoreAccount({ userId, token });
    setState(result.ok ? "done" : "failed");
  };

  return (
    <SafeAreaView
      edges={["top", "bottom"]}
      style={{ flex: 1, backgroundColor: "#0a0a0a" }}
      testID="restore-account-route"
    >
      <View style={{ padding: 16, gap: 12 }}>
        <Text className="text-foreground text-2xl font-bold">Restore your account</Text>

        {!userId || !token ? (
          <Text testID="restore-missing" className="text-muted-foreground text-sm">
            This link is incomplete. Open the one in the email we sent when the deletion was
            requested.
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
          <Text testID="restore-failed" className="text-muted-foreground text-sm">
            This link no longer works. The deletion may already have been cancelled, replaced by a
            newer request, or gone past the window to change your mind.
          </Text>
        ) : (
          <View style={{ gap: 12 }}>
            <Text className="text-muted-foreground text-sm">
              Your account is scheduled for deletion. Nothing has been deleted yet — this cancels the
              request.
            </Text>
            <Button
              testID="restore-confirm"
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
