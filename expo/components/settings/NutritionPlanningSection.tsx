import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, View } from "react-native";
import { Text } from "@/components/Text";
import {
  ProfileResponseSchema,
  apiFetch,
  type ProfileResponse,
} from "@become/api-client";
import { useAuth } from "@/lib/auth/useAuth";
import { useFetch } from "@/lib/hooks/useFetch";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";
import { minTouchTarget } from "@/lib/a11y/touchTarget";
import { WEBAPP_BASE_URL } from "@/lib/config";
import {
  PLAN_PROMOTE_MODE_OPTIONS,
  type PlanPromoteModeValue,
} from "@/lib/settings/trainingPreferences";

function isPlanPromoteModeValue(value: unknown): value is PlanPromoteModeValue {
  return value === "manual" || value === "auto";
}

/**
 * NUTRITION PLANNING (NP-302) — the native Settings > Settings tab.
 *
 * Ports the web's `webapp/app/dashboard/settings/page.tsx` "Nutrition
 * Planning" section onto the SAME tab the web keeps it on — the web's
 * SETTINGS tab, not Training. Native used to bundle this choice inside the
 * Training tab's screen (`TrainingPreferencesScreen`); NP-302 moved it here
 * to match, and removed it from there.
 *
 * Saves immediately through `PATCH /api/profile`, the same route and key
 * (`planPromoteMode`) the web's unified Save Changes writes, and the one
 * `nutrition/index.tsx` reads to decide whether today's plans auto-promote.
 */
export function NutritionPlanningSection({
  testID = "settings-nutrition-planning",
}: {
  testID?: string;
}) {
  const { colors } = useThemeTokens();
  const { token } = useAuth();

  const profile = useFetch("/api/profile", ProfileResponseSchema, {
    baseUrl: WEBAPP_BASE_URL,
    getToken: () => token ?? undefined,
    skip: !token,
    useCache: true,
  });

  const [planPromoteMode, setPlanPromoteMode] =
    useState<PlanPromoteModeValue>("manual");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const seededRef = useRef(false);

  useEffect(() => {
    // NP-337: seed from a FRESH fetch only. `useCache: true` paints the
    // last-known value immediately (`isCached: true`) so the section is not
    // blank while the request is in flight — but seeding from it too latched
    // `seededRef` before the real network answer ever arrived, so reopening
    // Settings after a save made elsewhere (the web, or a prior native
    // session) kept showing the stale cached value forever.
    if (!profile.data || profile.isCached || seededRef.current) return;
    seededRef.current = true;
    const raw = (profile.data as ProfileResponse | null)?.profile as
      | Record<string, unknown>
      | null
      | undefined;
    setPlanPromoteMode(
      isPlanPromoteModeValue(raw?.planPromoteMode) ? raw.planPromoteMode : "manual",
    );
  }, [profile.data, profile.isCached]);

  const onSelect = useCallback(
    async (value: PlanPromoteModeValue) => {
      if (!token || value === planPromoteMode) return;
      const previous = planPromoteMode;
      setPlanPromoteMode(value);
      setSaveError(null);
      setSaving(true);
      try {
        await apiFetch<ProfileResponse>("/api/profile", ProfileResponseSchema, {
          method: "PATCH",
          baseUrl: WEBAPP_BASE_URL,
          getToken: () => token ?? undefined,
          body: { profile: { planPromoteMode: value } },
        });
        // NP-337: fire-and-forget. `saving` used to wait on this settling —
        // when it didn't (or threw), both cards stayed disabled forever and
        // the choice could never be changed back. The PATCH above is the
        // part that must succeed; this refetch only freshens the cache for
        // the next time the section mounts.
        profile.refetch().catch(() => {});
      } catch {
        setPlanPromoteMode(previous);
        setSaveError("Failed to save Nutrition Planning");
      } finally {
        setSaving(false);
      }
    },
    [planPromoteMode, profile, token],
  );

  const selectedBorder = colors.primary;

  return (
    <View
      testID={`${testID}-section`}
      className="rounded-xl border border-border bg-card p-4"
      style={{ gap: 8 }}
    >
      <Text
        accessibilityRole="header"
        className="text-foreground text-base font-semibold"
      >
        Nutrition Planning
      </Text>
      <Text className="text-muted-foreground text-xs">
        When a planned meal&apos;s day arrives, how should it become a log?
      </Text>
      <View style={{ gap: 8, marginTop: 4 }}>
        {PLAN_PROMOTE_MODE_OPTIONS.map((opt) => {
          const selected = planPromoteMode === opt.value;
          return (
            <Pressable
              key={opt.value}
              testID={`${testID}-${opt.value}`}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              accessibilityLabel={opt.label}
              accessibilityHint={opt.description}
              onPress={() => {
                void onSelect(opt.value);
              }}
              disabled={saving}
              style={[
                minTouchTarget,
                {
                  gap: 4,
                  padding: 12,
                  borderRadius: 12,
                  borderWidth: 2,
                  borderColor: selected ? selectedBorder : colors.border,
                  backgroundColor: colors.card,
                },
              ]}
            >
              <Text className="text-foreground text-sm font-semibold">
                {opt.label}
              </Text>
              <Text className="text-muted-foreground text-xs">
                {opt.description}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {saveError ? (
        <Text
          testID={`${testID}-error`}
          accessibilityRole="alert"
          className="text-destructive text-sm"
        >
          {saveError}
        </Text>
      ) : null}
    </View>
  );
}

export default NutritionPlanningSection;
