/**
 * The dismissible Home push card (NP-065).
 *
 * For members who have not decided: the OS permission is still undetermined
 * and the 30-day dismissal (the web's `NotificationOptIn` TTL) has expired or
 * was never set. A short in-app explanation sits behind the ask — the OS
 * prompt fires only from the explicit "Turn on" tap, never at first launch
 * and never from this card mounting.
 *
 * Denied members get the reminder cadence, not this card: the OS will not
 * show its dialog again, so the only lever is a nudge toward Settings (first
 * 7 days after denial, then monthly — `webapp/lib/push/reprompt.ts`).
 */

import { useCallback, useEffect, useState } from "react";
import { Linking, Pressable, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Text } from "@/components/Text";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";
import { minTouchTarget } from "@/lib/a11y/touchTarget";
import {
  DENIAL_REPROMPT_DELAY_MS,
  DENIAL_REPROMPT_INTERVAL_MS,
} from "@/lib/push/reprompt";

/** 30 days — the web's `NotificationOptIn` dismissal TTL, verbatim. */
export const PUSH_CARD_DISMISS_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export const PUSH_CARD_DISMISSED_AT_KEY = "become.push.card_dismissed_at";
export const PUSH_CARD_DENIED_AT_KEY = "become.push.denied_at";
export const PUSH_CARD_REPROMPT_SHOWN_AT_KEY = "become.push.reprompt_shown_at";

export type PushCardMode = "opt-in" | "denied";

export interface PushCardState {
  permission: "granted" | "denied" | "undetermined" | "unknown";
  dismissedAt: number | null;
  deniedAt: number | null;
  repromptShownAt: number | null;
}

export function parseStoredTimestamp(value: string | null): number | null {
  if (!value) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
}

/** Idempotent: the FIRST observed denial wins, anchoring the cadence. */
export function resolveDeniedAt(stored: string | null, now: number): number {
  return parseStoredTimestamp(stored) ?? now;
}

/**
 * Whether the denied-permission reminder should show right now: first 7 days
 * after the denial, then once a month while permission stays denied.
 */
export function shouldShowDeniedReprompt(
  deniedAt: number,
  lastShownAt: number | null,
  now: number,
): boolean {
  if (!Number.isFinite(deniedAt) || deniedAt <= 0) return false;
  if (now - deniedAt < DENIAL_REPROMPT_DELAY_MS) return false;
  if (lastShownAt === null) return true;
  if (lastShownAt > now) return true;
  return now - lastShownAt >= DENIAL_REPROMPT_INTERVAL_MS;
}

/**
 * Whether the opt-in card should show: permission undecided and no fresh
 * dismissal. Granted / denied are owned elsewhere (sync / reprompt).
 */
export function shouldShowOptInCard(
  permission: PushCardState["permission"],
  dismissedAt: number | null,
  now: number,
): boolean {
  if (permission !== "undetermined") return false;
  if (dismissedAt === null) return true;
  if (dismissedAt > now) return true;
  return now - dismissedAt >= PUSH_CARD_DISMISS_TTL_MS;
}

export interface PushOptInCardDeps {
  readState?: () => Promise<PushCardState>;
  dismiss?: () => Promise<void>;
  enable?: () => Promise<{ kind: string }>;
  openSettings?: () => Promise<void>;
  now?: () => number;
}

export interface PushOptInCardProps {
  deps?: PushOptInCardDeps;
  testID?: string;
}

async function defaultReadState(): Promise<PushCardState> {
  let permission: PushCardState["permission"] = "unknown";
  try {
    const Notifications = await import("expo-notifications");
    const res = await Notifications.getPermissionsAsync();
    permission = res.granted
      ? "granted"
      : res.canAskAgain === false
        ? "denied"
        : "undetermined";
  } catch {
    permission = "unknown";
  }
  let dismissedAt: number | null = null;
  let deniedAt: number | null = null;
  let repromptShownAt: number | null = null;
  try {
    const [dismissed, denied, reprompt] = await Promise.all([
      AsyncStorage.getItem(PUSH_CARD_DISMISSED_AT_KEY),
      AsyncStorage.getItem(PUSH_CARD_DENIED_AT_KEY),
      AsyncStorage.getItem(PUSH_CARD_REPROMPT_SHOWN_AT_KEY),
    ]);
    dismissedAt = parseStoredTimestamp(dismissed);
    deniedAt = parseStoredTimestamp(denied);
    repromptShownAt = parseStoredTimestamp(reprompt);
  } catch {
    /* storage is best-effort; an unreadable dismissal reads as "never" */
  }
  return { permission, dismissedAt, deniedAt, repromptShownAt };
}

