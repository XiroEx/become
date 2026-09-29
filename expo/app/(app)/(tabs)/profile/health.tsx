import { useCallback, useEffect, useState } from "react";
import { ScrollView, View } from "react-native";
import { Text } from "@/components/Text";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  ProfileResponseSchema,
  LogWeightResponseSchema,
  WeightCheckResponseSchema,
  type ProfileResponse,
  type LogWeightResponse,
  type WeightPostRequest,
} from "@become/api-client";
import { useRouter } from "expo-router";
import { Input } from "@/components/Input";
import { Button } from "@/components/Button";
import { DangerZone } from "@/components/settings/DangerZone";
import { HealthSyncSection } from "@/components/settings/HealthSyncSection";
import { WEBAPP_BASE_URL } from "@/lib/config";
import { useAuth } from "@/lib/auth/useAuth";
import { useFetch } from "@/lib/hooks/useFetch";
import { useMutation } from "@/lib/hooks/useMutation";

interface ProfilePatchInput {
  name?: string;
  onboardingCompleted?: boolean;
  profile?: Record<string, unknown>;
}

/**
 * SETTINGS. Edit name (GET/PATCH /api/profile), log weight or skip (GET
 * skip-state + POST /api/weight) — and the danger zone at the bottom, which is
 * the account-deletion path both stores require to be reachable from inside
 * the app.
 *
 * The Apple Health / Health Connect section lives in HealthSyncSection and
 * renders nothing until NP-185 installs a real health module.
 *
 * It is reached from the gear on the dashboard (app/(tabs)/dashboard). Before
 * that entry point existed this screen was in the route tree and unreachable
 * in a store build, which made "deletion is two taps from Settings" untrue for
 * want of a button.
 */
export default function HealthSettingsRoute() {
  const { token } = useAuth();
  const router = useRouter();

  const fetchOpts = {
    baseUrl: WEBAPP_BASE_URL,
    getToken: () => token ?? undefined,
    skip: !token,
  };

  const profile = useFetch("/api/profile", ProfileResponseSchema, fetchOpts);

  const [name, setName] = useState<string>("");
  useEffect(() => {
    if (profile.data?.name != null) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setName(profile.data.name);
    }
  }, [profile.data?.name]);

  const profileMutation = useMutation<ProfilePatchInput, ProfileResponse>(
    "/api/profile",
    ProfileResponseSchema,
    {
      method: "PATCH",
      baseUrl: WEBAPP_BASE_URL,
      getToken: () => token ?? undefined,
      onSuccess: () => {
        void profile.refetch();
      },
    },
  );

  // Weight skip-tracking state (last logged weight + days since) so the user
  // sees where they stand before logging again.
  const weightCheck = useFetch(
    "/api/weight",
    WeightCheckResponseSchema,
    fetchOpts,
  );

  const weightMutation = useMutation<WeightPostRequest, LogWeightResponse>(
    "/api/weight",
    LogWeightResponseSchema,
    {
      method: "POST",
      baseUrl: WEBAPP_BASE_URL,
      getToken: () => token ?? undefined,
      onSuccess: () => {
        // Re-pull the skip-tracking state so the summary reflects the new log/skip.
        void weightCheck.refetch();
      },
    },
  );
  const [weightText, setWeightText] = useState<string>("");

  const onSaveName = useCallback(() => {
    void profileMutation.mutate({ name: name.trim() });
  }, [profileMutation, name]);

  const onLogWeight = useCallback(() => {
    const parsed = Number(weightText);
    if (!Number.isFinite(parsed) || parsed <= 0) return;
    void weightMutation.mutate({ weight: parsed });
  }, [weightMutation, weightText]);

  const onSkipWeight = useCallback(() => {
    void weightMutation.mutate({ weight: null, skip: true });
  }, [weightMutation]);

  const lastWeight = weightCheck.data?.lastWeight;
  const daysSince = weightCheck.data?.daysSinceLastEntry;

  return (
    <SafeAreaView
      edges={["top", "bottom"]}
      style={{ flex: 1, backgroundColor: "#0a0a0a" }}
      testID="health-settings-route"
    >
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
        <Text
          accessibilityRole="header"
          className="text-foreground text-2xl font-bold"
        >
          Settings
        </Text>

        <View style={{ gap: 8 }}>
          <Input
            testID="profile-name-input"
            label="Name"
            value={name}
            onChangeText={setName}
            placeholder="Your name"
          />
          <Button
            testID="profile-save"
            onPress={onSaveName}
            disabled={profileMutation.loading}
          >
            {profileMutation.loading ? "Saving…" : "Save profile"}
          </Button>
        </View>

        <View style={{ gap: 8 }}>
          <Text
            accessibilityRole="header"
            className="text-foreground font-semibold"
          >
            Log weight
          </Text>
          {lastWeight != null ? (
            <Text testID="weight-last" className="text-muted-foreground text-xs">
              Last logged {lastWeight} lbs
              {daysSince != null ? ` · ${daysSince}d ago` : ""}
            </Text>
          ) : null}
          <Input
            testID="weight-input"
            label="Weight (lbs)"
            keyboardType="numeric"
            value={weightText}
            onChangeText={setWeightText}
            placeholder="180"
          />
          {/* Two buttons sharing the row (`flex: 1` each) rather than sitting at
              their intrinsic width: at the largest Dynamic Type size "Log
              weight" and "Skip today" are wider than the screen together, and
              the second one would be pushed off the edge. */}
          <View style={{ flexDirection: "row", gap: 8 }}>
            <View style={{ flex: 1 }}>
              <Button
                testID="weight-log"
                onPress={onLogWeight}
                disabled={weightMutation.loading}
              >
                Log weight
              </Button>
            </View>
            <View style={{ flex: 1 }}>
              <Button
                testID="weight-skip"
                variant="secondary"
                onPress={onSkipWeight}
                disabled={weightMutation.loading}
              >
                Skip today
              </Button>
            </View>
          </View>
        </View>

        {/* Health sync renders nothing until NP-185 installs a real HealthKit /
            Health Connect module — see lib/health/enabled.ts. */}
        <HealthSyncSection />

        {/* THE DANGER ZONE, LAST AND ALWAYS VISIBLE. This screen is the app's
            Settings, so this is where an App Store reviewer looks for account
            deletion (Guideline 5.1.1(v)) — and from here it is two taps:
            "Delete account", then "Yes, delete my account". It is NOT behind a
            sub-screen or a tab for exactly that reason. */}
        <View className="border-t border-border" style={{ marginTop: 8, paddingTop: 16 }}>
          <DangerZone
            token={token}
            onDeleted={() => {
              router.replace("/login");
            }}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
