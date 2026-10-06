import { View, Pressable, ScrollView } from "react-native";
import { useEffect, useState } from "react";
import { Target, TrendingDown, TrendingUp, Minus } from "lucide-react-native";
import { Text } from "@/components/Text";
import { Card } from "@/components/Card";
import { PacePicker } from "@/components/goals/PacePicker";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";
import { minTouchTarget } from "@/lib/a11y/touchTarget";
import { apiFetch } from "@become/api-client";
import {
  GoalProgressResponseSchema,
  GoalUpdateRequestSchema,
  type GoalProgressResponse,
} from "@become/api-client";
import { WEBAPP_BASE_URL } from "@/lib/config";
import { useAuth } from "@/lib/auth/useAuth";
import { withTz } from "@/lib/time/localDay";
import { fmtUnit, readReached } from "@become/core";

/**
 * Your plan — the nutrition weight goal as a plan: target, chosen pace, ETA,
 * and where you stand against the line. Ported 1:1 from
 * `webapp/components/goals/PlanCard.tsx` (NP-148).
 *
 * Reads GET /api/goals?tz=; editing the pace writes it back with
 * PUT /api/goals { pillar: 'nutrition', paceKgPerWeek, tz }. Fires
 * onPaceChange after a pace write round-trips so the host goals screen can
 * re-derive calorie/macro targets — pace otherwise lives entirely inside
 * this card and never reaches them.
 */
export interface NutritionPlanCardProps {
  /** Bumped after a weigh-in so the card re-reads /api/goals. */
  refreshKey?: number;
  onPaceChange?: (info: {
    paceKgPerWeek: number;
    direction: "lose" | "maintain" | "gain";
  }) => void;
  testID?: string;
}

