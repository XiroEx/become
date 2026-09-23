import { useCallback, useState } from "react";
import { Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { Button } from "@/components/Button";
import { restoreAccount, type RestoreOutcome } from "@/lib/account/deleteAccount";

/**
 * Where the "Keep my account" link lands when iOS or Android hands it to the
 * app instead of to a browser.
 *
 * The SAME URL serves both: https://become.redbtn.io/account/restore?u=…&t=…
 * is a Universal Link (app.json → ios.associatedDomains) and an autoVerify
 * intent filter (app.json → android.intentFilters), and it is also a real page
 * in the webapp. Whichever opens it, the credential is the HMAC in the query
 * and the endpoint is the same — which is the whole of the acceptance
 * criterion "the restore link works whether it opens in the app or a browser".
 *
 * NO SESSION IS REQUIRED, and none is offered. Requesting the deletion signed
 * this device out, so a screen that asked the member to log in first would be
 * asking the one thing they may no longer be able to do.
 *
 * NOTHING HAPPENS ON MOUNT. A cold open from a link preview, or a tap the
 * member did not mean, must not silently cancel a deletion they did mean; the
 * POST is behind a press.
 */
export default function AccountRestoreRoute() {
  const params = useLocalSearchParams<{ u?: string; t?: string }>();
  const userId = typeof params.u === "string" ? params.u : "";
  const token = typeof params.t === "string" ? params.t : "";

  const [busy, setBusy] = useState<boolean>(false);
  const [outcome, setOutcome] = useState<RestoreOutcome | null>(null);

  const onPress = useCallback(async () => {
    setBusy(true);
    setOutcome(await restoreAccount({ userId, token }));
    setBusy(false);
  }, [userId, token]);

  const missing = !userId || !token;

  return (
    <SafeAreaView
      edges={["top", "bottom"]}
      style={{ flex: 1, backgroundColor: "#0a0a0a" }}
      testID="account-restore-route"
    >
      <View style={{ padding: 16, gap: 12 }}>
        {outcome === null ? (
          <>
            <Text className="text-foreground text-2xl font-bold">
              Keep your account
            </Text>
            <Text className="text-muted-foreground text-sm">
              {missing
                ? "This link is missing the part that identifies it. Open the “Keep my account” button in the email we sent you rather than typing the address in."
                : "Your Become account is scheduled for deletion. Cancel it and everything comes back exactly as it was — nothing has been erased yet."}
            </Text>
            <Button
              testID="restore-confirm"
              onPress={() => {
                void onPress();
              }}
              loading={busy}
              disabled={missing}
              accessibilityLabel="Keep my account"
            >
              Keep my account
            </Button>
          </>
        ) : (
          <>
            <Text testID="restore-outcome" className="text-foreground text-2xl font-bold">
              {outcome === "restored"
                ? "Your account is back"
                : outcome === "nothing_pending"
                  ? "There is nothing to restore"
                  : outcome === "invalid_link"
                    ? "That link is not valid any more"
                    : "Something went wrong"}
            </Text>
            <Text className="text-muted-foreground text-sm">
              {outcome === "restored"
                ? "The deletion has been cancelled and nothing was removed. Sign in as usual — your history is all where you left it. Notifications stay off until you turn them back on in Settings."
                : outcome === "nothing_pending"
                  ? "No deletion is pending on this account. Either it was already cancelled, or the seven days elapsed and the data has been erased."
                  : outcome === "invalid_link"
                    ? "A restore link stops working once the deletion has been cancelled, and a new request replaces the old link. Check that you opened the most recent email."
                    : "We could not cancel the deletion just now. Nothing has been erased yet, so try again in a minute."}
            </Text>
            <Button
              testID="restore-sign-in"
              variant="secondary"
              onPress={() => router.replace("/login")}
              accessibilityLabel="Go to sign in"
            >
              Sign in
            </Button>
          </>
        )}
      </View>
    </SafeAreaView>
  );
}
