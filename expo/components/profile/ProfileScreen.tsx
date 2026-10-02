/**
 * The profile screen — the member's identity card.
 * Ported 1:1 from `webapp/app/dashboard/profile/page.tsx`.
 *
 * Displays:
 *   - Avatar / preset icon hero, name, email, goal & member-since chips
 *   - Mind chapter and XP with the XP progress bar (`GET /api/mind/progress`)
 *   - IconPicker customizer (`PATCH /api/profile`, `POST /api/profile/avatar`)
 *   - PlanRow (hidden when `enforced === false`)
 *   - Account & preferences link to Settings
 */

import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import {
  ArrowLeft,
  ChevronRight,
  Settings,
  Sparkles,
} from "lucide-react-native";
import {
  apiFetch,
  MindProgressResponseSchema,
  ProfileResponseSchema,
  type MindProgressResponse,
  type ProfileResponse,
} from "@become/api-client";
import { Text } from "@/components/Text";
import { Avatar } from "@/components/Avatar";
import { IconPicker } from "@/components/profile/IconPicker";
import { PlanRow } from "@/components/profile/PlanRow";
import { GOAL_LABELS } from "@/lib/profile/icons";
import { useAuth } from "@/lib/auth/useAuth";
import { WEBAPP_BASE_URL } from "@/lib/config";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";
import { minTouchTarget } from "@/lib/a11y/touchTarget";

export interface ProfileScreenProps {
  onBack?: () => void;
  onOpenSettings?: () => void;
  testID?: string;
}

