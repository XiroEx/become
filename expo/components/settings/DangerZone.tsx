import { useCallback, useState } from "react";
import { Platform, Text, View } from "react-native";
import { Button } from "@/components/Button";
import { Modal } from "@/components/Modal";
import {
  requestAccountDeletion,
  type DeletionSource,
  type DeletionStatus,
} from "@/lib/account/deleteAccount";
import type { TokenStore } from "@/lib/auth/secureStoreToken";

/**
 * THE DELETE-ACCOUNT CONTROL IN THE STORE BUILDS.
 *
 * Apple App Review 5.1.1(v) is checked by a human: they sign in, open Settings,
 * and look for a way to delete the account without leaving the app and without
 * being told to send an email. So this sits on the Settings screen itself, at
 * the bottom where a danger zone belongs, and the whole path is TWO TAPS:
 * "Delete account", then "Delete my account" in the dialog.
 *
 * Two, not one: one tap would let a thumb destroy a training history. Two, not
 * four: making somebody retype their email reads as an obstacle, and an
 * obstacle is exactly what the guideline forbids. What makes two taps safe is
 * the seven-day undo window, not a third confirmation.
 *
 * `Platform.OS` is sent as the source so an iOS review deletion and an Android
 * one are told apart in the server's audit line. The presentational half takes
 * every dependency by prop so the dialog can be driven in a test without a
 * network, a keychain or a device.
 */

export interface DangerZoneProps {
  /** The signed-in member's JWT. Absent → the section renders disabled. */
  jwt: string | null;
  /** Called after a successful request, once the device has been signed out. */
  onDeleted?: () => void;
  /** DI for tests. */
  fetchImpl?: typeof fetch;
  tokenStore?: TokenStore;
  source?: DeletionSource;
  baseUrl?: string;
}

function platformSource(): DeletionSource {
  return Platform.OS === "android" ? "android" : "ios";
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export function DangerZone({
  jwt,
  onDeleted,
  fetchImpl,
  tokenStore,
  source,
  baseUrl,
}: DangerZoneProps) {
  const [confirming, setConfirming] = useState<boolean>(false);
  const [busy, setBusy] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<DeletionStatus | null>(null);

  const confirm = useCallback(async () => {
    if (!jwt) return;
    setBusy(true);
    setError(null);
    const result = await requestAccountDeletion({
      jwt,
      source: source ?? platformSource(),
      ...(fetchImpl ? { fetchImpl } : {}),
      ...(tokenStore ? { tokenStore } : {}),
      ...(baseUrl ? { baseUrl } : {}),
    });
    setBusy(false);
    if (!result.ok || !result.deletion) {
      setError(
        "We could not start the deletion. Nothing has changed — please try again.",
      );
      return;
    }
    setConfirming(false);
    setDone(result.deletion);
    onDeleted?.();
  }, [jwt, source, fetchImpl, tokenStore, baseUrl, onDeleted]);

  return (
    <View testID="danger-zone" style={{ gap: 8 }}>
      <Text className="text-destructive text-2xl font-bold mt-2">
        Danger zone
      </Text>

      {done ? (
        <Text testID="deletion-scheduled" className="text-foreground text-sm">
          Your account is scheduled for deletion on{" "}
          {formatDate(done.scheduledPurgeAt)}. You have been signed out, every
          notification has stopped, and we have emailed you a link that undoes
          this if you change your mind.
        </Text>
      ) : (
        <>
          <Text className="text-muted-foreground text-sm">
            Deleting your account removes your profile, training, nutrition and
            mind history, and stops every notification straight away. You have
            seven days to change your mind before it becomes permanent. Cancel
            any paid plan first so a renewal is not charged in the meantime.
          </Text>
          <Button
            testID="delete-account"
            variant="destructive"
            onPress={() => setConfirming(true)}
            disabled={!jwt}
            accessibilityLabel="Delete account"
          >
            Delete account
          </Button>
        </>
      )}

      {error ? (
        <Text testID="danger-zone-error" className="text-destructive text-sm">
          {error}
        </Text>
      ) : null}

      <Modal
        visible={confirming}
        onClose={() => setConfirming(false)}
        title="Delete your account?"
        testID="delete-account-dialog"
      >
        <View style={{ gap: 8 }}>
          <Text className="text-muted-foreground text-sm">
            You will be signed out on this device straight away, and every push
            notification on your account stops immediately.
          </Text>
          <Text className="text-muted-foreground text-sm">
            Your data is held for seven days and then erased permanently. We
            will email you a link that undoes this at any point before then.
          </Text>
          <Button
            testID="delete-account-confirm"
            variant="destructive"
            onPress={() => {
              void confirm();
            }}
            loading={busy}
            accessibilityLabel="Delete my account"
          >
            Delete my account
          </Button>
          <Button
            testID="delete-account-cancel"
            variant="ghost"
            onPress={() => setConfirming(false)}
            disabled={busy}
            accessibilityLabel="Keep my account"
          >
            Keep my account
          </Button>
        </View>
      </Modal>
    </View>
  );
}