export function NutritionPlanCard({
  refreshKey = 0,
  onPaceChange,
  testID = "plan-card",
}: NutritionPlanCardProps) {
  const { token } = useAuth();
  const { colors } = useThemeTokens();
  const [data, setData] = useState<GoalProgressResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!token) {
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const tz = new Date().getTimezoneOffset();
        const g = await apiFetch(withTz("/api/goals", tz), GoalProgressResponseSchema, {
          baseUrl: WEBAPP_BASE_URL,
          getToken: () => token ?? undefined,
        });
        if (!cancelled) setData(g);
      } catch {
        if (!cancelled) setData(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [token, loadAttempt, refreshKey]);

  const setPace = async (kg: number) => {
    if (!token || saving) return;
    setSaving(true);
    try {
      const tz = new Date().getTimezoneOffset();
      const body = GoalUpdateRequestSchema.parse({
        pillar: "nutrition",
        paceKgPerWeek: kg,
        tz,
      });
      const fresh = await apiFetch("/api/goals", GoalProgressResponseSchema, {
        method: "PUT",
        body,
        baseUrl: WEBAPP_BASE_URL,
        getToken: () => token ?? undefined,
      });
      setData(fresh);
      if (fresh.nutrition?.direction) {
        onPaceChange?.({
          paceKgPerWeek: kg,
          direction: fresh.nutrition.direction,
        });
      }
    } catch {
      // keep the old pace on screen; the host shows its own error surface
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Card testID={testID}>
        <View
          testID={`${testID}-loading`}
          style={{ height: 64, borderRadius: 12, backgroundColor: colors.border, opacity: 0.5 }}
        />
      </Card>
    );
  }

  if (!data) {
    return (
      <Card testID={testID}>
        <Text className="text-muted-foreground text-xs font-semibold uppercase tracking-wide">
          Your plan
        </Text>
        <Text className="text-foreground text-sm mt-1">
          Plan details are temporarily unavailable. Your saved goals are unchanged.
        </Text>
        <Pressable
          testID={`${testID}-retry`}
          accessibilityRole="button"
          accessibilityLabel="Try again"
          onPress={() => {
            setLoading(true);
            setLoadAttempt((a) => a + 1);
          }}
          style={minTouchTarget}
          className="mt-3 rounded-lg border border-border px-3 py-1.5 self-start"
        >
          <Text className="text-foreground text-xs font-semibold">Try again</Text>
        </Pressable>
      </Card>
    );
  }

  const n = data.nutrition;
  if (!n || n.status === "none" || !n.target.weight) {
    return (
      <Card testID={testID}>
        <Text className="text-muted-foreground text-xs font-semibold uppercase tracking-wide">
          Your plan
        </Text>
        <Text className="text-foreground text-sm mt-1">
          No target weight yet. Set one in Settings and this becomes a plan with a pace and a date.
        </Text>
      </Card>
    );
  }

  const unit = n.unit;
  const DirIcon = n.direction === "lose" ? TrendingDown : n.direction === "gain" ? TrendingUp : Minus;
  const p = n.pace;
  // "Reached" is the confirmed goal; inside the band today but not yet held
  // for a week is "At goal" — the same distinction the web draws, so no two
  // screens claim different things about one goal.
  const reached = readReached(n.status, p?.status);
  const status =
    reached === "reached"
      ? "Reached"
      : reached === "at-goal"
        ? "At goal"
        : p?.status === "behind"
          ? `${fmtUnit(p.behindByKg, unit)} behind`
          : p?.status === "ahead"
            ? `${fmtUnit(p.aheadByKg, unit)} ahead`
            : p?.status === "on"
              ? "On pace"
              : null;

  return (
    <Card testID={testID}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <Text className="text-muted-foreground text-xs font-semibold uppercase tracking-wide">
          Your plan
        </Text>
        {status ? (
          <View
            testID={`${testID}-status`}
            className={`rounded-full px-2 py-0.5 ${
              p?.status === "behind" ? "bg-amber-500/15" : "bg-emerald-500/15"
            }`}
          >
            <Text
              className={`text-xs font-semibold ${
                p?.status === "behind"
                  ? "text-amber-600 dark:text-amber-400"
                  : "text-emerald-600 dark:text-emerald-400"
              }`}
            >
              {status}
            </Text>
          </View>
        ) : null}
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 12 }}>
        {/* The web's `bg-purple-100 dark:bg-purple-900/30` icon chip
            (`PlanCard.tsx`) — the `mindset` token (purple-600/400), not the
            brand accent (amber/orange) native drew before (NP-266). */}
        <View
          testID={`${testID}-icon`}
          className="bg-purple-100 dark:bg-purple-900/30"
          style={{
            width: 40,
            height: 40,
            borderRadius: 12,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Target size={20} color={colors.mindset} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text className="text-foreground text-sm font-semibold" testID={`${testID}-headline`}>
            <DirIcon size={14} color={colors["muted-foreground"]} />{" "}
            {n.now.weight != null ? `${Math.round(n.now.weight)} → ` : ""}
            {Math.round(n.target.weight)} {unit}
            {p && p.remainingKg > 0 ? ` · ${fmtUnit(p.remainingKg, unit)} to go` : ""}
          </Text>
          <Text className="text-muted-foreground text-xs mt-0.5" testID={`${testID}-subline`}>
            {n.baseline.weight != null && n.baseline.date
              ? `Started ${Math.round(n.baseline.weight)} ${unit} on ${new Date(n.baseline.date).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`
              : ""}
            {p?.etaDate && p.status !== "done"
              ? ` · at this pace ${p.eta} → ${new Date(p.etaDate).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`
              : ""}
          </Text>
        </View>
      </View>
      {n.direction && n.direction !== "maintain" && n.status === "active" ? (
        <ScrollView horizontal={false} bounces={false}>
          <PacePicker
            unit={unit}
            direction={n.direction}
            valueKgPerWeek={n.target.paceKgPerWeek}
            onChange={setPace}
            latestWeight={n.now.weight}
            targetWeight={n.target.weight}
            disabled={saving}
            compact
            testID={`${testID}-pace`}
          />
        </ScrollView>
      ) : null}
    </Card>
  );
}

export default NutritionPlanCard;
