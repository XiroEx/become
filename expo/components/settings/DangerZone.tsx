import { useEffect, useState } from "react";
import { Platform, View } from "react-native";
import { Text } from "@/components/Text";
import { Button } from "@/components/Button";
import { Modal } from "@/components/Modal";
import {
  RESTORE_WINDOW_DAYS,
  cancelAccountDeletion,
  getAccountDeletionStatus,
  requestAccountDeletion,
  type DeletionStatus,
} from "@/lib/account/deleteAccount";
import { sessionStore } from "@/lib/auth/secureStoreToken";
import { clearAll as clearAllLastKnownCache, setCacheMemberId } from "@/lib/cache/lastKnown";

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
 * THE STATE IN BETWEEN (web parity: webapp/components/settings/DangerZone.tsx).
 * Requesting deletion signs every device out, but a member who signs back in
 * during the 7-day window still has a working session — and this section reads
 * `GET /api/me/account` when it mounts so it shows "Deletion scheduled for
 * <date>" with "Keep my account" instead of the delete button again. Keeping
 * the account POSTs `{ cancel: true }` and re-reads the status. Cancelling
 * does NOT turn notifications back on: the request latched
 * `notificationsEnabled` false server-side, so the copy below points the
 * member at the notification switch (NP-068) after they keep the account.
 *
 * Everything that talks to the network or to the Keychain is injectable, so
 * this renders and behaves in jest without a device.
 */
export interface DangerZoneProps {
  /** Session JWT. Absent → the section renders, disabled, rather than vanishing. */
  token?: string | null;
  /** Called after a successful request, once the stored token is cleared. */
  onDeleted?: () => void;
  /** Called after a successful cancel, so the screen can refresh dependent state (NP-068 switch). */
  onKept?: () => void;
  /** DI seams for tests. */
  requestImpl?: typeof requestAccountDeletion;
  cancelImpl?: typeof cancelAccountDeletion;
  statusImpl?: typeof getAccountDeletionStatus;
  /**
   * Drops the session. Omitted → `sessionStore` (`become.session`), named
   * explicitly so this can only ever clear the session key.
   */
  clearToken?: () => Promise<void>;
  /** 'ios' | 'android'. Defaults to the running platform. */
  source?: "ios" | "android" | "unknown";
  testID?: string;
}

export function DangerZone({
  token,
  onDeleted,
  onKept,
  requestImpl = requestAccountDeletion,
  cancelImpl = cancelAccountDeletion,
  statusImpl = getAccountDeletionStatus,
  clearToken = () => sessionStore.clear(),
  source,
  testID = "danger-zone",
}: DangerZoneProps) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<DeletionStatus | null>(null);
  const [kept, setKept] = useState(false);

  const platform: "ios" | "android" | "unknown" =
    source ?? (Platform.OS === "ios" || Platform.OS === "android" ? Platform.OS : "unknown");

  // Read the pending state when Settings opens (or the session changes). A
  // failed read leaves the delete button drawn with the server as the gate —
  // the surface must never vanish because a fetch blipped. The effect syncs
  // from outside React (the network + the session token), not from render
  // state — the setState below answers that callback, not the render.
  useEffect(() => {
    if (!token) return;
    let alive = true;
    void statusImpl({ jwt: token })
      .then((result) => {
        if (!alive || !result.ok) return;
        setStatus(result.status.deletion);
      })
      .catch(() => {
        // ignore: the delete button stays drawn, the server stays the gate.
      });
    return () => {
      alive = false;
    };
  }, [token, statusImpl]);

  const onConfirm = async (): Promise<void> => {
    if (!token) return;
    setBusy(true);
    setError(null);
    setKept(false);
    const result = await requestImpl({ jwt: token, source: platform });
    if (!result.ok) {
      setBusy(false);
      setError("We couldn't start the deletion. Check your connection and try again.");
      return;
    }
    // Drop the session before navigating: the account is on its way out and
    // the push token for this install is already gone server-side.
    await clearToken();
    try {
      await clearAllLastKnownCache();
    } catch {
      /* ignore */
    }
    setCacheMemberId(null);
    setBusy(false);
    setConfirming(false);
    onDeleted?.();
  };

  const onKeep = async (): Promise<void> => {
    if (!token) return;
    setBusy(true);
    setError(null);
    const result = await cancelImpl({ jwt: token });
    if (!result.ok) {
      setBusy(false);
      setError("We couldn't keep your account. Check your connection and try again.");
      return;
    }
    // Re-read: the server answers the cancel with the cleared status, and the
    // section must show the delete button again — not a stale pending date.
    // The notice below renders regardless of what the re-read answers: the
    // account was kept, and notifications stayed off (the request latched
    // `notificationsEnabled` false and cancelling does not undo it).
    try {
      const refreshed = await statusImpl({ jwt: token });
      if (refreshed.ok) setStatus(refreshed.status.deletion);
      else setStatus(null);
    } catch {
      setStatus(null);
    }
    setBusy(false);
    setKept(true);
    onKept?.();
  };

  const pending = status?.pending === true;

  function formatDeletionDate(iso: string | null): string {
    if (!iso) return "the scheduled date";
    const parsed = new Date(iso);
    if (Number.isNaN(parsed.getTime())) return "the scheduled date";
    return parsed.toLocaleDateString(undefined, {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  }

  return (
    <View testID={testID} style={{ gap: 8 }}>
      <Text
        accessibilityRole="header"
        className="text-destructive text-lg font-semibold"
      >
        Delete account
      </Text>
      {pending ? (
        <>
          <Text testID="deletion-pending" className="text-muted-foreground text-sm">
            Deletion scheduled for {formatDeletionDate(status?.restorableUntil ?? null)}
            {status && status.daysLeft > 0
              ? ` — ${status.daysLeft} day${status.daysLeft === 1 ? "" : "s"} left`
              : ""}
            . We emailed you a link that does the same thing as the button below.
          </Text>
          <Button
            testID="keep-my-account"
            variant="secondary"
            disabled={!token || busy}
            loading={busy}
            onPress={() => {
              void onKeep();
            }}
          >
            Keep my account
          </Button>
        </>
      ) : (
        <>
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
        </>
      )}

      {kept ? (
        <Text
          testID="keep-account-notice"
          className="text-muted-foreground text-xs"
        >
          Your account is safe. Notifications stayed off after the deletion request — turn them back
          on with the notification switch above if you want them.
        </Text>
      ) : null}

      {error ? (
        <Text
          testID="delete-account-error"
          accessibilityRole="alert"
          accessibilityLiveRegion="assertive"
          className="text-destructive text-xs"
        >
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
