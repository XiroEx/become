import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState, Linking, View, ScrollView, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useFocusEffect } from "expo-router";
import Constants from "expo-constants";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  ConsentStatusSchema,
  NotificationPreferencesResponseSchema,
  type NotificationPreferenceKey,
} from "@become/api-client";
import {
  AI_PROVIDER,
  AI_PROVIDER_ROUTE,
  AI_CONSENT_SENDS,
  HEALTH_DISCLAIMER_SHORT,
  LEGAL_CONTACT_EMAIL,
  LEGAL_DELETION_DAYS,
} from "@become/core";
import { Text } from "@/components/Text";
import { Button } from "@/components/Button";
import { Toggle } from "@/components/Toggle";
import { DangerZone } from "@/components/settings/DangerZone";
import { BiometricUnlockSection } from "@/components/settings/BiometricUnlockSection";
import { FeedbackSheet } from "@/components/settings/FeedbackSheet";
import { ProfileSettingsScreen } from "@/components/profile/ProfileSettingsScreen";
import { TrainingPreferencesScreen } from "@/components/settings/TrainingPreferences";
import { NutritionPlanningSection } from "@/components/settings/NutritionPlanningSection";
import { BillingSection } from "@/components/billing/BillingSection";
import { LegalLinks, LEGAL_BASE_URL } from "@/components/legal/LegalLinks";
import { ScreenState } from "@/components/ScreenState";
import { useAuth } from "@/lib/auth/useAuth";
import { useFetch } from "@/lib/hooks/useFetch";
import { WEBAPP_BASE_URL } from "@/lib/config";
import {
  defaultPushDeps,
  enablePushFromExplicitAction,
  ensurePushRegistration,
} from "@/lib/push/nativePush";
import {
  PUSH_CARD_DENIED_AT_KEY,
  PUSH_CARD_REPROMPT_SHOWN_AT_KEY,
  parseStoredTimestamp,
  resolveDeniedAt,
} from "@/lib/push/denialReminder";
import {
  applyNotificationPrefDefaults,
  buildNotifPrefPatch,
  nativeNotifStatusDescription,
  resolveNativeNotifAction,
  resolveNativeNotifStatus,
  visibleNotificationToggles,
  type NativeNotifPermission,
} from "@/lib/settings/notificationPreferences";
import { shouldShowDeniedRepromptAt } from "@/lib/push/reprompt";
import { defaultBrowserLauncher } from "@/lib/programs/browserLauncher";
import { openWebSignedIn } from "@/lib/web/openWebSignedIn";
import { minTouchTarget } from "@/lib/a11y/touchTarget";
import { ChevronLeft, ChevronRight, ExternalLink } from "lucide-react-native";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";

/**
 * Native Settings screen. NP-302 added the web's Profile / Training /
 * Settings segmented tabs (`webapp/app/dashboard/settings/page.tsx`):
 *
 *   - Profile: `ProfileSettingsScreen` embedded — Account (name/email), Body
 *     Stats, pace and Save Changes, then Health sync as the native extra.
 *   - Training: `TrainingPreferencesScreen` embedded — Fitness Goals,
 *     Experience & Schedule, Equipment & Injuries.
 *   - Settings: Account (sign out, admin tools, Plan), Security (NP-187),
 *     Notifications (NP-068), AI features (NP-046), Nutrition Planning
 *     (moved here from the Training tab to match the web), Legal & support,
 *     and Delete account at the bottom (two taps away).
 *
 * The tab bar defaults to "Settings" — the screen's original content — so
 * every existing deep link and test that opens Settings still lands on
 * exactly what it always has; Profile and Training are additions reachable
 * by tapping their tab, the fix for "native Settings has no Profile/Training
 * tab and the editor in profile/health.tsx is unreachable."
 */
export interface SettingsNotifDeps {
  /** OS permission probe. Defaults to NP-065's `defaultPushDeps` reader. */
  getPermission?: () => Promise<NativeNotifPermission>;
  /** Explicit enable (NP-065's flow, WITH `reenable: true`). */
  enablePush?: (jwt: string) => Promise<{ kind: string }>;
  /** Silent re-register of this device (no `reenable`). */
  repairPush?: (jwt: string) => Promise<{ kind: string }>;
  /** Open the OS Settings app at Become's permissions. */
  openSettings?: () => Promise<void>;
}