export function ProfileScreen({
  onBack,
  onOpenSettings,
  testID = "profile-screen",
}: ProfileScreenProps) {
  const router = useRouter();
  const { colors } = useThemeTokens();
  const { token, user } = useAuth();

  const [profile, setProfile] = useState<ProfileResponse | null>(null);
  const [mind, setMind] = useState<MindProgressResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    const fetchOpts = {
      baseUrl: WEBAPP_BASE_URL,
      getToken: () => token ?? undefined,
    };
    try {
      setError(null);
      const [pRes, mRes] = await Promise.allSettled([
        apiFetch<ProfileResponse>("/api/profile", ProfileResponseSchema, fetchOpts),
        apiFetch<MindProgressResponse>(
          "/api/mind/progress",
          MindProgressResponseSchema,
          fetchOpts,
        ),
      ]);

      if (pRes.status === "fulfilled") {
        setProfile(pRes.value);
      }
      if (mRes.status === "fulfilled") {
        setMind(mRes.value);
      }
    } catch {
      setError("Could not load profile. Pull to retry.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- sync profile and mind progress from server
    void loadData();
  }, [loadData]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    loadData();
  }, [loadData]);

  const handleBack = () => {
    if (onBack) {
      onBack();
    } else if (router.canGoBack()) {
      router.back();
    } else {
      router.replace("/(tabs)/dashboard" as never);
    }
  };

  const handleSettings = () => {
    if (onOpenSettings) {
      onOpenSettings();
    } else {
      router.push("/settings" as never);
    }
  };

  if (loading) {
    return (
      <SafeAreaView
        edges={["top", "bottom"]}
        style={{ flex: 1, backgroundColor: colors.background }}
        testID={testID}
      >
        <View
          testID="profile-loading"
          style={{ flex: 1, alignItems: "center", justifyContent: "center" }}
          accessible
          accessibilityRole="progressbar"
          accessibilityLabel="Loading your profile"
        >
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  const goal = profile?.profile?.fitnessGoal;
  const memberSince = profile?.createdAt
    ? new Date(profile.createdAt).toLocaleDateString("en-US", {
        month: "long",
        year: "numeric",
      })
    : null;
  const chapterName = mind?.currentChapter?.name;
  const pct = mind?.xpProgress?.pct ?? null;
  const displayName = profile?.name || user?.name || "Member";
  const displayEmail = profile?.email || user?.email;

  return (
    <SafeAreaView
      edges={["top", "bottom"]}
      style={{ flex: 1, backgroundColor: colors.background }}
      testID={testID}
    >
      <ScrollView
        testID="profile-scroll"
        contentContainerStyle={{ padding: 16, gap: 20, paddingBottom: 40 }}
        refreshControl={
          <RefreshControl
            testID="profile-refresh"
            refreshing={refreshing}
            onRefresh={handleRefresh}
          />
        }
      >
        {/* Header */}
        <View className="flex-row items-center justify-between">
          <View className="flex-row items-center gap-3">
            <Pressable
              testID="profile-back-button"
              accessibilityRole="button"
              accessibilityLabel="Back"
              onPress={handleBack}
              style={[
                minTouchTarget,
                { alignItems: "center", justifyContent: "center" },
              ]}
              className="rounded-full border border-border p-2"
            >
              <ArrowLeft
                size={20}
                color={colors.foreground}
                strokeWidth={2}
              />
            </Pressable>
            <Text
              testID="profile-title"
              accessibilityRole="header"
              className="text-foreground text-2xl font-bold"
            >
              Profile
            </Text>
          </View>
          <Pressable
            testID="profile-header-settings"
            accessibilityRole="button"
            accessibilityLabel="Settings"
            onPress={handleSettings}
            style={[
              minTouchTarget,
              { alignItems: "center", justifyContent: "center" },
            ]}
            className="rounded-full border border-border p-2"
          >
            <Settings
              size={20}
              color={colors["muted-foreground"]}
              strokeWidth={1.5}
            />
          </Pressable>
        </View>

        {error ? (
          <View className="rounded-xl bg-destructive/10 p-3">
            <Text className="text-destructive text-sm">{error}</Text>
          </View>
        ) : null}

        {/* Identity Hero */}
        <View
          testID="profile-identity"
          className="items-center rounded-2xl border border-border bg-card p-6"
        >
          <Avatar
            icon={profile?.profileIcon}
            imageUrl={profile?.avatarUrl}
            size={96}
            testID="profile-avatar-hero"
          />
          <Text
            testID="profile-name"
            className="text-foreground mt-4 text-xl font-bold"
          >
            {displayName}
          </Text>
          {displayEmail ? (
            <Text
              testID="profile-email"
              className="text-muted-foreground text-sm"
            >
              {displayEmail}
            </Text>
          ) : null}

          <View className="mt-3 flex-row flex-wrap items-center justify-center gap-2">
            {goal ? (
              <View
                testID="profile-goal-chip"
                className="rounded-full bg-muted px-3 py-1"
              >
                <Text className="text-foreground text-xs font-medium">
                  {GOAL_LABELS[goal] || goal}
                </Text>
              </View>
            ) : null}
            {memberSince ? (
              <View
                testID="profile-since-chip"
                className="rounded-full bg-muted px-3 py-1"
              >
                <Text className="text-muted-foreground text-xs font-medium">
                  Since {memberSince}
                </Text>
              </View>
            ) : null}
          </View>
        </View>

        {/* Mindset Progress */}
        {mind ? (
          <View
            testID="profile-mind"
            className="rounded-2xl border border-border bg-card p-5"
          >
            <View className="flex-row items-center justify-between">
              <View className="flex-row items-center gap-2">
                <Sparkles size={16} color={colors.primary} />
                <Text
                  testID="profile-mind-chapter"
                  className="text-foreground text-sm font-semibold"
                >
                  Chapter {mind.chapter}
                  {chapterName ? ` · ${chapterName}` : ""}
                </Text>
              </View>
              <Text
                testID="profile-mind-xp"
                className="text-sm font-bold text-purple-600 dark:text-purple-400"
              >
                {`${mind.xp} XP`}
              </Text>
            </View>

            {pct !== null ? (
              <View
                testID="profile-mind-bar"
                className="mt-3 h-2 overflow-hidden rounded-full bg-muted"
              >
                <View
                  className="h-full rounded-full bg-purple-500"
                  style={{
                    width: `${Math.max(0, Math.min(100, Math.round(pct * 100)))}%`,
                  }}
                />
              </View>
            ) : null}

            {mind.currentChapter?.theme ? (
              <Text
                testID="profile-mind-theme"
                className="text-muted-foreground mt-2 text-xs"
              >
                {mind.currentChapter.theme}
              </Text>
            ) : null}
          </View>
        ) : null}

        {/* Icon Customizer */}
        <IconPicker
          currentIcon={profile?.profileIcon}
          avatarUrl={profile?.avatarUrl}
          onIconChange={(newIcon) => {
            setProfile((prev) =>
              prev ? { ...prev, profileIcon: newIcon } : prev,
            );
          }}
          onAvatarChange={(newUrl) => {
            setProfile((prev) =>
              prev
                ? { ...prev, profileIcon: "custom", avatarUrl: newUrl }
                : prev,
            );
          }}
        />

        {/* Plan Row — renders nothing until enforcement is on */}
        <PlanRow />

        {/* Settings link */}
        <Pressable
          testID="profile-settings-link"
          accessibilityRole="button"
          accessibilityLabel="Account and preferences"
          onPress={handleSettings}
          style={[
            minTouchTarget,
            {
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
            },
          ]}
          className="rounded-2xl border border-border bg-card px-5 py-4"
        >
          <View className="flex-row items-center gap-3">
            <Settings size={20} color={colors["muted-foreground"]} />
            <Text className="text-foreground text-sm font-medium">
              Account &amp; preferences
            </Text>
          </View>
          <ChevronRight size={16} color={colors["muted-foreground"]} />
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

export default ProfileScreen;