export function PushOptInCard({
  deps,
  testID = "push-opt-in-card",
}: PushOptInCardProps): React.JSX.Element | null {
  const { colors } = useThemeTokens();
  const [mode, setMode] = useState<PushCardMode | null>(null);
  const [busy, setBusy] = useState(false);
  const now = deps?.now ?? Date.now;

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const state = deps?.readState
        ? await deps.readState()
        : await defaultReadState();
      if (cancelled) return;
      const at = now();
      if (state.permission === "undetermined") {
        if (shouldShowOptInCard(state.permission, state.dismissedAt, at)) {
          setMode("opt-in");
        }
        return;
      }
      if (state.permission === "denied") {
        const deniedAt = state.deniedAt ?? at;
        if (shouldShowDeniedReprompt(deniedAt, state.repromptShownAt, at)) {
          try {
            await AsyncStorage.setItem(
              PUSH_CARD_REPROMPT_SHOWN_AT_KEY,
              String(at),
            );
          } catch {
            /* best-effort */
          }
          setMode("denied");
        }
      }
    })().catch(() => {
      /* a card may never take the screen with it */
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onDismiss = useCallback(() => {
    void (async () => {
      if (deps?.dismiss) {
        await deps.dismiss();
      } else {
        try {
          await AsyncStorage.setItem(
            PUSH_CARD_DISMISSED_AT_KEY,
            String(now()),
          );
        } catch {
          /* best-effort */
        }
      }
      setMode(null);
    })().catch(() => setMode(null));
  }, [deps, now]);

  const onEnable = useCallback(() => {
    if (!deps?.enable) return;
    setBusy(true);
    void deps
      .enable()
      .then(() => setMode(null))
      .catch(() => setBusy(false))
      .finally(() => setBusy(false));
  }, [deps]);

  const onOpenSettings = useCallback(() => {
    void (async () => {
      try {
        if (deps?.openSettings) await deps.openSettings();
        else await Linking.openSettings();
      } catch {
        /* a Settings link that fails does not take the screen with it */
      }
    })();
  }, [deps]);

  if (mode === null) return null;

  if (mode === "denied") {
    return (
      <Card testID={testID} accessibilityLabel="Notifications are off">
        <Text className="text-foreground text-base font-semibold">
          Notifications are off
        </Text>
        <Text className="text-muted-foreground text-sm">
          Turn Become back on in Settings to get workout reminders and streak
          alerts.
        </Text>
        <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
          <Button
            testID={`${testID}-settings`}
            variant="secondary"
            size="sm"
            onPress={onOpenSettings}
            accessibilityHint="Opens the Settings app at Become's permissions"
          >
            Open Settings
          </Button>
          <Pressable
            testID={`${testID}-dismiss`}
            accessibilityRole="button"
            accessibilityLabel="Dismiss notifications reminder"
            onPress={onDismiss}
            style={[
              minTouchTarget,
              { justifyContent: "center", paddingHorizontal: 12 },
            ]}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={{ color: colors["muted-foreground"] }}>Not now</Text>
          </Pressable>
        </View>
      </Card>
    );
  }

  return (
    <Card testID={testID} accessibilityLabel="Turn on notifications">
      <Text className="text-foreground text-base font-semibold">
        Never miss a workout
      </Text>
      <Text className="text-muted-foreground text-sm">
        Become can remind you when it is time to train and warn you before
        your streak breaks. You can turn this off anytime in Settings.
      </Text>
      <View style={{ flexDirection: "row", gap: 8, marginTop: 12 }}>
        <Button
          testID={`${testID}-enable`}
          size="sm"
          onPress={onEnable}
          disabled={busy || !deps?.enable}
        >
          {busy ? "Turning on…" : "Turn on"}
        </Button>
        <Pressable
          testID={`${testID}-dismiss`}
          accessibilityRole="button"
          accessibilityLabel="Dismiss notifications prompt"
          onPress={onDismiss}
          style={[
            minTouchTarget,
            { justifyContent: "center", paddingHorizontal: 12 },
          ]}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={{ color: colors["muted-foreground"] }}>Not now</Text>
        </Pressable>
      </View>
    </Card>
  );
}
