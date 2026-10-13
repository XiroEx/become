import { useEffect, useState } from "react";
import { Platform, View } from "react-native";
import { Text } from "@/components/Text";
import { Button } from "@/components/Button";
import {
  DELETION_COVERS,
  DELETION_EXCEPTIONS,
  RESTORE_WINDOW_DAYS,
} from "@become/core";
import {
  cancelAccountDeletion,
  getAccountDeletionStatus,
  requestAccountDeletion,
  type DeletionStatus,
} from "@/lib/account/deleteAccount";
import { sessionStore } from "@/lib/auth/secureStoreToken";
import { clearAll as clearAllLastKnownCache, setCacheMemberId } from "@/lib/cache/lastKnown";
import { clearAppBadge } from "@/lib/widgets/badge";

/**
 * Delete account, on the settings screen of both store builds.
 *
 * NP-304 brought this in line with the web's `DangerZone`
 * (`webapp/components/settings/DangerZone.tsx`): a bordered card, the same
 * shorter copy, the same six-item "what this deletes" list and the same
 * collapsible "What does not simply disappear" exceptions, an OUTLINED
 * (not filled) entry button, and the confirmation INLINE in the card rather
 * than a modal — `Cancel`, not `Keep my account` (that label stays for the
 * separate already-pending-deletion state below). `DELETION_COVERS` /
 * `DELETION_EXCEPTIONS` / `RESTORE_WINDOW_DAYS` come from `@become/core` so
 * the two surfaces cannot state different facts about the same feature.
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
  /** Called after the member keeps the account (cancel lands). The settings
   *  screen refetches notification prefs through it: the request latched
   *  `notificationsEnabled` false and cancelling does not undo it, so the
   *  switch must show the latched-off state. */
  onKept?: () => void;
  /** DI seams for tests. */
  requestImpl?: typeof requestAccountDeletion;
  cancelImpl?: typeof cancelAccountDeletion;
  statusImpl?: typeof getAccountDeletionStatus;
  /** Clears the app-icon badge (NP-067). Defaults to the real clear. */
  clearBadge?: () => Promise<void>;
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
  clearBadge = () => clearAppBadge(),
  clearToken = () => sessionStore.clear(),
  source,
  testID = "danger-zone",
}: DangerZoneProps) {
  const [confirming, setConfirming] = useState(false);
  const [exceptionsOpen, setExceptionsOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<DeletionStatus | null>(null);
  const [kept, setKept] = useState(false);

  const platform: "ios" | "android" | "unknown" =
    source ?? (Platform.OS === "ios" || Platform.OS === "android" ? Platform.OS : "unknown");

  // Read GET /api/me/account when Settings opens: a member who signs back in
  // during the window must see the scheduled date, not a fresh delete button.
  // A failed read leaves the request surface drawn — the server stays the
  // gate, and the surface must never vanish because a fetch blipped.
  useEffect(() => {
    let cancelled = false;
    if (!token) return;
    void (async () => {
      const result = await statusImpl({ jwt: token });
      if (!cancelled && result.ok) {
        setStatus(result.deletion);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [statusImpl, token]);

  const reloadStatus = async (): Promise<void> => {
    if (!token) return;
    const result = await statusImpl({ jwt: token });
    if (result.ok) {
      setStatus(result.deletion);
    }
  };

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
    // The icon badge is one member's unfinished day (NP-067): it must not
    // outlive the account, exactly like the cached dashboard data below.
    // Fire-and-forget — deletion must not wait on decoration, or fail with it.
    try {
      await clearBadge();
    } catch {
      /* ignore */
    }
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
    // Cancel posts ONLY { cancel: true }: the request latched
    // `notificationsEnabled` false and cancelling deliberately does not undo
    // it, so the member stays quiet until they turn the switch back on.
    const result = await cancelImpl({ jwt: token });
    if (!result.ok) {
      setBusy(false);
      setError("We couldn't keep your account. Check your connection and try again.");
      return;
    }
    await reloadStatus();
    setKept(true);
    setBusy(false);
    onKept?.();
  };

  const pending = status?.pending === true;

  const scheduledLabel = status?.restorableUntil
    ? new Date(status.restorableUntil).toLocaleDateString(undefined, {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : "the scheduled date";
  const daysLeft =
    typeof status?.daysLeft === "number" && status.daysLeft > 0
      ? ` — ${status.daysLeft} day${status.daysLeft === 1 ? "" : "s"} from now`
      : "";

  return (
    <View
      testID={testID}
      className="rounded-xl border border-destructive/30 bg-card"
      style={{ gap: 8, padding: 16 }}
    >
      <Text
        accessibilityRole="header"
        className="text-destructive text-lg font-semibold"
      >
        Delete account
      </Text>
      {pending ? (
        <>
          <Text testID="deletion-pending" className="text-muted-foreground text-sm">
            Your account is scheduled for deletion on{" "}
            <Text className="text-foreground text-sm font-semibold">{scheduledLabel}</Text>
            {daysLeft}. We emailed you a link that does the same thing as the button below.
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
            {busy ? "Working…" : "Keep my account"}
          </Button>
        </>
      ) : (
        <>
          {/* Web's shorter copy (NP-304): no mention of training / nutrition /
              mind by name here — those are itemised in the list below instead. */}
          <Text className="text-muted-foreground text-sm">
            This deletes your account and the data attached to it. You have{" "}
            {RESTORE_WINDOW_DAYS} days to change your mind — after that it cannot be undone.
          </Text>

          <View testID="delete-account-covers" style={{ gap: 2 }}>
            {DELETION_COVERS.map((line) => (
              <Text key={line} className="text-muted-foreground text-xs">
                {"• "}
                {line}
              </Text>
            ))}
          </View>

          <Button
            testID="delete-account-exceptions-toggle"
            variant="ghost"
            accessibilityHint={
              exceptionsOpen ? "Collapses the list" : "Expands the list"
            }
            onPress={() => setExceptionsOpen((open) => !open)}
          >
            What does not simply disappear
          </Button>
          {exceptionsOpen ? (
            <View testID="delete-account-exceptions" style={{ gap: 2 }}>
              {DELETION_EXCEPTIONS.map((line) => (
                <Text key={line} className="text-muted-foreground text-xs">
                  {"• "}
                  {line}
                </Text>
              ))}
            </View>
          ) : null}

          {confirming ? (
            <View style={{ gap: 8 }}>
              <Text
                testID="delete-confirm-prompt"
                className="text-foreground text-sm font-medium"
              >
                Delete your account? You will be signed out, and your devices stop getting
                notifications immediately.
              </Text>
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
                Cancel
              </Button>
            </View>
          ) : (
            <Button
              testID="delete-account"
              variant="destructive-outline"
              disabled={!token || busy}
              onPress={() => setConfirming(true)}
            >
              Delete account
            </Button>
          )}
          {kept ? (
            <Text testID="keep-account-notice" className="text-muted-foreground text-xs">
              Your account is safe. Notifications stay off until you turn them back on with the
              Push notifications switch above.
            </Text>
          ) : null}
        </>
      )}

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
    </View>
  );
}
