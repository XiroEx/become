import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, TextInput, View } from "react-native";
import { Text } from "@/components/Text";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  AgeBelowMinimumErrorSchema,
  ApiError,
  GoalProgressResponseSchema,
  ProfileResponseSchema,
  apiFetch,
  type GoalProgressResponse,
  type ProfileResponse,
} from "@become/api-client";
import {
  cmToFtIn,
  defaultPaceKg,
  displayWeight,
  ftInToCm,
  lbsToKg,
  LEGAL_MINIMUM_AGE,
  roundHeightCm,
  roundWeight,
  type WeightUnit,
} from "@become/core";
import { useRouter } from "expo-router";
import { Input } from "@/components/Input";
import { Button } from "@/components/Button";
import { PacePicker } from "@/components/goals/PacePicker";
import { DangerZone } from "@/components/settings/DangerZone";
import { HealthSyncSection } from "@/components/settings/HealthSyncSection";
import { ScreenState } from "@/components/ScreenState";
import { WEBAPP_BASE_URL } from "@/lib/config";
import { useAuth } from "@/lib/auth/useAuth";
import { useFetch } from "@/lib/hooks/useFetch";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";
import { minTouchTarget } from "@/lib/a11y/touchTarget";
import { geistFontFamily } from "@/lib/theme/fonts";

export type BiologicalSex = "male" | "female" | "prefer_not_to_say";

const BIOLOGICAL_SEX_OPTIONS: { value: BiologicalSex; label: string }[] = [
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
  { value: "prefer_not_to_say", label: "Prefer not to say" },
];

/**
 * PROFILE SETTINGS. Profile, body stats, and unit preference using shared
 * conversion maths (NP-017 / NP-048). Originally the unreachable
 * `(tabs)/profile/health.tsx` screen; NP-302 made this the native Settings >
 * Profile tab's content (that route now just renders this with
 * `embedded={false}`, its original behavior, unchanged).
 *
 * Web parity:
 * - Account section: name (editable), email (read-only)
 * - Body Stats section:
 *   - lbs / kg unit toggle (Imperial vs Metric)
 *   - BMI badge (when height and weight are provided)
 *   - age (with 13+ floor validation / refusal display)
 *   - biological sex chips
 *   - height (ft/in for imperial, cm for metric)
 *   - current weight and target weight in the member's chosen unit
 *   - PacePicker for target weight
 * - Saves profile to PATCH /api/profile (storing kg and cm)
 * - Saves pace to PUT /api/goals { pillar: "nutrition", paceKgPerWeek, tz }
 * - Health sync (native extra) and account deletion (DangerZone)
 */
