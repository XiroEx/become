import { useState } from "react";
import { Platform, Text, View } from "react-native";
import { Button } from "@/components/Button";
import { Modal } from "@/components/Modal";
import {
  RESTORE_WINDOW_DAYS,
  requestAccountDeletion,
} from "@/lib/account/deleteAccount";
import { secureTokenStore } from "@/lib/auth/secureStoreToken";

/**
 * Delete account, on the settings screen of both store builds.
 *
 * WHAT A REVIEWER DOES, AND WHAT THEY FIND
 * Settings → **Delete account** → **Yes, delete my account**. Two taps, inside
 * the app, no email to compose and no support ticket to open — which is
 * literally what App Store Review Guideline 5.1.1(v) is checked against by
 * hand.
 *
 * THE SIGN-OUT IS PART OF THE ACTION, NOT A COURTESY. The server drops every
 * push registration for the account the moment the request lands (web push
 * endpoints and this installation's Expo push token alike), so the session in
 * SecureStore is already worthless. Leaving it there would show a signed-in app
 * for an account that is being deleted. `onDeleted` then sends the member to
 * the sign-in screen.
 *
 * Everything that talks to the network or to the Keychain is injectable, so
 * this renders and behaves in jest without a device.
 */
export interface DangerZoneProps {
  /** Session JWT. Absent → the section renders, disabled, rather than vanishing. */
  token?: string | null;
  /** Called after a successful request, once the stored token is cleared. */
  onDeleted?: () => void;
  /** DI seams for tests. */
  requestImpl?: typeof requestAccountDeletion;
  clearToken?: () => Promise<void>;
  /** 'ios' | 'android'. Defaults to the running platform. */
  source?: "ios" | "android" | "unknown";
  testID?: string;
}

export function DangerZone({
  token,
  onDeleted,
  requestImpl = requestAccountDeletion,
  clearToken = () => secureTokenStore.clear(),
  source,
  testID = "danger-zone",
}: DangerZoneProps) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const platform: "ios" | "android" | "unknown" =
    source ?? (Platform.OS === "ios" || Platform.OS === "android" ? Platform.OS : "unknown");

  const onConfirm = async (): Promise<void> => {
    if (!token) return;
    setBusy(true);
    setError(null);
    const result = await requestImpl({ jwt: token, source: platform });
    if (!result.ok) {
      setBusy(false);
      setError("We couldn't start the deletion. Check your connection and try again.");
      return;
    }
    // Drop the session before navigating: the account is on its way out and
    // the push token for this install is already gone server-side.
    await clearToken();
    setBusy(false);
    setConfirming(false);
    onDeleted?.();
  };

  return (
    <View testID={testID} style={{ gap: 8 }}>
      <Text className="text-destructive text-lg font-semibold">Delete account</Text>
      <Text className="text-muted-foreground text-sm">
        This deletes your account and the data attached to it — training, nutrition, mind and
        everything you logged. You have {RESTORE_WINDOW_DAYS} days to change your mind using the link
        we email you. After that it cannot be undone.
      </Text>

      <Button
        testID="delete-account"
        variant="destructive"
        disabled={!token || busy}
        onPress={() => setConfirming(true)}
      >
        Delete account
      </Button>

      {error ? (
        <Text testID="delete-account-error" className="text-destructive text-xs">
          {error}
        </Text>
      ) : null}

      <Modal
        testID="delete-account-modal"
        visible={confirming}
        onClose={() => (busy ? undefined : setConfirming(false))}
        title="Delete your account?"
      >
        <Text className="text-muted-foreground text-sm mb-4">
          You will be signed out on this device and notifications will stop everywhere. We will email
          you a link that undoes this for the next {RESTORE_WINDOW_DAYS} days.
        </Text>
        <View style={{ gap: 8 }}>
          <Button
            testID="delete-account-confirm"
            variant="destructive"
            loading={busy}
            disabled={busy}
            onPress={() => {
              void onConfirm();
            }}
          >
            Yes, delete my account
          </Button>
          <Button
            testID="delete-account-cancel"
            variant="ghost"
            disabled={busy}
            onPress={() => setConfirming(false)}
          >
            Keep my account
          </Button>
        </View>
      </Modal>
    </View>
  );
}
