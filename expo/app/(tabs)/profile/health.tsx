import { useCallback, useEffect, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  ProfileResponseSchema,
  LogWeightResponseSchema,
  WeightCheckResponseSchema,
  type ProfileResponse,
  type LogWeightResponse,
  type WeightPostRequest,
} from "@become/api-client";
import { Input } from "@/components/Input";
import { Button } from "@/components/Button";
import { Toggle } from "@/components/Toggle";
import { createHealthOptInStore } from "@/lib/health/opt-in";
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
 * Profile → settings: edit name (GET/PATCH /api/profile), log weight or skip
 * (GET skip-state + POST /api/weight), and the Apple Health / Health Connect
 * opt-in toggle.
 */
export default function HealthSettingsRoute() {
  const { token } = useAuth();
  const [enabled, setEnabled] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [store] = useState(() => createHealthOptInStore());

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

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const initial = await store.isOptedIn();
      if (!cancelled) {
        setEnabled(initial);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [store]);

  const handleToggle = async (next: boolean): Promise<void> => {
    setEnabled(next);
    await store.setOptedIn(next);
  };

  return (
    <SafeAreaView
      edges={["top", "bottom"]}
      style={{ flex: 1, backgroundColor: "#0a0a0a" }}
      testID="health-settings-route"
    >
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
        <Text className="text-foreground text-2xl font-bold">Profile</Text>

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
          <Text className="text-foreground font-semibold">Log weight</Text>
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
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Button
              testID="weight-log"
              onPress={onLogWeight}
              disabled={weightMutation.loading}
            >
              Log weight
            </Button>
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

        <Text className="text-foreground text-2xl font-bold mt-2">
          Health sync
        </Text>
        <Text className="text-muted-foreground text-sm">
          Read weight + steps from Apple Health (iOS) or Health Connect
          (Android). Become only reads — we never write.
        </Text>
        <View
          testID="health-toggle-row"
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            padding: 12,
            borderRadius: 12,
          }}
          className="bg-card border border-border"
        >
          <Text className="text-foreground">Sync from Health</Text>
          <Toggle
            testID="health-toggle"
            value={enabled}
            onValueChange={(v) => {
              void handleToggle(v);
            }}
            disabled={loading}
            accessibilityLabel="Sync from Health"
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