async function defaultGetPermission(): Promise<NativeNotifPermission> {
  const Notifications = await import("expo-notifications");
  const res = await Notifications.getPermissionsAsync();
  if (res.granted) return "granted";
  return res.canAskAgain === false ? "denied" : "undetermined";
}

export default function SettingsScreen({
  notifDeps,
}: {
  notifDeps?: SettingsNotifDeps;
} = {}) {
  const { colors } = useThemeTokens();
  const router = useRouter();
  const { token, user, logout } = useAuth();
  const [signingOut, setSigningOut] = useState(false);
  // NP-302: Profile / Training / Settings, defaulting to "settings" (the
  // screen's original, still-reachable content) so every existing deep link
  // and test lands exactly where it always has.
  const [activeTab, setActiveTab] = useState<"profile" | "training" | "settings">(
    "settings",
  );
  // The DI seam (PushOptInCard's `deps` pattern): unit tests never import
  // `expo-notifications` (no native module under Jest — even a dynamic
  // `import()` throws without --experimental-vm-modules), so they inject
  // `notifDeps`. Production uses the defaults below.
  const depsRef = useRef(notifDeps);
  // Keep the seam current without writing the ref during render.
  useEffect(() => {
    depsRef.current = notifDeps;
  }, [notifDeps]);

  const fetchOpts = {
    baseUrl: WEBAPP_BASE_URL,
    getToken: () => token ?? undefined,
    skip: !token,
    useCache: true,
  };

  const consent = useFetch("/api/me/consent", ConsentStatusSchema, fetchOpts);
  const notifPrefs = useFetch(
    "/api/notifications/preferences",
    NotificationPreferencesResponseSchema,
    fetchOpts,
  );

  const hasData = !!(consent.data || notifPrefs.data || user);
  const fetchError = consent.error || notifPrefs.error;
  const initialLoading = (consent.loading || notifPrefs.loading) && !hasData;

  const onRetry = useCallback(async () => {
    await Promise.all([consent.refetch(), notifPrefs.refetch()]);
  }, [consent, notifPrefs]);

  // Notifications (NP-068) state — the web's section, ported to the OS
  // permission: status from permission + master switch + whether this
  // device's token is registered; "Enable"/"Turn on" run NP-065's explicit
  // flow; "Turn off" unsubscribes account-wide (no endpoint); denied members
  // get a button to iOS Settings plus the web's reminder cadence.
  const [savingNotif, setSavingNotif] = useState(false);
  const [notifPermission, setNotifPermission] =
    useState<NativeNotifPermission>("undetermined");
  const [deviceRegistered, setDeviceRegistered] = useState<boolean | null>(null);
  const [repairing, setRepairing] = useState(false);
  const [enablingNotif, setEnablingNotif] = useState(false);
  const [disablingNotif, setDisablingNotif] = useState(false);
  const [deniedReminderVisible, setDeniedReminderVisible] = useState(false);
  const [togglingKey, setTogglingKey] = useState<NotificationPreferenceKey | null>(null);
  const [optimisticPrefs, setOptimisticPrefs] = useState<Partial<
    Record<NotificationPreferenceKey, boolean>
  > | null>(null);
  const permissionProbeInFlight = useRef(false);
  const notificationsEnabled = notifPrefs.data?.notificationsEnabled !== false;
  const emailEngagement = notifPrefs.data?.emailEngagement !== false;
  const storedPrefs = useMemo(
    () =>
      applyNotificationPrefDefaults(
        notifPrefs.data?.preferences as
          | Partial<Record<NotificationPreferenceKey, boolean>>
          | undefined,
      ),
    // The preferences object identity follows the fetch result.
    [notifPrefs.data],
  );
  const notifPrefsView = useMemo(
    () => ({ ...storedPrefs, ...(optimisticPrefs ?? {}) }),
    [storedPrefs, optimisticPrefs],
  );
  const notifStatus = resolveNativeNotifStatus({
    permission: notifPermission,
    notificationsEnabled,
    deviceRegistered,
  });
  const notifAction = resolveNativeNotifAction({
    permission: notifPermission,
    notificationsEnabled,
    deviceRegistered,
  });
  // NP-303: the web shows only the status row until permission is granted
  // AND notifications are on; native used to show the per-type switches (and
  // a master switch the web does not have) regardless of permission, even
  // while the status read "Not enabled".
  const notifReady = notifPermission === "granted" && notificationsEnabled;

  const probeNotifPermission = useCallback(async () => {
    if (permissionProbeInFlight.current) return;
    permissionProbeInFlight.current = true;
    try {
      const getPermission =
        depsRef.current?.getPermission ?? defaultGetPermission;
      const next = await getPermission();
      setNotifPermission(next);
      if (next === "denied") {
        // Idempotent: the FIRST observed denial anchors the cadence, so the
        // 7-day/monthly reminder counts from when the member said no.
        try {
          const stored = await AsyncStorage.getItem(PUSH_CARD_DENIED_AT_KEY);
          if (parseStoredTimestamp(stored) === null) {
            await AsyncStorage.setItem(PUSH_CARD_DENIED_AT_KEY, String(Date.now()));
          }
        } catch {
          /* storage is best-effort */
        }
      }
      if (next === "granted" && token) {
        // "Granted" only means the member said yes once — reconcile whether
        // this device still holds a working subscription, like the web's
        // `ensurePushSubscription` does on load.
        try {
          const repairPush =
            depsRef.current?.repairPush ??
            (async (jwt: string) => {
              const outcome = await ensurePushRegistration(
                defaultPushDeps({ jwt }),
              );
              return { kind: outcome.kind };
            });
          const outcome = await repairPush(token);
          setDeviceRegistered(
            outcome.kind !== "failed" && outcome.kind !== "no-permission",
          );
        } catch {
          setDeviceRegistered(false);
        }
      } else if (next !== "granted") {
        setDeviceRegistered(null);
      }
    } catch {
      /* a permission probe may never take Settings with it */
    } finally {
      permissionProbeInFlight.current = false;
    }
  }, [token]);

  // Re-probe when the screen gains focus: the member may have flipped the
  // switch in iOS Settings and come back.
  useFocusEffect(
    useCallback(() => {
      void probeNotifPermission();
    }, [probeNotifPermission]),
  );

  // Foreground returns re-probe too, for the same reason.
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (status) => {
      if (status === "active") void probeNotifPermission();
    });
    return () => subscription.remove();
  }, [probeNotifPermission]);

  // NP-238: the Settings tab stays mounted across navigations (expo-router
  // tabs do not remount on focus), so without this the per-type switches and
  // the "Streak and milestone emails" toggle keep showing whatever
  // `notifPrefs` held at the LAST mount — stale against a change made on the
  // web (same account, same backend) or an earlier native session. Re-read on
  // focus and on foreground return, exactly like the other list screens
  // ("coming back from the web ... must not paint a stale value"). Gated on
  // `token`: `refetch` (= useFetch's `run`) does not itself honor `skip`, so
  // calling it while signed out would fire an unauthenticated request.
  const refetchNotifPrefs = notifPrefs.refetch;
  useFocusEffect(
    useCallback(() => {
      if (!token) return;
      void refetchNotifPrefs();
    }, [refetchNotifPrefs, token]),
  );
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (status) => {
      if (status === "active" && token) void refetchNotifPrefs();
    });
    return () => subscription.remove();
  }, [refetchNotifPrefs, token]);

  // The denied-permission reminder, on the web's cadence (7 days, then
  // monthly): the OS will not show its dialog again, so the only lever is a
  // nudge toward Settings.
  useEffect(() => {
    // The visible flag only matters while permission is denied (the render
    // gates on both), so there is nothing to reset when it flips away.
    if (notifPermission !== "denied") return;
    let cancelled = false;
    void (async () => {
      try {
        const [deniedRaw, shownRaw] = await Promise.all([
          AsyncStorage.getItem(PUSH_CARD_DENIED_AT_KEY),
          AsyncStorage.getItem(PUSH_CARD_REPROMPT_SHOWN_AT_KEY),
        ]);
        const now = Date.now();
        const deniedAt = resolveDeniedAt(deniedRaw, now);
        const lastShownAt = parseStoredTimestamp(shownRaw);
        if (cancelled) return;
        if (shouldShowDeniedRepromptAt(deniedAt, lastShownAt, now)) {
          try {
            await AsyncStorage.setItem(
              PUSH_CARD_REPROMPT_SHOWN_AT_KEY,
              String(now),
            );
          } catch {
            /* best-effort */
          }
          if (!cancelled) setDeniedReminderVisible(true);
        } else {
          if (!cancelled) setDeniedReminderVisible(false);
        }
      } catch {
        /* storage failure hides the reminder, never the section */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [notifPermission]);

  const onEnableNotifications = useCallback(async () => {
    if (!token) return;
    setEnablingNotif(true);
    try {
      const enablePush =
        depsRef.current?.enablePush ??
        (async (jwt: string) =>
          enablePushFromExplicitAction(defaultPushDeps({ jwt })));
      const result = await enablePush(token);
      await probeNotifPermission();
      if (result.kind === "registered" || result.kind === "already-registered") {
        setDeviceRegistered(true);
      } else if (result.kind === "no-permission") {
        setDeviceRegistered(null);
      } else {
        setDeviceRegistered(false);
      }
      await notifPrefs.refetch();
    } catch {
      /* the toggle below still reflects the server */
    } finally {
      setEnablingNotif(false);
    }
  }, [notifPrefs, probeNotifPermission, token]);

  const onRepairNotifications = useCallback(async () => {
    if (!token) return;
    setRepairing(true);
    try {
      const repairPush =
        depsRef.current?.repairPush ??
        (async (jwt: string) => {
          const outcome = await ensurePushRegistration(
            defaultPushDeps({ jwt }),
          );
          return { kind: outcome.kind };
        });
      const outcome = await repairPush(token);
      const ok =
        outcome.kind !== "failed" && outcome.kind !== "no-permission";
      setDeviceRegistered(ok);
    } catch {
      setDeviceRegistered(false);
    } finally {
      setRepairing(false);
    }
  }, [token]);

  const onOpenSystemSettings = useCallback(() => {
    void (async () => {
      try {
        if (depsRef.current?.openSettings) {
          await depsRef.current.openSettings();
        } else {
          await Linking.openSettings();
        }
      } catch {
        /* a Settings link that fails does not take the screen with it */
      }
    })();
  }, []);

  const onToggleNotifPref = useCallback(
    async (key: NotificationPreferenceKey, value: boolean) => {
      if (!token) return;
      const previous = notifPrefsView[key];
      setTogglingKey(key);
      setOptimisticPrefs((prev) => ({ ...(prev ?? {}), [key]: value }));
      try {
        const res = await fetch(
          `${WEBAPP_BASE_URL}/api/notifications/preferences`,
          {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify(buildNotifPrefPatch(key, value)),
          },
        );
        if (!res.ok) throw new Error("PATCH failed");
        setOptimisticPrefs((prev) => {
          if (!prev) return prev;
          const next = { ...prev };
          delete next[key];
          return Object.keys(next).length > 0 ? next : null;
        });
        await notifPrefs.refetch();
      } catch {
        // Revert the optimistic flip so the switch never lies.
        setOptimisticPrefs((prev) => ({ ...(prev ?? {}), [key]: previous }));
      } finally {
        setTogglingKey(null);
      }
    },
    [notifPrefs, notifPrefsView, token],
  );

  const onToggleEmail = useCallback(
    async (value: boolean) => {
      if (!token) return;
      setSavingNotif(true);
      try {
        await fetch(`${WEBAPP_BASE_URL}/api/notifications/preferences`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ emailEngagement: value }),
        });
        await notifPrefs.refetch();
      } catch {
        // ignore network error
      } finally {
        setSavingNotif(false);
      }
    },
    [notifPrefs, token],
  );

  const onToggleNotifications = useCallback(
    async (value: boolean) => {
      if (!token) return;
      if (!value) {
        // Turning notifications off is account-wide: drop every device's
        // subscription and flip the master switch (no endpoint), so
        // background registration can never silently recreate one.
        setDisablingNotif(true);
        try {
          await fetch(`${WEBAPP_BASE_URL}/api/notifications/unsubscribe`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({}),
          });
          setDeviceRegistered(null);
          await notifPrefs.refetch();
        } catch {
          // ignore
        } finally {
          setDisablingNotif(false);
        }
        return;
      }
      // Explicit "Turn on": NP-065's flow — request the OS permission when
      // undecided, then register the raw device token WITH `reenable: true`,
      // the only path allowed to clear a prior opt-out server-side.
      await onEnableNotifications();
    },
    [notifPrefs, onEnableNotifications, token],
  );

  // AI features (NP-046) state
  const [savingAi, setSavingAi] = useState(false);
  const [optimisticAi, setOptimisticAi] = useState<boolean | null>(null);
  const aiAllowed = optimisticAi ?? (consent.data?.ai?.granted === true);
  const aiProvider = consent.data?.ai?.provider ?? AI_PROVIDER;

  const onToggleAi = useCallback(
    async (value: boolean) => {
      if (!token) return;
      setSavingAi(true);
      setOptimisticAi(value);
      try {
        if (value) {
          await fetch(`${WEBAPP_BASE_URL}/api/me/ai-consent`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ accepted: true, source: "settings" }),
          });
        } else {
          await fetch(`${WEBAPP_BASE_URL}/api/me/ai-consent`, {
            method: "DELETE",
            headers: {
              Authorization: `Bearer ${token}`,
            },
          });
        }
        await consent.refetch();
        setOptimisticAi(null);
      } catch {
        setOptimisticAi(null);
      } finally {
        setSavingAi(false);
      }
    },
    [consent, token],
  );

  const onSignOut = useCallback(async () => {
    setSigningOut(true);
    try {
      await logout();
      router.replace("/login");
    } finally {
      setSigningOut(false);
    }
  }, [logout, router]);

  // Version and build details
  const appVersion = Constants.expoConfig?.version ?? "0.1.0";
  const appBuild =
    Constants.expoConfig?.ios?.buildNumber ??
    Constants.expoConfig?.android?.versionCode?.toString() ??
    Constants.nativeBuildVersion ??
    "1";

  const acceptedDate = consent.data?.acceptedAt
    ? new Date(consent.data.acceptedAt).toLocaleDateString(undefined, {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : null;

  const aiDecidedDate = consent.data?.ai?.decidedAt
    ? new Date(
        consent.data.ai.revokedAt ?? consent.data.ai.decidedAt,
      ).toLocaleDateString(undefined, {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : null;

  const TABS = [
    { id: "profile" as const, label: "Profile" },
    { id: "training" as const, label: "Training" },
    { id: "settings" as const, label: "Settings" },
  ];

  return (
    <SafeAreaView
      edges={["top", "bottom"]}
      style={{ flex: 1, backgroundColor: colors.background }}
      testID="native-settings-screen"
    >
      <View style={{ paddingHorizontal: 16, paddingTop: 16, gap: 12 }}>
        {/* NP-303: the web header has a back button and a subtitle; native
            only ever had the bare title (back was edge-swipe only). */}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
          <Pressable
            testID="settings-back-button"
            accessibilityRole="button"
            accessibilityLabel="Back"
            onPress={() => router.back()}
            style={[
              minTouchTarget,
              {
                width: 40,
                height: 40,
                borderRadius: 12,
                justifyContent: "center",
                alignItems: "center",
              },
            ]}
          >
            <ChevronLeft size={22} color={colors.foreground} />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text
              accessibilityRole="header"
              className="text-foreground text-2xl font-bold"
            >
              Settings
            </Text>
            <Text className="text-muted-foreground text-sm mt-0.5">
              Manage your account and fitness preferences.
            </Text>
          </View>
        </View>

        {/* NP-302: the web's Profile / Training / Settings segmented tabs. */}
        <View
          testID="settings-tabs"
          style={{
            flexDirection: "row",
            padding: 3,
            borderRadius: 10,
            backgroundColor: colors.muted,
          }}
        >
          {TABS.map((tab) => (
            <Pressable
              key={tab.id}
              testID={`settings-tab-${tab.id}`}
              accessibilityRole="tab"
              accessibilityLabel={tab.label}
              accessibilityState={{ selected: activeTab === tab.id }}
              onPress={() => setActiveTab(tab.id)}
              style={[
                minTouchTarget,
                {
                  flex: 1,
                  alignItems: "center",
                  justifyContent: "center",
                  paddingVertical: 8,
                  borderRadius: 7,
                  backgroundColor:
                    activeTab === tab.id ? colors.card : "transparent",
                },
              ]}
            >
              <Text
                className={`text-sm font-medium ${
                  activeTab === tab.id
                    ? "text-foreground"
                    : "text-muted-foreground"
                }`}
              >
                {tab.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {activeTab === "profile" ? (
        <ProfileSettingsScreen embedded />
      ) : activeTab === "training" ? (
        <TrainingPreferencesScreen embedded />
      ) : (
      <ScreenState
        loading={initialLoading}
        error={fetchError}
        hasData={hasData}
        onRetry={onRetry}
        offlineNote="You're offline. Showing last-saved settings."
        testID="settings-screen-state"
      >
        <ScrollView contentContainerStyle={{ padding: 16, gap: 20 }}>
          {/* 1. Account Section */}
        <View
          testID="settings-account-section"
          className="rounded-xl border border-border bg-card p-4"
          style={{ gap: 12 }}
        >
          <Text
            accessibilityRole="header"
            className="text-foreground text-base font-semibold"
          >
            Account
          </Text>
          <View style={{ gap: 4 }}>
            {user?.name ? (
              <Text testID="account-user-name" className="text-foreground font-medium text-sm">
                {user.name}
              </Text>
            ) : null}
            {user?.email ? (
              <Text testID="account-user-email" className="text-muted-foreground text-xs">
                {user.email}
              </Text>
            ) : null}
          </View>
          <Pressable
            testID="settings-plan-link"
            accessibilityRole="link"
            accessibilityLabel="Plan"
            onPress={() => {
              router.push("/plan");
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
              Plan
            </Text>
            <ChevronRight size={16} color={colors["muted-foreground"]} />
          </Pressable>
          {user?.role === "admin" ? (
            <Pressable
              testID="admin-tools-row"
              accessibilityRole="link"
              accessibilityLabel="Admin tools"
              onPress={() => {
                void openWebSignedIn("/dashboard/admin");
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
                Admin tools
              </Text>
              <ExternalLink size={16} color={colors["muted-foreground"]} />
            </Pressable>
          ) : null}
          <Button
            testID="sign-out-button"
            variant="secondary"
            onPress={() => {
              void onSignOut();
            }}
            disabled={signingOut}
          >
            {signingOut ? "Signing out…" : "Sign out"}
          </Button>
        </View>

        {/* 2. Security Section (NP-187) */}
        <BiometricUnlockSection />

        {/* 3. Notifications Section (NP-068) */}
        <View
          testID="settings-notifications-section"
          className="rounded-xl border border-border bg-card p-4"
          style={{ gap: 16 }}
        >
          <Text
            accessibilityRole="header"
            className="text-foreground text-base font-semibold"
          >
            Notifications
          </Text>
          {/* Status row — the OS permission, the master switch and whether
              this device's token is registered, in the web's vocabulary. */}
          <View
            testID="notifications-status-row"
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 12,
            }}
          >
            <View style={{ flex: 1, gap: 2 }}>
              <View
                style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
              >
                <View
                  testID="notifications-status-dot"
                  accessibilityLabel={`Notifications status: ${notifStatus}`}
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: 5,
                    backgroundColor:
                      notifStatus === "Active"
                        ? colors.success
                        : notifStatus === "Blocked" ||
                            (notifPermission === "granted" &&
                              notificationsEnabled)
                          ? colors.destructive
                          : colors["muted-foreground"],
                  }}
                />
                <Text
                  testID="notifications-status"
                  className="text-foreground font-medium text-sm"
                >
                  {notifStatus}
                </Text>
              </View>
              <Text className="text-muted-foreground text-xs">
                {nativeNotifStatusDescription({
                  permission: notifPermission,
                  notificationsEnabled,
                  deviceRegistered,
                })}
              </Text>
            </View>
            {notifAction === "enable" || notifAction === "turn-on" ? (
              <Button
                testID="notifications-enable-button"
                variant="info"
                size="sm"
                onPress={() => {
                  void onEnableNotifications();
                }}
                disabled={enablingNotif}
                loading={enablingNotif}
              >
                {notifAction === "turn-on" ? "Turn on" : "Enable"}
              </Button>
            ) : null}
            {notifAction === "repair" ? (
              <Button
                testID="notifications-repair-button"
                variant="info"
                size="sm"
                onPress={() => {
                  void onRepairNotifications();
                }}
                disabled={repairing}
                loading={repairing}
              >
                Repair
              </Button>
            ) : null}
          </View>
          {/* Denied: the OS will not show its dialog again, so the member
              goes to iOS Settings. Shown on the web's cadence (7 days, then
              monthly) — the status row above always names the state. */}
          {notifPermission === "denied" && deniedReminderVisible ? (
            <View
              testID="notifications-denied-reminder"
              className="rounded-xl border border-border bg-card p-3"
              style={{ gap: 8 }}
            >
              <Text className="text-foreground font-medium text-sm">
                Notifications are off
              </Text>
              <Text className="text-muted-foreground text-xs">
                Turn Become back on in Settings to get workout reminders and
                streak alerts.
              </Text>
              <Button
                testID="notifications-open-settings"
                size="sm"
                onPress={onOpenSystemSettings}
                accessibilityHint="Opens the Settings app at Become's permissions"
              >
                Open Settings
              </Button>
            </View>
          ) : null}
          {/* NP-303: web shows ONLY the status row above until permission is
              granted AND notifications are on; there is no master switch on
              web at all (that was a native-only extra, shown even while the
              status read "Not enabled"). Once ready, web shows a red "Turn
              off notifications" link instead, and the per-type switches. */}
          {notifReady ? (
            <Pressable
              testID="notifications-turn-off-link"
              accessibilityRole="link"
              accessibilityLabel="Turn off notifications"
              onPress={() => {
                void onToggleNotifications(false);
              }}
              disabled={disablingNotif}
              style={[minTouchTarget, { alignSelf: "flex-start" }]}
            >
              <Text className="text-destructive text-xs font-medium">
                {disablingNotif ? "Turning off…" : "Turn off notifications"}
              </Text>
            </Pressable>
          ) : null}

          {/* Per-type switches — the web's ten keys and defaults, PATCHed
              flat. `chatMessage` stays hidden while NP-032 keeps chat out. */}
          {notifReady ? (
            <View style={{ gap: 12 }}>
              {visibleNotificationToggles().map(({ key, label, sublabel }) => (
                <View
                  key={key}
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 12,
                  }}
                >
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text className="text-foreground font-medium text-sm">
                      {label}
                    </Text>
                    <Text className="text-muted-foreground text-xs">
                      {sublabel}
                    </Text>
                  </View>
                  <Toggle
                    testID={`notification-toggle-${key}`}
                    accessibilityLabel={label}
                    color="info"
                    value={notifPrefsView[key] ?? false}
                    onValueChange={(val) => {
                      void onToggleNotifPref(key, val);
                    }}
                    disabled={togglingKey !== null}
                  />
                </View>
              ))}
            </View>
          ) : null}
        </View>

        {/* 3b. Email Section — its own card on the web (id="email"), not the
            last row of Notifications: a member with push off, or on a device
            that never asked, still gets streak mail, and CAN-SPAM needs this
            switch to exist and work on its own. */}
        <View
          testID="settings-email-section"
          className="rounded-xl border border-border bg-card p-4"
          style={{ gap: 12 }}
        >
          <Text
            accessibilityRole="header"
            className="text-foreground text-base font-semibold"
          >
            Email
          </Text>
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 12,
            }}
          >
            <View style={{ flex: 1, gap: 2 }}>
              <Text className="text-foreground font-medium text-sm">
                Streak and milestone emails
              </Text>
              <Text className="text-muted-foreground text-xs">
                A note when you hit a streak milestone. Sign-in links always arrive.
              </Text>
            </View>
            <Toggle
              testID="email-engagement-toggle"
              accessibilityLabel="Streak and milestone emails"
              color="info"
              value={emailEngagement}
              onValueChange={(val) => {
                void onToggleEmail(val);
              }}
              disabled={savingNotif}
            />
          </View>
        </View>

        {/* 4. AI Features Section (NP-046) */}
        <View
          testID="settings-ai-section"
          className="rounded-xl border border-border bg-card p-4"
          style={{ gap: 12 }}
        >
          <Text
            accessibilityRole="header"
            className="text-foreground text-base font-semibold"
          >
            AI features
          </Text>
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 12,
            }}
          >
            <View style={{ flex: 1, gap: 2 }}>
              <Text className="text-foreground font-medium text-sm">
                Share my inputs with {aiProvider}
              </Text>
              <Text className="text-muted-foreground text-xs">
                Off means nothing you enter is sent to the AI, and AI features fall back to their non-AI versions.
              </Text>
            </View>
            <Toggle
              testID="ai-consent-toggle"
              accessibilityLabel={`Share my inputs with ${aiProvider}`}
              color="info"
              value={aiAllowed}
              onValueChange={(val) => {
                void onToggleAi(val);
              }}
              disabled={savingAi}
            />
          </View>

          <Text className="text-muted-foreground text-xs mt-1">
            What gets sent, when it is on, through {AI_PROVIDER_ROUTE}:
          </Text>
          <View style={{ gap: 4, paddingLeft: 8 }}>
            {AI_CONSENT_SENDS.map((item) => (
              <Text key={item} className="text-muted-foreground text-xs leading-relaxed">
                • {item}
              </Text>
            ))}
          </View>

          {consent.data?.ai?.decidedAt && aiDecidedDate ? (
            <Text testID="ai-consent-record" className="text-muted-foreground text-xs">
              {consent.data.ai.granted ? "You allowed this on " : "You turned this off on "}
              {aiDecidedDate}.
            </Text>
          ) : null}

          <Pressable
            testID="ai-privacy-link"
            accessibilityRole="link"
            accessibilityLabel="Read Privacy Policy regarding AI"
            onPress={() => {
              void defaultBrowserLauncher(`${LEGAL_BASE_URL}/privacy#ai`);
            }}
          >
            <Text className="text-muted-foreground text-xs leading-relaxed">
              Section 7 of the{" "}
              <Text className="text-foreground text-xs underline font-medium">
                Privacy Policy
              </Text>{" "}
              describes this in full.
            </Text>
          </Pressable>
        </View>

        {/* 4b. Nutrition Planning — moved here from the Training tab's
            screen (NP-302), matching the web's Settings tab. */}
        <NutritionPlanningSection />

        {/* 4c. Billing (NP-303) — above Legal & support on purpose: the
            paragraph down there tells a member to cancel a paid plan before
            deleting the account, and this is the button that does it.
            Self-contained — renders nothing for a member with no
            manageable subscription. */}
        <BillingSection />

        {/* 5. Legal & support Section */}
        <View
          testID="settings-legal-section"
          className="rounded-xl border border-border bg-card p-4"
          style={{ gap: 12 }}
        >
          <Text
            accessibilityRole="header"
            className="text-foreground text-base font-semibold"
          >
            Legal &amp; support
          </Text>
          <Text className="text-muted-foreground text-xs">
            What you agreed to, what we hold, and how to reach a person.
          </Text>

          <LegalLinks showSupportEmail={true} />

          <FeedbackSheet token={token} />

          {consent.data?.acceptedAt && consent.data?.acceptedVersion && acceptedDate ? (
            <Text
              testID="consent-record"
              className="text-muted-foreground text-xs mt-1"
            >
              {`You agreed to the Terms and Privacy Policy (${consent.data.acceptedVersion}) on ${acceptedDate}.`}
            </Text>
          ) : null}

          <Text
            testID="health-disclaimer"
            className="text-muted-foreground text-xs leading-relaxed mt-1"
          >
            {HEALTH_DISCLAIMER_SHORT}
          </Text>

          {/* NP-303: native omitted this closing paragraph — the web's own
              words for where the delete control lives and what it does. */}
          <Text
            testID="legal-delete-note"
            className="text-muted-foreground text-xs leading-relaxed mt-3 pt-3 border-t border-border"
          >
            {`You can delete your account yourself, at the bottom of this screen. Everything goes within ${LEGAL_DELETION_DAYS} days of the request, and you have a few days to change your mind. Cancel any paid plan first, or email `}
            <Text
              testID="legal-delete-note-email"
              accessibilityRole="link"
              accessibilityLabel={`Email ${LEGAL_CONTACT_EMAIL}`}
              className="text-foreground text-xs underline font-medium"
              onPress={() => {
                void Linking.openURL(`mailto:${LEGAL_CONTACT_EMAIL}`);
              }}
            >
              {LEGAL_CONTACT_EMAIL}
            </Text>
            {" and we will cancel it for you."}
          </Text>

          <Text
            testID="app-version"
            className="text-muted-foreground text-xs pt-2 mt-1"
          >
            {`Version ${appVersion} (${appBuild})`}
          </Text>
        </View>

        {/* 6. Delete account (always at the bottom, 2 taps away) */}
        <View
          testID="settings-danger-section"
          className="border-t border-border pt-4 mt-2"
        >
          <DangerZone
            token={token}
            onDeleted={() => {
              router.replace("/login");
            }}
            onKept={() => {
              // The request latched `notificationsEnabled` false and cancelling
              // does not undo it: refetch prefs so the NP-068 switch shows the
              // latched-off state instead of a stale on.
              void notifPrefs.refetch();
            }}
          />
        </View>
        </ScrollView>
      </ScreenState>
      )}
    </SafeAreaView>
  );
}
