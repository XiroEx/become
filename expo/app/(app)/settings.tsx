import { useCallback, useState } from "react";
import { View, ScrollView, Pressable } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import Constants from "expo-constants";
import {
  ConsentStatusSchema,
  NotificationPreferencesResponseSchema,
} from "@become/api-client";
import {
  AI_PROVIDER,
  AI_PROVIDER_ROUTE,
  AI_CONSENT_SENDS,
  HEALTH_DISCLAIMER_SHORT,
} from "@become/core";
import { Text } from "@/components/Text";
import { Button } from "@/components/Button";
import { Toggle } from "@/components/Toggle";
import { DangerZone } from "@/components/settings/DangerZone";
import { FeedbackSheet } from "@/components/settings/FeedbackSheet";
import { LegalLinks, LEGAL_BASE_URL } from "@/components/legal/LegalLinks";
import { ScreenState } from "@/components/ScreenState";
import { useAuth } from "@/lib/auth/useAuth";
import { useFetch } from "@/lib/hooks/useFetch";
import { WEBAPP_BASE_URL } from "@/lib/config";
import { defaultBrowserLauncher } from "@/lib/programs/browserLauncher";
import { openWebSignedIn } from "@/lib/web/openWebSignedIn";
import { minTouchTarget } from "@/lib/a11y/touchTarget";
import { ChevronRight, ExternalLink } from "lucide-react-native";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";

/**
 * Native Settings screen: Account, Notifications (NP-068), AI features (NP-046),
 * Legal & support, and Delete account at the bottom (two taps away).
 */
export default function SettingsScreen() {
  const { colors } = useThemeTokens();
  const router = useRouter();
  const { token, user, logout } = useAuth();
  const [signingOut, setSigningOut] = useState(false);

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

  // Notifications (NP-068) state
  const [savingNotif, setSavingNotif] = useState(false);
  const notificationsEnabled = notifPrefs.data?.notificationsEnabled !== false;
  const emailEngagement = notifPrefs.data?.emailEngagement !== false;

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
      setSavingNotif(true);
      try {
        if (!value) {
          // Dropping notifications entirely via unsubscribe route
          await fetch(`${WEBAPP_BASE_URL}/api/notifications/unsubscribe`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({}),
          });
        } else {
          await fetch(`${WEBAPP_BASE_URL}/api/notifications/preferences`, {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({ streakAtRisk: true, workoutReminder: true }),
          });
        }
        await notifPrefs.refetch();
      } catch {
        // ignore
      } finally {
        setSavingNotif(false);
      }
    },
    [notifPrefs, token],
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

  return (
    <ScreenState
      loading={initialLoading}
      error={fetchError}
      hasData={hasData}
      onRetry={onRetry}
      offlineNote="You're offline. Showing last-saved settings."
      testID="settings-screen-state"
    >
      <SafeAreaView
        edges={["top", "bottom"]}
        style={{ flex: 1, backgroundColor: colors.background }}
        testID="native-settings-screen"
      >
        <ScrollView contentContainerStyle={{ padding: 16, gap: 20 }}>
          <Text
            accessibilityRole="header"
            className="text-foreground text-2xl font-bold"
          >
            Settings
          </Text>

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

        {/* 2. Notifications Section (NP-068) */}
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
                Push notifications
              </Text>
              <Text className="text-muted-foreground text-xs">
                Reminders for workouts, meals and streak alerts.
              </Text>
            </View>
            <Toggle
              testID="notifications-toggle"
              accessibilityLabel="Push notifications"
              value={notificationsEnabled}
              onValueChange={(val) => {
                void onToggleNotifications(val);
              }}
              disabled={savingNotif}
            />
          </View>

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
              value={emailEngagement}
              onValueChange={(val) => {
                void onToggleEmail(val);
              }}
              disabled={savingNotif}
            />
          </View>
        </View>

        {/* 3. AI Features Section (NP-046) */}
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

        {/* 4. Legal & support Section */}
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

          <Text
            testID="app-version"
            className="text-muted-foreground text-xs pt-2 border-t border-border"
          >
            {`Version ${appVersion} (${appBuild})`}
          </Text>
        </View>

        {/* 5. Delete account (always at the bottom, 2 taps away) */}
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
              // Cancelling does not undo the `notificationsEnabled: false`
              // latch the request set server-side — the member stays silent
              // until they flip the switch themselves (web parity). Re-read
              // the switch so it shows the true (off) state, not a stale on.
              void notifPrefs.refetch();
            }}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  </ScreenState>
  );
}
