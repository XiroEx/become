import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, View } from "react-native";
import { CheckCircle2 } from "lucide-react-native";
import { Text } from "@/components/Text";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  ProfileResponseSchema,
  apiFetch,
  type ProfileResponse,
} from "@become/api-client";
import { AI_CONSENT_SENDS } from "@become/core";
import { Button } from "@/components/Button";
import { Input } from "@/components/Input";
import { ScreenState } from "@/components/ScreenState";
import { WEBAPP_BASE_URL } from "@/lib/config";
import { useAuth } from "@/lib/auth/useAuth";
import { useFetch } from "@/lib/hooks/useFetch";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";
import { minTouchTarget } from "@/lib/a11y/touchTarget";
import { WRAPPABLE_TEXT } from "@/lib/a11y/dynamicType";
import {
  DEFAULT_WEEKLY_AVAILABILITY,
  EQUIPMENT_OPTIONS,
  EXPERIENCE_LEVEL_OPTIONS,
  FITNESS_GOAL_OPTIONS,
  MAX_FITNESS_GOALS,
  buildTrainingProfilePatch,
  clampWeeklyAvailability,
  toggleFitnessGoals,
  type EquipmentValue,
  type ExperienceLevelValue,
  type FitnessGoalValue,
} from "@/lib/settings/trainingPreferences";

function isFitnessGoalValue(value: unknown): value is FitnessGoalValue {
  return (
    typeof value === "string" &&
    (FITNESS_GOAL_OPTIONS as readonly { value: string }[]).some(
      (o) => o.value === value,
    )
  );
}

function isExperienceLevelValue(value: unknown): value is ExperienceLevelValue {
  return (
    typeof value === "string" &&
    (EXPERIENCE_LEVEL_OPTIONS as readonly { value: string }[]).some(
      (o) => o.value === value,
    )
  );
}

function isEquipmentValue(value: unknown): value is EquipmentValue {
  return (
    typeof value === "string" &&
    (EQUIPMENT_OPTIONS as readonly { value: string }[]).some(
      (o) => o.value === value,
    )
  );
}

/**
 * TRAINING PREFERENCES (NP-127) — the native Settings > Training tab.
 *
 * Ports the web's Settings Training tab
 * (`webapp/app/dashboard/settings/page.tsx`, Fitness Goals / Experience &
 * Schedule / Equipment & Injuries), saved through the page's one
 * `PATCH /api/profile` (NP-048's route). Nutrition Planning (manual/auto
 * promotion) lives on the web's SETTINGS tab, not Training — NP-302 moved
 * it to native Settings > Settings to match, out of this screen.
 *
 * Parity notes:
 * - Goals are ordered and index 0 is the primary, also written as
 *   `fitnessGoal` — the mirror every existing consumer reads.
 * - The cap is the web's `MAX_FITNESS_GOALS = 3`: a fourth pick swaps out the
 *   least important one rather than growing the list.
 * - Weekly availability steps 1–7 days/week, defaulting to 3.
 * - Injury notes are health data and reach the AI only with consent (the
 *   server gate reads the AI-consent record per request).
 */