export function ProfileSettingsScreen({
  embedded = false,
}: {
  /** True when rendered inside Settings > Profile (NP-302): skips this
   * screen's own SafeAreaView chrome, the "Settings" title (the host
   * screen already shows one) and DangerZone (the host's Settings tab
   * keeps the one and only Delete account surface). */
  embedded?: boolean;
} = {}) {
  const { colors, tint } = useThemeTokens();
  const { token, refresh } = useAuth();
  const router = useRouter();

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
  const goals = useFetch(
    token ? `/api/goals?tz=${new Date().getTimezoneOffset()}` : null,
    GoalProgressResponseSchema,
    fetchOpts,
  );

  // Form states
  const [name, setName] = useState<string>("");
  const [email, setEmail] = useState<string>("");
  const [weightUnit, setWeightUnit] = useState<WeightUnit>("lbs");
  const [age, setAge] = useState<string>("");
  const [biologicalSex, setBiologicalSex] = useState<BiologicalSex | null>(null);
  const [heightFt, setHeightFt] = useState<string>("");
  const [heightIn, setHeightIn] = useState<string>("");
  const [heightCm, setHeightCm] = useState<string>("");
  const [weightDisplay, setWeightDisplay] = useState<string>("");
  const [targetWeightDisplay, setTargetWeightDisplay] = useState<string>("");
  const [paceKgPerWeek, setPaceKgPerWeek] = useState<number | null>(null);
  const [nutritionDirection, setNutritionDirection] = useState<
    "lose" | "maintain" | "gain" | null
  >(null);

  const [saving, setSaving] = useState<boolean>(false);
  const [ageError, setAgeError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<boolean>(false);

  const profileSeededRef = useRef(false);
  const goalsSeededRef = useRef(false);

  // Sync initial form inputs when profile data arrives from the network.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!profile.data || profileSeededRef.current) return;
    profileSeededRef.current = true;
    const data = profile.data;
    const p = data.profile ?? {};

    setName(data.name ?? "");
    setEmail(data.email ?? "");
    if (p.age != null) setAge(String(p.age));
    if (p.biologicalSex) setBiologicalSex(p.biologicalSex as BiologicalSex);

    const unit: WeightUnit = p.weightUnit === "kg" ? "kg" : "lbs";
    setWeightUnit(unit);

    if (unit === "lbs") {
      if (p.heightCm != null) {
        const { ft, inches } = cmToFtIn(p.heightCm);
        setHeightFt(String(ft));
        setHeightIn(String(inches));
      }
      if (p.currentWeightKg != null) {
        setWeightDisplay(String(displayWeight(p.currentWeightKg, unit)));
      }
      if (p.targetWeightKg != null) {
        setTargetWeightDisplay(String(displayWeight(p.targetWeightKg, unit)));
      }
    } else {
      if (p.heightCm != null) {
        setHeightCm(String(roundHeightCm(p.heightCm)));
      }
      if (p.currentWeightKg != null) {
        setWeightDisplay(String(roundWeight(p.currentWeightKg)));
      }
      if (p.targetWeightKg != null) {
        setTargetWeightDisplay(String(roundWeight(p.targetWeightKg)));
      }
    }
  }, [profile.data]);

  // Sync initial pace and direction when nutrition goals arrive from the network.
  useEffect(() => {
    if (!goals.data?.nutrition || goalsSeededRef.current) return;
    goalsSeededRef.current = true;
    const n = goals.data.nutrition;
    if (n.direction) setNutritionDirection(n.direction);
    if (n.target?.paceKgPerWeek != null) setPaceKgPerWeek(n.target.paceKgPerWeek);
  }, [goals.data?.nutrition]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Unit toggle with conversion math matching webapp/app/dashboard/settings/page.tsx
  const handleUnitToggle = (newUnit: WeightUnit) => {
    if (newUnit === weightUnit) return;

    if (newUnit === "lbs") {
      // metric → imperial
      if (heightCm !== "") {
        const { ft, inches } = cmToFtIn(Number(heightCm));
        setHeightFt(String(ft));
        setHeightIn(String(inches));
        setHeightCm("");
      }
      if (weightDisplay !== "") {
        setWeightDisplay(String(displayWeight(Number(weightDisplay), "lbs")));
      }
      if (targetWeightDisplay !== "") {
        setTargetWeightDisplay(
          String(displayWeight(Number(targetWeightDisplay), "lbs")),
        );
      }
    } else {
      // imperial → metric
      if (heightFt !== "" || heightIn !== "") {
        setHeightCm(
          String(
            roundHeightCm(
              ftInToCm(Number(heightFt) || 0, Number(heightIn) || 0),
            ),
          ),
        );
        setHeightFt("");
        setHeightIn("");
      }
      if (weightDisplay !== "") {
        setWeightDisplay(String(roundWeight(lbsToKg(Number(weightDisplay)))));
      }
      if (targetWeightDisplay !== "") {
        setTargetWeightDisplay(
          String(roundWeight(lbsToKg(Number(targetWeightDisplay)))),
        );
      }
    }

    setWeightUnit(newUnit);
  };

  const isImperial = weightUnit === "lbs";

  // Derive the storage values (always cm and kg) from display inputs
  const getStorageValues = useCallback(() => {
    const storedHeightCm = isImperial
      ? heightFt !== "" || heightIn !== ""
        ? ftInToCm(Number(heightFt) || 0, Number(heightIn) || 0)
        : undefined
      : heightCm !== ""
        ? Number(heightCm)
        : undefined;

    const storedWeightKg =
      weightDisplay !== ""
        ? isImperial
          ? lbsToKg(Number(weightDisplay))
          : Number(weightDisplay)
        : undefined;

    const storedTargetKg =
      targetWeightDisplay !== ""
        ? isImperial
          ? lbsToKg(Number(targetWeightDisplay))
          : Number(targetWeightDisplay)
        : undefined;

    return { storedHeightCm, storedWeightKg, storedTargetKg };
  }, [heightCm, heightFt, heightIn, isImperial, targetWeightDisplay, weightDisplay]);

  const { storedHeightCm: bmiCm, storedWeightKg: bmiKg } = getStorageValues();

  const onSaveProfile = useCallback(async () => {
    setSaveError(null);
    setSaveSuccess(false);

    setSaving(true);
    try {
      const { storedHeightCm, storedWeightKg, storedTargetKg } = getStorageValues();

      const profilePayload: Record<string, unknown> = {
        weightUnit,
      };
      if (age !== "") {
        profilePayload.age = Number(age);
      }
      if (biologicalSex) {
        profilePayload.biologicalSex = biologicalSex;
      }
      if (storedHeightCm !== undefined) {
        profilePayload.heightCm = storedHeightCm;
      }
      if (storedWeightKg !== undefined) {
        profilePayload.currentWeightKg = storedWeightKg;
      }
      if (storedTargetKg !== undefined) {
        profilePayload.targetWeightKg = storedTargetKg;
      }

      await apiFetch<ProfileResponse>(
        "/api/profile",
        ProfileResponseSchema,
        {
          method: "PATCH",
          baseUrl: WEBAPP_BASE_URL,
          getToken: () => token ?? undefined,
          body: {
            name: name.trim(),
            profile: profilePayload,
          },
        },
      );

      // Pace rides on the goal when target weight and pace are set
      if (storedTargetKg !== undefined && paceKgPerWeek) {
        await apiFetch<GoalProgressResponse>(
          "/api/goals",
          GoalProgressResponseSchema,
          {
            method: "PUT",
            baseUrl: WEBAPP_BASE_URL,
            getToken: () => token ?? undefined,
            body: {
              pillar: "nutrition",
              paceKgPerWeek,
              tz: new Date().getTimezoneOffset(),
            },
          },
        ).catch(() => {});
      }

      setAgeError(null);
      setSaveSuccess(true);
      await Promise.all([
        profile.refetch(),
        goals.refetch(),
        refresh?.(),
      ]);
    } catch (err: unknown) {
      if (err instanceof ApiError && err.status === 400) {
        const parsedAgeErr = AgeBelowMinimumErrorSchema.safeParse(err.body);
        if (parsedAgeErr.success && parsedAgeErr.data.error === "age_below_minimum") {
          const minAge = parsedAgeErr.data.minimumAge ?? LEGAL_MINIMUM_AGE;
          setAgeError(`You must be at least ${minAge} years old`);
          setSaveError(`Age below minimum: must be at least ${minAge}`);
          return;
        }
      }
      if (typeof err === "object" && err !== null && "body" in err) {
        const body = (err as { body: unknown }).body;
        const parsedAgeErr = AgeBelowMinimumErrorSchema.safeParse(body);
        if (parsedAgeErr.success && parsedAgeErr.data.error === "age_below_minimum") {
          const minAge = parsedAgeErr.data.minimumAge ?? LEGAL_MINIMUM_AGE;
          setAgeError(`You must be at least ${minAge} years old`);
          setSaveError(`Age below minimum: must be at least ${minAge}`);
          return;
        }
      }
      setSaveError("Failed to save profile");
    } finally {
      setSaving(false);
    }
  }, [
    age,
    biologicalSex,
    getStorageValues,
    goals,
    name,
    paceKgPerWeek,
    profile,
    refresh,
    token,
    weightUnit,
  ]);

  const hasData = !!profile.data;
  const fetchError = profile.error;
  const initialLoading = profile.loading && !hasData;

  const onRetry = useCallback(async () => {
    profileSeededRef.current = false;
    goalsSeededRef.current = false;
    await Promise.all([profile.refetch(), goals.refetch()]);
  }, [profile, goals]);

  // Embedded (Settings > Profile, NP-302): the host screen already supplies
  // its own SafeAreaView, so this becomes a plain View — a second
  // SafeAreaView here would double the top/bottom inset padding.
  const Wrapper: typeof View = embedded ? View : (SafeAreaView as unknown as typeof View);
  const screenStateTestId = embedded
    ? "settings-profile-tab-screen-state"
    : "health-settings-screen-state";
  const routeTestId = embedded ? "settings-profile-tab" : "health-settings-route";

  return (
    <ScreenState
      loading={initialLoading}
      error={fetchError}
      hasData={hasData}
      onRetry={onRetry}
      offlineNote="You're offline. Showing last-saved profile."
      testID={screenStateTestId}
    >
      <Wrapper
        {...(embedded ? {} : { edges: ["top", "bottom"] })}
        style={{ flex: 1, backgroundColor: colors.background }}
        testID={routeTestId}
      >
        <ScrollView contentContainerStyle={{ padding: 16, gap: 20 }}>
          {embedded ? null : (
            <Text
              accessibilityRole="header"
              className="text-foreground text-2xl font-bold"
            >
              Settings
            </Text>
          )}

          {/* ── Account section ── */}
          <View style={{ gap: 12 }}>
            <Text
              accessibilityRole="header"
              className="text-foreground text-lg font-semibold"
            >
              Account
            </Text>
            <Input
              testID="profile-name-input"
              label="Name"
              value={name}
              onChangeText={setName}
              placeholder="Your name"
            />
            <View>
              <Text className="text-foreground text-sm font-medium mb-1">
                Email
              </Text>
              {/* NP-337: the web shows email as a visibly greyed, read-only
                  field (`bg-zinc-50 ... cursor-not-allowed`); the shared
                  `Input` has no disabled styling at all, so this looked
                  exactly like the editable Name field above it. Rendered
                  directly rather than through `Input` to keep that shared
                  component's styling untouched for every other call site. */}
              <TextInput
                testID="profile-email-input"
                value={email}
                editable={false}
                accessibilityLabel="Email"
                placeholder="your.email@example.com"
                placeholderTextColor={colors["muted-foreground"]}
                className="bg-muted border border-border rounded-xl px-3 py-2.5 text-muted-foreground"
                style={[
                  minTouchTarget,
                  { fontFamily: geistFontFamily("") },
                ]}
              />
              <Text className="text-muted-foreground text-xs mt-1">
                Email cannot be changed.
              </Text>
            </View>
          </View>

          {/* ── Body Stats section ── */}
          <View testID="settings-body-stats" style={{ gap: 16 }}>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                flexWrap: "wrap",
                gap: 8,
              }}
            >
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 8,
                  flexShrink: 1,
                }}
              >
                <Text
                  accessibilityRole="header"
                  className="text-foreground text-lg font-semibold"
                  style={{ flexShrink: 1 }}
                >
                  Body Stats
                </Text>
                {bmiCm && bmiKg && (() => {
                  const bmi = bmiKg / Math.pow(bmiCm / 100, 2);
                  // NP-337: web colours this badge per category (amber for
                  // Overweight on the review account, etc. —
                  // `webapp/app/dashboard/settings/page.tsx`'s `cat.cls`
                  // map); native drew every category in the same flat grey
                  // (black in dark mode) chip.
                  const cat =
                    bmi < 18.5
                      ? { label: "Underweight", token: "info" as const }
                      : bmi < 25
                        ? { label: "Normal", token: "success" as const }
                        : bmi < 30
                          ? { label: "Overweight", token: "accent" as const }
                          : { label: "Obese", token: "destructive" as const };
                  return (
                    <View
                      style={{
                        paddingHorizontal: 10,
                        paddingVertical: 4,
                        borderRadius: 9999,
                        backgroundColor: tint(cat.token, 0.15),
                        flexShrink: 1,
                      }}
                    >
                      <Text
                        testID="bmi-badge"
                        style={{
                          flexShrink: 1,
                          fontSize: 12,
                          fontWeight: "600",
                          color: colors[cat.token],
                        }}
                      >
                        {`BMI ${bmi.toFixed(1)} · ${cat.label}`}
                      </Text>
                    </View>
                  );
                })()}
              </View>

              {/* Unit Toggle: Imperial (lbs) vs Metric (kg) */}
              <View
                testID="unit-toggle"
                style={{
                  flexDirection: "row",
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor: colors.border,
                  backgroundColor: colors.card,
                  padding: 2,
                  flexShrink: 1,
                }}
              >
                <Pressable
                  testID="unit-toggle-lbs"
                  accessibilityRole="radio"
                  accessibilityState={{ selected: weightUnit === "lbs" }}
                  onPress={() => handleUnitToggle("lbs")}
                  style={[
                    minTouchTarget,
                    {
                      flexShrink: 1,
                      paddingHorizontal: 12,
                      paddingVertical: 6,
                      borderRadius: 8,
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor:
                        weightUnit === "lbs" ? colors.foreground : "transparent",
                    },
                  ]}
                >
                  <Text
                    style={{
                      flexShrink: 1,
                      fontSize: 12,
                      fontWeight: "600",
                      color:
                        weightUnit === "lbs"
                          ? colors.background
                          : colors["muted-foreground"],
                    }}
                  >
                    Imperial
                  </Text>
                </Pressable>
                <Pressable
                  testID="unit-toggle-kg"
                  accessibilityRole="radio"
                  accessibilityState={{ selected: weightUnit === "kg" }}
                  onPress={() => handleUnitToggle("kg")}
                  style={[
                    minTouchTarget,
                    {
                      flexShrink: 1,
                      paddingHorizontal: 12,
                      paddingVertical: 6,
                      borderRadius: 8,
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor:
                        weightUnit === "kg" ? colors.foreground : "transparent",
                    },
                  ]}
                >
                  <Text
                    style={{
                      flexShrink: 1,
                      fontSize: 12,
                      fontWeight: "600",
                      color:
                        weightUnit === "kg"
                          ? colors.background
                          : colors["muted-foreground"],
                    }}
                  >
                    Metric
                  </Text>
                </Pressable>
              </View>
            </View>

            {/* Age */}
            <Input
              testID="profile-age-input"
              label="Age"
              keyboardType="numeric"
              value={age}
              onChangeText={(text) => {
                setAge(text);
                if (ageError) setAgeError(null);
              }}
              placeholder="—"
              error={ageError ?? undefined}
            />

            {/* Biological Sex */}
            <View style={{ gap: 6 }}>
              <Text className="text-foreground text-sm font-medium">
                Biological Sex
              </Text>
              <View
                testID="biological-sex-selector"
                style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}
              >
                {BIOLOGICAL_SEX_OPTIONS.map((opt) => {
                  const selected = biologicalSex === opt.value;
                  return (
                    <Pressable
                      key={opt.value}
                      testID={`sex-option-${opt.value}`}
                      accessibilityRole="radio"
                      accessibilityState={{ selected }}
                      onPress={() => setBiologicalSex(opt.value)}
                      style={[
                        minTouchTarget,
                        {
                          flexShrink: 1,
                          paddingVertical: 8,
                          paddingHorizontal: 14,
                          borderRadius: 9999,
                          borderWidth: 2,
                          borderColor: selected ? colors.primary : colors.border,
                          // NP-337: `colors.primary` is an `rgb(r g b)` STRING
                          // (`lib/theme/useThemeTokens.ts`), so appending a hex
                          // alpha suffix to it (`${colors.primary}18`) built an
                          // invalid colour — Android painted it opaque and the
                          // primary-coloured label vanished against it (the
                          // same class of bug `MissedWorkoutsCard.tsx` had).
                          // `tint()` composes the alpha correctly.
                          backgroundColor: selected
                            ? tint("primary", 0.09)
                            : colors.card,
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
                            ? colors.primary
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

            {/* Height */}
            {isImperial ? (
              <View style={{ gap: 6 }}>
                <Text className="text-foreground text-sm font-medium">
                  Height (ft / in)
                </Text>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <View style={{ flex: 1, position: "relative" }}>
                    <Input
                      testID="profile-height-ft-input"
                      keyboardType="numeric"
                      value={heightFt}
                      onChangeText={setHeightFt}
                      placeholder="5"
                      accessibilityLabel="Height in feet"
                    />
                    {/* NP-337: the web marks each box `ft` / `in` — native had
                        no unit on either, so a bare number read as ambiguous. */}
                    <Text
                      pointerEvents="none"
                      style={{
                        position: "absolute",
                        right: 12,
                        bottom: 14,
                        fontSize: 12,
                        color: colors["muted-foreground"],
                      }}
                    >
                      ft
                    </Text>
                  </View>
                  <View style={{ flex: 1, position: "relative" }}>
                    <Input
                      testID="profile-height-in-input"
                      keyboardType="numeric"
                      value={heightIn}
                      onChangeText={setHeightIn}
                      placeholder="10"
                      accessibilityLabel="Height in inches"
                    />
                    <Text
                      pointerEvents="none"
                      style={{
                        position: "absolute",
                        right: 12,
                        bottom: 14,
                        fontSize: 12,
                        color: colors["muted-foreground"],
                      }}
                    >
                      in
                    </Text>
                  </View>
                </View>
              </View>
            ) : (
              <Input
                testID="profile-height-cm-input"
                label="Height (cm)"
                keyboardType="numeric"
                value={heightCm}
                onChangeText={setHeightCm}
                placeholder="—"
              />
            )}

            {/* Current + Target Weight — side by side, matching the web's
                `grid-cols-2`. They used to stack as two full-width fields. */}
            <View style={{ flexDirection: "row", gap: 8 }}>
              <View style={{ flex: 1 }}>
                <Input
                  testID="profile-current-weight-input"
                  label={`Current Weight (${isImperial ? "lbs" : "kg"})`}
                  keyboardType="numeric"
                  value={weightDisplay}
                  onChangeText={setWeightDisplay}
                  placeholder="—"
                />
              </View>
              <View style={{ flex: 1 }}>
                <Input
                  testID="profile-target-weight-input"
                  label={`Target Weight (${isImperial ? "lbs" : "kg"})`}
                  keyboardType="numeric"
                  value={targetWeightDisplay}
                  onChangeText={setTargetWeightDisplay}
                  placeholder="—"
                />
              </View>
            </View>

            {/* Pace toward target weight */}
            {targetWeightDisplay !== "" && weightDisplay !== "" && (() => {
              const cur = Number(weightDisplay);
              const tgt = Number(targetWeightDisplay);
              const dir: "lose" | "maintain" | "gain" =
                nutritionDirection && nutritionDirection !== "maintain"
                  ? nutritionDirection
                  : Math.abs(cur - tgt) < (isImperial ? 2 : 0.9)
                    ? "maintain"
                    : tgt < cur
                      ? "lose"
                      : "gain";

              if (dir === "maintain") return null;

              return (
                <View style={{ marginTop: 4 }}>
                  <PacePicker
                    unit={isImperial ? "lbs" : "kg"}
                    direction={dir}
                    valueKgPerWeek={paceKgPerWeek ?? defaultPaceKg(dir)}
                    onChange={setPaceKgPerWeek}
                    latestWeight={cur}
                    targetWeight={tgt}
                  />
                </View>
              );
            })()}

            {/* Status alerts */}
            {saveError ? (
              <Text
                testID="profile-save-error"
                accessibilityRole="alert"
                className="text-destructive text-sm"
              >
                {saveError}
              </Text>
            ) : null}
            {saveSuccess ? (
              <Text
                testID="profile-save-success"
                className="text-primary text-sm font-medium"
              >
                Profile saved successfully
              </Text>
            ) : null}

            {/* Save profile button */}
            <Button
              testID="profile-save"
              onPress={() => {
                void onSaveProfile();
              }}
              disabled={saving}
            >
              {saving ? "Saving…" : "Save Changes"}
            </Button>
          </View>

          {/* Health sync: on for Health Connect (NP-199), still hidden on iOS
              until NP-185 installs HealthKit — see lib/health/enabled.ts. */}
          <HealthSyncSection />

          {/* THE DANGER ZONE, LAST AND ALWAYS VISIBLE — only this screen's
              route form (embedded=false) shows it: embedded in Settings >
              Profile, the Settings tab is the one and only Delete account
              surface. */}
          {embedded ? null : (
            <View
              className="border-t border-border"
              style={{ marginTop: 8, paddingTop: 16 }}
            >
              <DangerZone
                token={token}
                onDeleted={() => {
                  router.replace("/login");
                }}
                onKept={() => {
                  // This route holds no notification prefs; re-hydrating the
                  // session keeps whatever reads them elsewhere honest.
                  void refresh();
                }}
              />
            </View>
          )}
        </ScrollView>
      </Wrapper>
    </ScreenState>
  );
}

export default ProfileSettingsScreen;