export function TrainingPreferencesScreen({
  testID = "training-preferences",
  embedded = false,
}: {
  testID?: string;
  /** True when rendered inside Settings > Training (NP-302): skips the
   * screen's own SafeAreaView/ScreenState chrome and "Training" title,
   * since the host screen already supplies those. */
  embedded?: boolean;
}) {
  const { colors, tint } = useThemeTokens();
  const { token, refresh } = useAuth();

  const fetchOpts = useMemo(
    () => ({
      baseUrl: WEBAPP_BASE_URL,
      getToken: () => token ?? undefined,
      skip: !token,
      useCache: true,
    }),
    [token],
  );

  const profile = useFetch("/api/profile", ProfileResponseSchema, fetchOpts);

  const [fitnessGoals, setFitnessGoals] = useState<FitnessGoalValue[]>([]);
  const [experienceLevel, setExperienceLevel] =
    useState<ExperienceLevelValue | null>(null);
  const [weeklyAvailability, setWeeklyAvailability] = useState<number>(
    DEFAULT_WEEKLY_AVAILABILITY,
  );
  const [equipmentAccess, setEquipmentAccess] = useState<EquipmentValue[]>([]);
  const [injuryNotes, setInjuryNotes] = useState<string>("");

  const [saving, setSaving] = useState<boolean>(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<boolean>(false);

  const seededRef = useRef(false);

  // Seed the form from the profile the first time it arrives, the way the
  // web's fetchProfile does (goals fall back to the lone fitnessGoal).
  useEffect(() => {
    if (!profile.data || seededRef.current) return;
    seededRef.current = true;
    const p = (profile.data as ProfileResponse | null)?.profile as
      | Record<string, unknown>
      | null
      | undefined;
    const raw = p ?? {};
    const storedGoals = Array.isArray(raw.fitnessGoals)
      ? (raw.fitnessGoals as unknown[]).filter(isFitnessGoalValue)
      : [];
    const fallbackGoal =
      storedGoals.length === 0 && isFitnessGoalValue(raw.fitnessGoal)
        ? [raw.fitnessGoal]
        : [];
    setFitnessGoals([...storedGoals, ...fallbackGoal]);
    setExperienceLevel(
      isExperienceLevelValue(raw.experienceLevel) ? raw.experienceLevel : null,
    );
    setWeeklyAvailability(
      typeof raw.weeklyAvailability === "number"
        ? clampWeeklyAvailability(raw.weeklyAvailability)
        : DEFAULT_WEEKLY_AVAILABILITY,
    );
    setEquipmentAccess(
      Array.isArray(raw.equipmentAccess)
        ? (raw.equipmentAccess as unknown[]).filter(isEquipmentValue)
        : [],
    );
    setInjuryNotes(
      typeof raw.injuryNotes === "string" ? raw.injuryNotes : "",
    );
  }, [profile.data]);


  const onToggleGoal = useCallback((goal: FitnessGoalValue) => {
    setFitnessGoals((current) => toggleFitnessGoals(current, goal));
    setSaveSuccess(false);
  }, []);

  const onToggleEquipment = useCallback((value: EquipmentValue) => {
    setEquipmentAccess((current) =>
      current.includes(value)
        ? current.filter((e) => e !== value)
        : [...current, value],
    );
    setSaveSuccess(false);
  }, []);

  const onSave = useCallback(async () => {
    if (!token || saving) return;
    setSaveError(null);
    setSaveSuccess(false);
    setSaving(true);
    try {
      const patch = buildTrainingProfilePatch({
        fitnessGoals,
        experienceLevel,
        weeklyAvailability,
        equipmentAccess,
        injuryNotes,
      });
      await apiFetch<ProfileResponse>("/api/profile", ProfileResponseSchema, {
        method: "PATCH",
        baseUrl: WEBAPP_BASE_URL,
        getToken: () => token ?? undefined,
        body: { profile: patch },
      });
      setSaveSuccess(true);
      await Promise.all([profile.refetch(), refresh?.()]);
    } catch {
      setSaveError("Failed to save training preferences");
    } finally {
      setSaving(false);
    }
  }, [
    token,
    saving,
    fitnessGoals,
    experienceLevel,
    weeklyAvailability,
    equipmentAccess,
    injuryNotes,
    profile,
    refresh,
  ]);

  const hasData = !!profile.data;
  const fetchError = profile.error;
  const initialLoading = profile.loading && !hasData;

  const onRetry = useCallback(async () => {
    seededRef.current = false;
    await profile.refetch();
  }, [profile]);

  // NP-307: the web's selected state is green (`border-green-500
  // bg-green-50 text-green-700` / `dark:bg-green-900/20 dark:text-green-400`),
  // not the brand red native had and not the neutral `primary` either —
  // `success` is the same green-600/400 token the rest of the app already
  // uses for a positive/selected state.
  const selectedBorder = colors.success;
  const selectedTint = tint("success", 0.12);
  // Embedded (Settings > Training, NP-302): the host screen already supplies
  // its own SafeAreaView, so this becomes a plain View — a second
  // SafeAreaView here would double the top/bottom inset padding.
  const Wrapper: typeof View = embedded ? View : (SafeAreaView as unknown as typeof View);

  return (
    <ScreenState
      loading={initialLoading}
      error={fetchError}
      hasData={hasData}
      onRetry={onRetry}
      offlineNote="You're offline. Showing last-saved training preferences."
      testID={`${testID}-screen-state`}
    >
      <Wrapper
        {...(embedded ? {} : { edges: ["top", "bottom"] })}
        style={{ flex: 1, backgroundColor: colors.background }}
        testID={`${testID}-route`}
      >
        <ScrollView contentContainerStyle={{ padding: 16, gap: 20 }}>
          {embedded ? null : (
            <Text accessibilityRole="header" className="text-foreground text-2xl font-bold">
              Training
            </Text>
          )}

          {/* ── Fitness Goals ── */}
          <View
            testID={`${testID}-goals-section`}
            style={{
              gap: 8,
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: 16,
              backgroundColor: colors.card,
              padding: 16,
            }}
          >
            <Text
              accessibilityRole="header"
              className="text-foreground text-lg font-semibold"
            >
              Fitness Goals
            </Text>
            <Text className="text-muted-foreground text-xs">
              {`Pick up to ${MAX_FITNESS_GOALS}. Your first pick is your primary goal — it drives your program recommendations, your calorie direction and your dashboard.`}
            </Text>
            <View style={{ gap: 8, marginTop: 4 }}>
              {FITNESS_GOAL_OPTIONS.map((goal) => {
                const rank = fitnessGoals.indexOf(goal.value);
                const selected = rank >= 0;
                return (
                  <Pressable
                    key={goal.value}
                    testID={`${testID}-goal-${goal.value}`}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: selected }}
                    accessibilityLabel={goal.label}
                    accessibilityHint={
                      selected
                        ? rank === 0
                          ? "Primary goal. Activate to remove it."
                          : `Also number ${rank + 1}. Activate to remove it.`
                        : goal.description
                    }
                    onPress={() => onToggleGoal(goal.value)}
                    style={[
                      minTouchTarget,
                      {
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 12,
                        padding: 12,
                        borderRadius: 12,
                        borderWidth: 2,
                        borderColor: selected ? selectedBorder : colors.border,
                        backgroundColor: selected
                          ? selectedTint
                          : colors.card,
                      },
                    ]}
                  >
                    <Text style={{ fontSize: 24 }}>{goal.icon}</Text>
                    <View style={{ flex: 1, gap: 2, flexShrink: 1 }}>
                      <Text
                        className={
                          selected
                            ? "text-success text-sm font-semibold"
                            : "text-foreground text-sm font-semibold"
                        }
                        style={WRAPPABLE_TEXT}
                      >
                        {goal.label}
                      </Text>
                      <Text
                        className="text-muted-foreground text-xs"
                        style={WRAPPABLE_TEXT}
                      >
                        {selected
                          ? rank === 0
                            ? "Primary goal"
                            : `Also #${rank + 1}`
                          : goal.description}
                      </Text>
                    </View>
                    {selected ? (
                      <CheckCircle2
                        testID={
                          rank === 0 ? "primary-goal-badge" : undefined
                        }
                        size={18}
                        color={colors.success}
                      />
                    ) : null}
                  </Pressable>
                );
              })}
            </View>
          </View>

          {/* ── Experience & Schedule ── */}
          <View
            testID={`${testID}-experience-section`}
            style={{
              gap: 12,
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: 16,
              backgroundColor: colors.card,
              padding: 16,
            }}
          >
            <Text
              accessibilityRole="header"
              className="text-foreground text-lg font-semibold"
            >
              Experience &amp; Schedule
            </Text>
            <View style={{ gap: 6 }}>
              <Text className="text-foreground text-sm font-medium">
                Experience Level
              </Text>
              <View
                testID={`${testID}-experience-selector`}
                accessibilityRole="radiogroup"
                accessibilityLabel="Experience Level"
                style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}
              >
                {EXPERIENCE_LEVEL_OPTIONS.map((opt) => {
                  const selected = experienceLevel === opt.value;
                  return (
                    <Pressable
                      key={opt.value}
                      testID={`${testID}-experience-${opt.value}`}
                      accessibilityRole="radio"
                      accessibilityState={{ selected }}
                      accessibilityLabel={opt.label}
                      onPress={() => {
                        setExperienceLevel(opt.value);
                        setSaveSuccess(false);
                      }}
                      style={[
                        minTouchTarget,
                        {
                          flex: 1,
                          paddingVertical: 8,
                          paddingHorizontal: 14,
                          borderRadius: 12,
                          borderWidth: 2,
                          borderColor: selected ? selectedBorder : colors.border,
                          backgroundColor: selected ? selectedTint : colors.card,
                          alignItems: "center",
                          justifyContent: "center",
                        },
                      ]}
                    >
                      <Text
                        style={{
                          flexShrink: 1,
                          fontSize: 14,
                          fontWeight: "500",
                          color: selected
                            ? colors.success
                            : colors["muted-foreground"],
                        }}
                      >
                        {opt.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
            <View style={{ gap: 6 }}>
              <Text className="text-foreground text-sm font-medium">
                Weekly Availability
              </Text>
              <View
                testID={`${testID}-weekly-availability`}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 16,
                }}
              >
                <Pressable
                  testID={`${testID}-weekly-decrease`}
                  accessibilityRole="button"
                  accessibilityLabel="Decrease weekly availability"
                  onPress={() => {
                    setWeeklyAvailability((v) =>
                      clampWeeklyAvailability(v - 1),
                    );
                    setSaveSuccess(false);
                  }}
                  style={[
                    minTouchTarget,
                    {
                      width: 44,
                      height: 44,
                      borderRadius: 12,
                      borderWidth: 1,
                      borderColor: colors.border,
                      backgroundColor: colors.card,
                      alignItems: "center",
                      justifyContent: "center",
                    },
                  ]}
                >
                  <Text className="text-foreground text-xl font-semibold">
                    −
                  </Text>
                </Pressable>
                <View style={{ flex: 1, alignItems: "center", flexShrink: 1 }}>
                  <Text
                    testID={`${testID}-weekly-value`}
                    className="text-foreground text-2xl font-bold"
                  >
                    {weeklyAvailability}
                  </Text>
                  <Text className="text-muted-foreground text-sm">
                    {weeklyAvailability === 1 ? "day/week" : "days/week"}
                  </Text>
                </View>
                <Pressable
                  testID={`${testID}-weekly-increase`}
                  accessibilityRole="button"
                  accessibilityLabel="Increase weekly availability"
                  onPress={() => {
                    setWeeklyAvailability((v) =>
                      clampWeeklyAvailability(v + 1),
                    );
                    setSaveSuccess(false);
                  }}
                  style={[
                    minTouchTarget,
                    {
                      width: 44,
                      height: 44,
                      borderRadius: 12,
                      borderWidth: 1,
                      borderColor: colors.border,
                      backgroundColor: colors.card,
                      alignItems: "center",
                      justifyContent: "center",
                    },
                  ]}
                >
                  <Text className="text-foreground text-xl font-semibold">
                    +
                  </Text>
                </Pressable>
              </View>
            </View>
          </View>

          {/* ── Equipment & Injuries ── */}
          <View
            testID={`${testID}-equipment-section`}
            style={{
              gap: 12,
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: 16,
              backgroundColor: colors.card,
              padding: 16,
            }}
          >
            <Text
              accessibilityRole="header"
              className="text-foreground text-lg font-semibold"
            >
              Equipment &amp; Injuries
            </Text>
            <View style={{ gap: 6 }}>
              <Text className="text-foreground text-sm font-medium">
                Equipment Access
              </Text>
              <View
                testID={`${testID}-equipment-selector`}
                style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}
              >
                {EQUIPMENT_OPTIONS.map((opt) => {
                  const selected = equipmentAccess.includes(opt.value);
                  return (
                    <Pressable
                      key={opt.value}
                      testID={`${testID}-equipment-${opt.value}`}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: selected }}
                      accessibilityLabel={opt.label}
                      onPress={() => onToggleEquipment(opt.value)}
                      style={[
                        minTouchTarget,
                        {
                          paddingVertical: 8,
                          paddingHorizontal: 14,
                          borderRadius: 9999,
                          borderWidth: 2,
                          borderColor: selected ? selectedBorder : colors.border,
                          backgroundColor: selected ? selectedTint : colors.card,
                          alignItems: "center",
                          justifyContent: "center",
                        },
                      ]}
                    >
                      <Text
                        style={{
                          flexShrink: 1,
                          fontSize: 14,
                          fontWeight: "500",
                          color: selected
                            ? colors.success
                            : colors["muted-foreground"],
                        }}
                      >
                        {opt.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
            <View style={{ gap: 6 }}>
              <Input
                testID={`${testID}-injury-notes`}
                label="Injury Notes (optional)"
                value={injuryNotes}
                onChangeText={(text) => {
                  setInjuryNotes(text);
                  setSaveSuccess(false);
                }}
                placeholder="e.g. Bad left knee, shoulder impingement..."
                multiline
                numberOfLines={3}
                accessibilityHint="Health data. Only shared with the AI with your permission."
              />
              <Text className="text-muted-foreground text-xs">
                Health data — only shared with the AI with your permission.{" "}
                {AI_CONSENT_SENDS[1]}
              </Text>
            </View>
          </View>

          {saveError ? (
            <Text
              testID={`${testID}-save-error`}
              accessibilityRole="alert"
              className="text-destructive text-sm"
            >
              {saveError}
            </Text>
          ) : null}
          {saveSuccess ? (
            <Text
              testID={`${testID}-save-success`}
              className="text-primary text-sm font-medium"
            >
              Training preferences saved
            </Text>
          ) : null}

          {/* NP-307: "Save Changes", matching the web's SaveButton label and its
              flat black / white `bg-zinc-900 dark:bg-white` — the Button's
              default "primary" variant is that same neutral pair (NP-313),
              not the brand red native had. */}
          <Button
            testID={`${testID}-save`}
            onPress={() => {
              void onSave();
            }}
            disabled={saving}
            loading={saving}
          >
            {saving ? "Saving…" : "Save Changes"}
          </Button>
        </ScrollView>
      </Wrapper>
    </ScreenState>
  );
}

export default TrainingPreferencesScreen;
