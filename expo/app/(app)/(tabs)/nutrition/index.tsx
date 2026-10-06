import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  GestureResponderEvent,
  Modal,
  Pressable,
  ScrollView,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  BookOpen,
  CalendarClock,
  CalendarDays,
  Camera,
  ChefHat,
  ChevronDown,
  Clock,
  Copy,
  History,
  Plus,
  Search,
  Trash2,
  Upload,
  UtensilsCrossed,
  Zap,
} from "lucide-react-native";
import { z } from "zod";
import {
  GoalProgressResponseSchema,
  MealLogsDayResponseSchema,
  MealScheduleResponseSchema,
  NutritionGoalsResponseSchema,
  NutritionLogDayResponseSchema,
  NutritionScanResponseSchema,
  ProfileResponseSchema,
  TagsResponseSchema,
  apiFetch,
  type Food,
  type Meal,
  type MealLog,
  type NutritionScan,
  type ProfileResponse,
} from "@become/api-client";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Input } from "@/components/Input";
import { Text } from "@/components/Text";
import { WEBAPP_BASE_URL } from "@/lib/config";
import { useAuth } from "@/lib/auth/useAuth";
import { useFetch } from "@/lib/hooks/useFetch";
import {
  localDateKey,
  useLocalDay,
  useOnForeground,
  withTz,
} from "@/lib/time/localDay";
import { buildDayOccurrences } from "@/lib/nutrition/dayOrder";
import {
  defaultTagAt,
  minutesOfDay,
  sortMinutesForTag,
  type TagWindow,
} from "@/lib/nutrition/mealSchedule";
import { nutritionGoalLine } from "@/lib/nutrition/goalLine";
import { isFutureLocalDate } from "@/lib/nutrition/mealPlanDates";
import { createMealPlan } from "@/lib/nutrition/mealPlanApi";
import type { QuantityPickerFood } from "@/components/nutrition/QuantityPicker";
import { PlanFoodSheet } from "@/components/nutrition/PlanFoodSheet";
/**
 * The web's "Planned for <weekday, Mon d>" toast
 * (`webapp/app/dashboard/nutrition/page.tsx:1509-1512`): the planned day
 * formatted `en-US` with weekday long, month short, day numeric.
 */
function plannedForToast(date: Date): string {
  return `Planned for ${date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
  })}`;
}
import {
  canCombine,
  combineLoggedItems,
  pickedLogItems,
  selectableLogItems,
  selectionKey,
  toggleSelection,
} from "@/lib/nutrition/combineItems";
import {
  addToLoggedMeal,
  logBasket,
  logSavedMeal,
} from "@/lib/nutrition/basketLog";
import type { MealItemPayload } from "@/lib/nutrition/mealLogActions";
import { buildMealItemPayload } from "@/lib/nutrition/mealLogActions";
import { defaultVariantOf } from "@/lib/nutrition/foodMath";
import { useEntitlements } from "@/lib/entitlements";
import { useApiErrorHandler } from "@/lib/errors";
import { CalorieRing } from "@/components/nutrition/CalorieRing";
import { NutritionConsultantTeaser } from "@/components/nutrition/NutritionConsultantTeaser";
import { CombineSheet } from "@/components/nutrition/CombineSheet";
import { BasketSheet, type BasketItem } from "@/components/nutrition/BasketSheet";
import { MealLogSheet } from "@/components/nutrition/MealLogSheet";
import { CopyDaySheet } from "@/components/nutrition/CopyDaySheet";
import { ApplyMealSheet } from "@/components/nutrition/ApplyMealSheet";
import { EditLoggedMealSheet } from "@/components/nutrition/EditLoggedMealSheet";
import { EditLogItemSheet } from "@/components/nutrition/EditLogItemSheet";
import { DateNav } from "@/components/nutrition/DateNav";
import { TagSection } from "@/components/nutrition/TagSection";
import { FoodSearchSheet } from "@/components/nutrition/FoodSearchSheet";
import { EstimateSheet } from "@/components/nutrition/EstimateSheet";
import { ScanHistorySheet } from "@/components/nutrition/ScanHistorySheet";
import { WaterTracker } from "@/components/nutrition/WaterTracker";
import { QuickAddSheet, type QuickAddData } from "@/components/nutrition/QuickAddSheet";
import { invalidateMindSession } from "@/lib/mind/sessionCache";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";
import { PlansResponseSchema, type MealPlan, type PlansResponse } from "@/lib/nutrition/mealPlans";
import type { MealPlanItem } from "@/components/nutrition/NutritionPlanCard";
import { TimelineWeekView } from "@/components/nutrition/TimelineWeekView";
import { TimelineMonthView } from "@/components/nutrition/TimelineMonthView";
import { FoodReportsBadge } from "@/components/nutrition/FoodReportsBadge";
import { FoodReportsSheet } from "@/components/nutrition/FoodReportsSheet";
import { FlagFoodSheet } from "@/components/nutrition/FlagFoodSheet";
import { TrainingPreferencesScreen } from "@/components/settings/TrainingPreferences";
import { applyLogCorrection } from "@/lib/nutrition/foodFlags";
import { isObjectIdString } from "@/lib/nutrition/foodImport";

export type NutritionViewMode = "day" | "week" | "month" | "training";

const EMPTY_PLANS: MealPlan[] = [];
const EMPTY_LOGS: MealLog[] = [];

export default function NutritionIndexRoute() {
  const { colors, scrim, tint } = useThemeTokens();
  const router = useRouter();
  const { token } = useAuth();
  const params = useLocalSearchParams<{
    date?: string;
    quickAdd?: string;
    view?: string;
  }>();

  const [viewMode, setViewMode] = useState<NutritionViewMode>(() => {
    if (
      params.view === "week" ||
      params.view === "month" ||
      params.view === "day" ||
      params.view === "training"
    ) {
      return params.view;
    }
    return "day";
  });

  useEffect(() => {
    if (
      params.view === "week" ||
      params.view === "month" ||
      params.view === "day" ||
      params.view === "training"
    ) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- sync from route param
      setViewMode(params.view);
    }
  }, [params.view]);

  // Device-local day and timezone offset (NP-035).
  // Automatically rolls over on local midnight timer or app foregrounding.
  const { day: today, tzOffset } = useLocalDay();

  // If params.date is provided (e.g. deep link or push), use it.
  // When no route param is provided, viewingDate follows `today` dynamically.
  const [explicitDate, setExplicitDate] = useState<string | null>(() => {
    return params.date && /^\d{4}-\d{2}-\d{2}$/.test(params.date)
      ? params.date
      : null;
  });

  useEffect(() => {
    if (params.date && /^\d{4}-\d{2}-\d{2}$/.test(params.date)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- sync from route param
      setExplicitDate(params.date);
    }
  }, [params.date]);

  const handleViewChange = useCallback(
    (mode: NutritionViewMode) => {
      setViewMode(mode);
      router.push({
        pathname: "/(tabs)/nutrition",
        params: {
          ...(explicitDate ? { date: explicitDate } : {}),
          view: mode,
        },
      } as any);
    },
    [explicitDate, router],
  );

  const handleOpenDay = useCallback(
    (dateKey: string) => {
      setExplicitDate(dateKey);
      setViewMode("day");
      router.push({
        pathname: "/(tabs)/nutrition",
        params: {
          date: dateKey,
          view: "day",
        },
      } as any);
    },
    [router],
  );

  const activeDate = explicitDate ?? today;
  const isToday = activeDate === today;

  const [y, m, d] = activeDate.split("-").map(Number);
  const activeDateObj = useMemo(
    () => new Date(y ?? 2026, (m ?? 1) - 1, d ?? 1, 12, 0, 0),
    [y, m, d],
  );
  const isFuture = isFutureLocalDate(activeDateObj);
  // Show planned meals on today and future days (NP-012, NP-147).
  const showPlans = activeDate >= today;

  // ── Fetchers ───────────────────────────────────────────────────────────────

  // 1. GET /api/meal-logs?date=YYYY-MM-DD&tz=<minutes>
  const mealLogsPath = withTz(`/api/meal-logs?date=${activeDate}`, tzOffset);
  const {
    data: mealLogsData,
    refetch: refetchMealLogs,
  } = useFetch(mealLogsPath, MealLogsDayResponseSchema, {
    baseUrl: WEBAPP_BASE_URL,
    getToken: () => token ?? undefined,
    skip: !token,
  });

  // 2. GET /api/nutrition/log?date=YYYY-MM-DD&tz=<minutes> for water and quick adds
  const sideTablesPath = withTz(`/api/nutrition/log?date=${activeDate}`, tzOffset);
  const {
    data: sideTablesData,
    refetch: refetchSideTables,
  } = useFetch(sideTablesPath, NutritionLogDayResponseSchema, {
    baseUrl: WEBAPP_BASE_URL,
    getToken: () => token ?? undefined,
    skip: !token,
  });

  // 3. GET /api/tags
  const { data: tagsData } = useFetch("/api/tags", TagsResponseSchema, {
    baseUrl: WEBAPP_BASE_URL,
    getToken: () => token ?? undefined,
    skip: !token,
  });

  // 4. GET /api/nutrition/meal-schedule
  const { data: scheduleData } = useFetch(
    "/api/nutrition/meal-schedule",
    MealScheduleResponseSchema,
    {
      baseUrl: WEBAPP_BASE_URL,
      getToken: () => token ?? undefined,
      skip: !token,
    },
  );

  // 5. GET /api/nutrition/goals
  const { data: goalsData } = useFetch(
    "/api/nutrition/goals",
    NutritionGoalsResponseSchema,
    {
      baseUrl: WEBAPP_BASE_URL,
      getToken: () => token ?? undefined,
      skip: !token,
    },
  );

  // 6. GET /api/goals?tz=<minutes>
  const goalsWeightPath = withTz("/api/goals", tzOffset);
  const { data: goalsWeightData } = useFetch(
    goalsWeightPath,
    GoalProgressResponseSchema,
    {
      baseUrl: WEBAPP_BASE_URL,
      getToken: () => token ?? undefined,
      skip: !token,
    },
  );

  // 7. GET /api/profile for planPromoteMode (NP-147)
  const { data: profileData } = useFetch(
    "/api/profile",
    ProfileResponseSchema,
    {
      baseUrl: WEBAPP_BASE_URL,
      getToken: () => token ?? undefined,
      skip: !token,
    },
  );
  const planPromoteMode =
    (profileData as ProfileResponse | null)?.profile?.planPromoteMode ?? "manual";

  // 8. GET /api/meal-plans?from=YYYY-MM-DD&to=YYYY-MM-DD (NP-147)
  const mealPlansPath = `/api/meal-plans?from=${activeDate}&to=${activeDate}`;
  const {
    data: plansData,
    refetch: refetchMealPlans,
  } = useFetch(mealPlansPath, PlansResponseSchema, {
    baseUrl: WEBAPP_BASE_URL,
    getToken: () => token ?? undefined,
    skip: !token || !showPlans,
  });

  useOnForeground(() => {
    void refetchMealLogs();
    void refetchSideTables();
    if (showPlans) {
      void refetchMealPlans();
    }
  });

  // ── Optimistic item and plan deletion ─────────────────────────────────────
  const [removedItemIds, setRemovedItemIds] = useState<Set<string>>(new Set());
  const [removedPlanIds, setRemovedPlanIds] = useState<Set<string>>(new Set());
  const loggingPlanIdsRef = useRef<Set<string>>(new Set());
  // Food reports (NP-174): the flag sheet target for a logged row. Declared
  // here — before the callbacks that set it — so no callback reads it early.
  const [flagTarget, setFlagTarget] = useState<{
    logId: string;
    itemId: string;
    foodId: string;
    name: string;
    nutrition: {
      calories: number;
      protein: number;
      carbs: number;
      fats: number;
      fiber: number;
    };
    portionLabel: string;
    portionFactor: number;
  } | null>(null);

  const displayedLogs = useMemo(() => {
    const rawLogs = (mealLogsData?.logs ?? []) as MealLog[];
    if (removedItemIds.size === 0) return rawLogs;
    return rawLogs
      .map((log) => {
        const filteredItems = (log.items ?? []).filter((item) => {
          const id = String(item._id ?? item.id ?? "");
          return !removedItemIds.has(id);
        });
        return {
          ...log,
          items: filteredItems,
        };
      })
      .filter((log) => (log.items ?? []).length > 0);
  }, [mealLogsData?.logs, removedItemIds]);

  const activePlans = useMemo(() => {
    if (!showPlans) return EMPTY_PLANS;
    const raw = ((plansData as PlansResponse | null)?.plans ?? []) as MealPlan[];
    return raw.filter((p) => {
      if (p.status !== "active") return false;
      if (removedPlanIds.has(p._id)) return false;
      const key = p.plannedDateKey ?? p.plannedDate?.split("T")[0];
      return !key || key === activeDate;
    });
  }, [showPlans, plansData, removedPlanIds, activeDate]);

  const handleRemoveItem = useCallback(
    async (logId: string, itemId: string) => {
      setRemovedItemIds((prev) => new Set(prev).add(itemId));
      try {
        await apiFetch(
          `/api/meal-logs/${encodeURIComponent(logId)}/items/${encodeURIComponent(itemId)}`,
          z.any(),
          {
            method: "DELETE",
            baseUrl: WEBAPP_BASE_URL,
            getToken: () => token ?? undefined,
          },
        );
        await refetchMealLogs();
      } catch {
        // Revert on error
        setRemovedItemIds((prev) => {
          const next = new Set(prev);
          next.delete(itemId);
          return next;
        });
      }
    },
    [refetchMealLogs, token],
  );

  // "Something look wrong?" on a logged row (NP-174). Opens the flag sheet
  // with the row's own per-serving nutrition as the correction basis. The
  // flag never edits the shared Food; the correction PATCHes the member's
  // own log item instead.
  const handleFlagItem = useCallback(
    (logId: string, item: MealLog["items"][number]) => {
      const foodId =
        typeof item.foodId === "string" && isObjectIdString(item.foodId)
          ? item.foodId
          : null;
      if (!foodId) return;
      const nut = item.nutrition ?? { calories: 0, protein: 0, carbs: 0, fats: 0 };
      const servings =
        typeof item.servings === "number" && item.servings > 0 ? item.servings : 1;
      const portionLabel =
        item.servingLabel ||
        (item.loggedQuantity != null && item.loggedUnit
          ? `${item.loggedQuantity} ${item.loggedUnit}`
          : "this entry");
      setFlagTarget({
        logId,
        itemId: String(item._id ?? item.id ?? ""),
        foodId,
        name: item.name,
        nutrition: {
          calories: nut.calories ?? 0,
          protein: nut.protein ?? 0,
          carbs: nut.carbs ?? 0,
          fats: nut.fats ?? 0,
          fiber: nut.fiber ?? 0,
        },
        portionLabel,
        portionFactor: servings,
      });
    },
    [],
  );

  const handleApplyFlagCorrection = useCallback(
    async (values: {
      calories: number;
      protein: number;
      carbs: number;
      fats: number;
      fiber: number;
      servingLabel?: string;
    }) => {
      if (!flagTarget) return;
      const res = await applyLogCorrection({
        logId: flagTarget.logId,
        itemId: flagTarget.itemId,
        correction: values,
        jwt: token ?? null,
      });
      if (res.status === "applied") {
        setFlagTarget(null);
        await refetchMealLogs();
      }
    },
    [flagTarget, token, refetchMealLogs],
  );

  // ── Edit a logged item or a whole logged meal (NP-095) ───────────────────
  //
  // The web's EditFoodModal / EditMealModal as sheets on the native quantity
  // picker: change an item's quantity + unit, or move a whole logged meal to
  // another tag or time — keeping the untimed choice. Both save through the
  // same PATCH routes the web uses, then refetch the day.
  const [editItemTarget, setEditItemTarget] = useState<{
    logId: string;
    item: MealLog["items"][number];
    tag: string;
  } | null>(null);
  const [editMealTarget, setEditMealTarget] = useState<{
    logId: string;
    mealName?: string;
    tag: string;
  } | null>(null);

  const editItemLog = useMemo(() => {
    if (!editItemTarget) return null;
    return (
      displayedLogs.find(
        (log) =>
          String(log._id ?? (log as unknown as { id?: unknown }).id ?? "") ===
          editItemTarget.logId,
      ) ?? null
    );
  }, [displayedLogs, editItemTarget]);

  const editMealLog = useMemo(() => {
    if (!editMealTarget) return null;
    return (
      displayedLogs.find(
        (log) =>
          String(log._id ?? (log as unknown as { id?: unknown }).id ?? "") ===
          editMealTarget.logId,
      ) ?? null
    );
  }, [displayedLogs, editMealTarget]);

  const availableTags = useMemo(
    () => ({
      defaults: Array.isArray(
        (tagsData as unknown as { defaults?: unknown } | null)?.defaults,
      )
        ? ((tagsData as unknown as { defaults: string[] }).defaults ?? [])
        : [],
      userTags: Array.isArray(
        (tagsData as unknown as { userTags?: unknown } | null)?.userTags,
      )
        ? ((tagsData as unknown as { userTags: string[] }).userTags ?? [])
        : [],
    }),
    [tagsData],
  );

  const handleEditItem = useCallback(
    (logId: string, item: MealLog["items"][number], tag: string) => {
      setEditItemTarget({ logId, item, tag });
    },
    [],
  );

  const handleEditMeal = useCallback(
    (logId: string, mealName: string | undefined, tag: string) => {
      setEditMealTarget({ logId, mealName, tag });
    },
    [],
  );

  const handleEditSaved = useCallback(async () => {
    await refetchMealLogs();
  }, [refetchMealLogs]);

  // Log it — promote plan to untimed meal log (today only)
  const handleLogPlan = useCallback(
    async (planId: string) => {
      if (loggingPlanIdsRef.current.has(planId)) return;
      loggingPlanIdsRef.current.add(planId);
      setRemovedPlanIds((prev) => new Set(prev).add(planId));
      try {
        await apiFetch(
          `/api/meal-plans/${encodeURIComponent(planId)}/promote`,
          z.any(),
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: { untimed: true },
            baseUrl: WEBAPP_BASE_URL,
            getToken: () => token ?? undefined,
          },
        );
        await Promise.all([refetchMealLogs(), refetchMealPlans()]);
      } catch {
        // In case of conflict (already promoted) or error, resync
        await Promise.all([refetchMealLogs(), refetchMealPlans()]);
      } finally {
        loggingPlanIdsRef.current.delete(planId);
      }
    },
    [token, refetchMealLogs, refetchMealPlans],
  );

  const handleRemovePlan = useCallback(
    async (planId: string, scope: "one" | "series" = "one") => {
      // A whole-series remove drops every sibling sharing the seriesId
      // optimistically (the web's `timeline/page.tsx:839-860` port); a single
      // remove hides just the one card.
      const seriesId =
        scope === "series"
          ? activePlans.find((p) => p._id === planId)?.seriesId
          : undefined;
      const hiddenIds =
        scope === "series" && seriesId
          ? activePlans
              .filter((p) => p.seriesId === seriesId)
              .map((p) => p._id)
          : [planId];
      setRemovedPlanIds((prev) => new Set([...prev, ...hiddenIds]));
      try {
        const qs = scope === "series" ? "?series=true" : "";
        await apiFetch(
          `/api/meal-plans/${encodeURIComponent(planId)}${qs}`,
          z.any(),
          {
            method: "DELETE",
            baseUrl: WEBAPP_BASE_URL,
            getToken: () => token ?? undefined,
          },
        );
        await refetchMealPlans();
      } catch {
        setRemovedPlanIds((prev) => {
          const next = new Set(prev);
          for (const id of hiddenIds) next.delete(id);
          return next;
        });
      }
    },
    [activePlans, token, refetchMealPlans],
  );

  // ── Edit one planned item (NP-233) ───────────────────────────────────────
  //
  // The card hands back the plan id + the item + the plan's full items array;
  // the sheet (in `planId` + `planItems` mode) rebuilds `items[]` and PATCHes
  // `/api/meal-plans/{id}` with `{ items }`, then the day refetches.
  const [editPlanTarget, setEditPlanTarget] = useState<{
    planId: string;
    item: MealPlanItem;
    planItems: MealPlanItem[];
  } | null>(null);

  const handleEditPlanItem = useCallback(
    (planId: string, item: MealPlanItem, planItems: MealPlanItem[]) => {
      setEditPlanTarget({ planId, item, planItems });
    },
    [],
  );

  const handleEditPlanSaved = useCallback(async () => {
    await refetchMealPlans();
  }, [refetchMealPlans]);

  const handleSkipPlan = useCallback(
    async (planId: string) => {
      setRemovedPlanIds((prev) => new Set(prev).add(planId));
      try {
        await apiFetch(
          `/api/meal-plans/${encodeURIComponent(planId)}/skip`,
          z.any(),
          {
            method: "POST",
            baseUrl: WEBAPP_BASE_URL,
            getToken: () => token ?? undefined,
          },
        );
        await refetchMealPlans();
      } catch {
        setRemovedPlanIds((prev) => {
          const next = new Set(prev);
          next.delete(planId);
          return next;
        });
      }
    },
    [token, refetchMealPlans],
  );

  // ── Auto-promote sweep (NP-147) ───────────────────────────────────────────
  const [undoBatch, setUndoBatch] = useState<{
    logIds: string[];
    expiresAt: number;
  } | null>(null);

  const autoPromoteFiredFor = useRef<string | null>(null);

  useEffect(() => {
    if (planPromoteMode !== "auto") return;
    if (!isToday) return;
    if (!plansData) return;
    if (autoPromoteFiredFor.current === today) return;

    const raw = ((plansData as PlansResponse | null)?.plans ?? []) as MealPlan[];
    const targets = raw.filter(
      (p) =>
        p.status === "active" &&
        (p.plannedDateKey ?? p.plannedDate?.split("T")[0]) === today,
    );

    if (targets.length === 0) {
      autoPromoteFiredFor.current = today;
      return;
    }

    autoPromoteFiredFor.current = today;
    let cancelled = false;

    const runSweep = async () => {
      const results = await Promise.allSettled(
        targets.map((p) =>
          apiFetch<{ success?: boolean; log?: { _id?: string } }>(
            `/api/meal-plans/${encodeURIComponent(p._id)}/promote`,
            z.any(),
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: { untimed: true },
              baseUrl: WEBAPP_BASE_URL,
              getToken: () => token ?? undefined,
            },
          ).then((res) => ({
            planId: p._id,
            logId: res?.log?._id ? String(res.log._id) : null,
          })),
        ),
      );

      if (cancelled) return;

      const successful = results.flatMap((r) =>
        r.status === "fulfilled" && r.value.logId
          ? [{ planId: r.value.planId, logId: r.value.logId }]
          : [],
      );

      if (successful.length === 0) return;

      setUndoBatch({
        logIds: successful.map((s) => s.logId),
        expiresAt: Date.now() + 8000,
      });

      await Promise.all([refetchMealLogs(), refetchMealPlans()]);
    };

    void runSweep();

    return () => {
      cancelled = true;
    };
  }, [
    planPromoteMode,
    isToday,
    today,
    plansData,
    token,
    refetchMealLogs,
    refetchMealPlans,
  ]);

  useEffect(() => {
    if (!undoBatch) return;
    const remaining = Math.max(0, undoBatch.expiresAt - Date.now());
    const timer = setTimeout(() => {
      setUndoBatch(null);
    }, remaining);
    return () => clearTimeout(timer);
  }, [undoBatch]);

  const handleUndoAutoPromote = useCallback(async () => {
    if (!undoBatch) return;
    const { logIds } = undoBatch;
    setUndoBatch(null);
    await Promise.allSettled(
      logIds.map((id) =>
        apiFetch(
          `/api/meal-logs/${encodeURIComponent(id)}`,
          z.any(),
          {
            method: "DELETE",
            baseUrl: WEBAPP_BASE_URL,
            getToken: () => token ?? undefined,
          },
        ),
      ),
    );
    await Promise.all([refetchMealLogs(), refetchMealPlans()]);
  }, [undoBatch, token, refetchMealLogs, refetchMealPlans]);

  // ── Session Tags (add-a-tag behaviour) ────────────────────────────────────
  const [sessionTags, setSessionTags] = useState<string[]>([]);
  const [addTagOpen, setAddTagOpen] = useState(false);
  const [newTagInput, setNewTagInput] = useState("");

  const rawWindows = scheduleData?.windows;
  const scheduleWindows: TagWindow[] = useMemo(() => {
    if (!Array.isArray(rawWindows)) return [];
    return rawWindows.map((w) => ({
      tag: w.tag,
      startMinutes: w.startMinutes ?? null,
      endMinutes: w.endMinutes ?? null,
    }));
  }, [rawWindows]);

  // Occurrences ordered with vendored buildDayOccurrences
  const occurrences = useMemo(() => {
    return buildDayOccurrences(
      displayedLogs,
      activePlans,
      scheduleWindows,
      { includePlans: showPlans },
    );
  }, [displayedLogs, activePlans, scheduleWindows, showPlans]);

  const sections = useMemo(() => {
    const withContent = occurrences.map((o) => ({ ...o, empty: false }));
    const used = new Set(withContent.map((o) => o.tag.toLowerCase()));
    const empties = sessionTags
      .map((t) => t.toLowerCase())
      .filter((t) => !used.has(t))
      .map((tag) => ({
        key: `empty:${tag}`,
        tag,
        sortMinutes: sortMinutesForTag(scheduleWindows, tag),
        logs: EMPTY_LOGS,
        plans: EMPTY_PLANS,
        planned: false,
        untimed: false,
        empty: true,
      }));
    return [...withContent, ...empties].sort((a, b) => {
      if (a.sortMinutes !== b.sortMinutes) return a.sortMinutes - b.sortMinutes;
      if (a.planned !== b.planned) return a.planned ? 1 : -1;
      return 0;
    });
  }, [occurrences, sessionTags, scheduleWindows]);

  const handleRemoveTag = (tag: string) => {
    setSessionTags((prev) => prev.filter((t) => t !== tag));
  };

  // ── Combine logged items into one sitting (NP-175) ────────────────────────
  //
  // Select rows already logged today, then fold them into ONE entry — the
  // native half of `POST /api/meal-logs/combine`. The server does the
  // create-then-strip atomically inside that single request, so this screen
  // makes exactly one call and then refetches the day; it never emulates the
  // merge with a create plus a handful of deletes.
  //
  // The selection is held HERE rather than inside TagSection because the sheet
  // that submits it is a sibling of the sections, and it is keyed by occurrence
  // so two snack sittings on one day cannot pool their picks.
  const handleApiError = useApiErrorHandler();
  const [selectSectionKey, setSelectSectionKey] = useState<string | null>(null);
  const [combineSelection, setCombineSelection] = useState<Set<string>>(
    () => new Set<string>(),
  );
  const [combineSheetOpen, setCombineSheetOpen] = useState(false);
  const [combining, setCombining] = useState(false);
  const [combineError, setCombineError] = useState<string | null>(null);
  // Bumped once per select session and used as the sheet's key, so a NEW
  // selection gets a fresh name field and a fresh toggle instead of the last
  // combine's. Closing and reopening the sheet inside one session keeps what
  // they typed, which is the half worth keeping.
  const [combineSession, setCombineSession] = useState(0);

  const {
    data: entitlements,
    feature: entitlementFor,
    refresh: refreshEntitlements,
  } = useEntitlements();
  // Keeping the result as a reusable meal is the gated half; folding the day's
  // own rows is not (webapp/app/api/meal-logs/combine/route.ts:58-65). Read
  // `canCreate`, never recomputed from limit and used: `allowed` stays true for
  // a capped free member on purpose so they can still edit and delete theirs.
  const canSaveMeals =
    !entitlements ||
    entitlements.enforced === false ||
    entitlementFor("custom-meals")?.canCreate !== false;

  const selectedSection = useMemo(
    () => sections.find((s) => s.key === selectSectionKey) ?? null,
    [sections, selectSectionKey],
  );

  const combinePicked = useMemo(
    () =>
      pickedLogItems(
        selectableLogItems(selectedSection?.logs ?? EMPTY_LOGS),
        combineSelection,
      ),
    [selectedSection, combineSelection],
  );

  const exitSelectMode = useCallback(() => {
    setSelectSectionKey(null);
    setCombineSelection(new Set<string>());
    setCombineSheetOpen(false);
    setCombineError(null);
  }, []);

  const handleStartSelect = useCallback((sectionKey: string) => {
    setSelectSectionKey(sectionKey);
    setCombineSelection(new Set<string>());
    setCombineError(null);
    setCombineSession((n) => n + 1);
  }, []);

  const handleToggleSelect = useCallback((logId: string, itemId: string) => {
    setCombineSelection((prev) => toggleSelection(prev, selectionKey(logId, itemId)));
  }, []);

  const handleCombine = useCallback(
    async (opts: { mealName?: string | undefined; saveAsMeal: boolean }) => {
      if (combining || !canCombine(combinePicked)) return;
      setCombining(true);
      setCombineError(null);
      try {
        await combineLoggedItems({
          picks: combinePicked.map((item) => ({
            logId: item.logId,
            itemId: item.itemId,
          })),
          mealName: opts.mealName,
          saveAsMeal: opts.saveAsMeal,
          apiFetch,
          token,
        });
        // A saved meal consumed an allowance slot: re-read the snapshot so the
        // next sheet shows the cap it just reached rather than the one before.
        if (opts.saveAsMeal) {
          await refreshEntitlements().catch(() => {});
        }
        exitSelectMode();
        await refetchMealLogs();
      } catch (err) {
        // A plan gate goes to the upgrade sheet through the root handler; an
        // ordinary refusal keeps the server's own words in the sheet.
        const { handled, message } = handleApiError(err);
        if (!handled) setCombineError(message);
      } finally {
        setCombining(false);
      }
    },
    [
      combining,
      combinePicked,
      token,
      refreshEntitlements,
      exitSelectMode,
      refetchMealLogs,
      handleApiError,
    ],
  );

  // ── Totals & Goal Line ────────────────────────────────────────────────────
  const quickAdds = Array.isArray(sideTablesData?.quickAdds)
    ? sideTablesData.quickAdds
    : [];

  const quickAddCalories = quickAdds.reduce(
    (sum, qa) => sum + (qa.calories || 0),
    0,
  );
  const quickAddProtein = quickAdds.reduce(
    (sum, qa) => sum + (qa.protein || 0),
    0,
  );
  const quickAddCarbs = quickAdds.reduce(
    (sum, qa) => sum + (qa.carbs || 0),
    0,
  );
  const quickAddFats = quickAdds.reduce(
    (sum, qa) => sum + (qa.fats || 0),
    0,
  );

  const activeDailyTotals = useMemo(() => {
    const serverTotals = mealLogsData?.dailyTotals ?? {
      calories: 0,
      protein: 0,
      carbs: 0,
      fats: 0,
      fiber: 0,
    };
    if (removedItemIds.size === 0) return serverTotals;
    let calories = 0;
    let protein = 0;
    let carbs = 0;
    let fats = 0;
    let fiber = 0;
    for (const log of displayedLogs) {
      for (const item of log.items ?? []) {
        const s = typeof item.servings === "number" && item.servings > 0 ? item.servings : 1;
        const n = item.nutrition ?? { calories: 0, protein: 0, carbs: 0, fats: 0, fiber: 0 };
        calories += (n.calories ?? 0) * s;
        protein += (n.protein ?? 0) * s;
        carbs += (n.carbs ?? 0) * s;
        fats += (n.fats ?? 0) * s;
        fiber += (n.fiber ?? 0) * s;
      }
    }
    return { calories, protein, carbs, fats, fiber };
  }, [displayedLogs, removedItemIds.size, mealLogsData?.dailyTotals]);

  // Planned totals for the visible date (today and future days)
  const plannedTotals = useMemo(() => {
    if (!showPlans) return { calories: 0, protein: 0, carbs: 0, fats: 0, fiber: 0 };
    let c = 0;
    let p = 0;
    let cb = 0;
    let f = 0;
    let fib = 0;
    for (const plan of activePlans) {
      const n = plan.expectedNutrition;
      if (n) {
        c += n.calories ?? 0;
        p += n.protein ?? 0;
        cb += n.carbs ?? 0;
        f += n.fats ?? 0;
        fib += (n as { fiber?: number }).fiber ?? 0;
      } else {
        for (const item of plan.items ?? []) {
          const s = typeof item.servings === "number" && item.servings > 0 ? item.servings : 1;
          const nut = item.nutrition ?? { calories: 0, protein: 0, carbs: 0, fats: 0 };
          c += (nut.calories ?? 0) * s;
          p += (nut.protein ?? 0) * s;
          cb += (nut.carbs ?? 0) * s;
          f += (nut.fats ?? 0) * s;
          fib += (nut.fiber ?? 0) * s;
        }
      }
    }
    return {
      calories: Math.round(c),
      protein: Math.round(p),
      carbs: Math.round(cb),
      fats: Math.round(f),
      fiber: Math.round(fib),
    };
  }, [showPlans, activePlans]);

  // Today only: preview planned totals as shadow arc / bars
  const todayPlannedExtra = isToday ? plannedTotals : null;

  // On future dates, primary ring displays planned totals; on today & past, consumed logs + quick adds
  const consumedCalories = isFuture
    ? plannedTotals.calories
    : Math.max(0, Math.round(activeDailyTotals.calories + quickAddCalories));
  const totalProtein = isFuture
    ? plannedTotals.protein
    : Math.max(0, Math.round(activeDailyTotals.protein + quickAddProtein));
  const totalCarbs = isFuture
    ? plannedTotals.carbs
    : Math.max(0, Math.round(activeDailyTotals.carbs + quickAddCarbs));
  const totalFats = isFuture
    ? plannedTotals.fats
    : Math.max(0, Math.round(activeDailyTotals.fats + quickAddFats));
  const totalFiber = isFuture
    ? plannedTotals.fiber
    : Math.max(0, Math.round(activeDailyTotals.fiber ?? 0));

  const goalCalories = goalsData?.calories ?? 2000;
  const goalProtein = goalsData?.protein ?? 150;
  const goalCarbs = goalsData?.carbs ?? 200;
  const goalFats = goalsData?.fats ?? 65;

  const goalWeight = useMemo(() => {
    const n = goalsWeightData?.nutrition;
    if (!n) return null;
    return {
      weight: n.target?.weight ?? null,
      unit: n.unit === "kg" ? ("kg" as const) : ("lbs" as const),
      direction: n.direction ?? null,
      paceStatus: n.pace?.status ?? null,
    };
  }, [goalsWeightData]);

  const goalLineText = useMemo(() => {
    return nutritionGoalLine({
      calories: goalCalories,
      targetWeight: goalWeight?.weight ?? null,
      unit: goalWeight?.unit ?? "lbs",
      direction: goalWeight?.direction ?? null,
      paceStatus: goalWeight?.paceStatus ?? null,
    });
  }, [goalCalories, goalWeight]);

  // ── Default Tag ───────────────────────────────────────────────────────────
  const currentDefaultTag = useMemo(() => {
    return defaultTagAt(scheduleWindows, minutesOfDay(new Date()));
  }, [scheduleWindows]);

  // ── Navigation & Swipe ────────────────────────────────────────────────────
  const shiftDay = (delta: number) => {
    const dt = new Date(y ?? 2026, (m ?? 1) - 1, (d ?? 1) + delta, 12, 0, 0);
    const nextKey = localDateKey(dt);
    setExplicitDate(nextKey === today ? null : nextKey);
  };

  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);

  const onTouchStart = (e: GestureResponderEvent) => {
    touchStartX.current = e.nativeEvent?.pageX ?? null;
    touchStartY.current = e.nativeEvent?.pageY ?? null;
  };

  const onTouchEnd = (e: GestureResponderEvent) => {
    if (touchStartX.current === null || touchStartY.current === null) return;
    const endX = e.nativeEvent?.pageX ?? touchStartX.current;
    const endY = e.nativeEvent?.pageY ?? touchStartY.current;
    const dx = endX - touchStartX.current;
    const dy = endY - touchStartY.current;
    touchStartX.current = null;
    touchStartY.current = null;
    if (Math.abs(dx) < 50 || Math.abs(dy) > Math.abs(dx)) return;
    if (dx < 0) {
      shiftDay(1); // Swipe left -> next day
    } else {
      shiftDay(-1); // Swipe right -> prev day
    }
  };

  const [timelineMenuOpen, setTimelineMenuOpen] = useState(false);
  const [cameraMenuOpen, setCameraMenuOpen] = useState(false);
  const [uploadMenuOpen, setUploadMenuOpen] = useState(false);
  // Meal-photo / describe estimate (NP-089): which surface the sheet opens on.
  const [estimateOpen, setEstimateOpen] = useState(false);
  const [estimatePhase, setEstimatePhase] = useState<
    "chooser" | "describe" | "review"
  >("chooser");
  // Estimate history (NP-141): the history list, and the re-opened scan the
  // review opens on (the web's `?scan=<id>` into the review phase).
  const [historyOpen, setHistoryOpen] = useState(false);
  const [reopenedScan, setReopenedScan] = useState<{
    items: NutritionScan["items"];
    imageUrl: string | null;
    scanId: string;
    tag: string;
  } | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchTag, setSearchTag] = useState<string | undefined>(undefined);
  // Barcode scan (NP-088): the camera menu opens the search sheet straight
  // onto the scanner instead of the name search.
  const [searchBarcodeOpen, setSearchBarcodeOpen] = useState(false);
  const [copyingYesterday, setCopyingYesterday] = useState(false);
  // Schedule-meals tools (NP-177): the two bulk sheets ported from the web's
  // ScheduleMealsDrawer / PlanToolsSheets. `copyDayOpen` copies a day forward
  // (from the meal plan and from a future day); `applyMealOpen` repeats one
  // saved meal across days. `planToolsNotice` carries the success toast until
  // the refetch lands, mirroring the web's `showSuccessToast` + refetch.
  const [copyDayOpen, setCopyDayOpen] = useState(false);
  const [applyMealOpen, setApplyMealOpen] = useState(false);
  const [planToolsNotice, setPlanToolsNotice] = useState<string | null>(null);
  // Food reports (NP-174): the unread-outcomes badge and the My reports
  // list. `reportsRefreshKey` re-reads the badge after filing a report or
  // after the list marks outcomes read.
  const [reportsOpen, setReportsOpen] = useState(false);
  const [reportsRefreshKey, setReportsRefreshKey] = useState(0);
  const [quickAddOpen, setQuickAddOpen] = useState(
    () => params.quickAdd === "true",
  );

  useEffect(() => {
    if (params.quickAdd === "true") {
      // Sync quickAdd query param from route when navigating from dashboard
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setQuickAddOpen(true);
    }
  }, [params.quickAdd]);
  const [submittingQuickAdd, setSubmittingQuickAdd] = useState(false);

  const handleEditGoals = useCallback(() => {
    // TODO(NP-148): Nutrition goals editor screen (/dashboard/nutrition/goals) is NP-148.
    router.push("/(tabs)/nutrition/goals" as any);
  }, [router]);

  const copyYesterday = useCallback(async () => {
    if (copyingYesterday) return;
    setCopyingYesterday(true);
    try {
      const yest = new Date(activeDateObj);
      yest.setDate(yest.getDate() - 1);
      const yestKey = localDateKey(yest);
      const res = await apiFetch(
        withTz(`/api/meal-logs?date=${yestKey}`, tzOffset),
        MealLogsDayResponseSchema,
        {
          baseUrl: WEBAPP_BASE_URL,
          getToken: () => token ?? undefined,
        },
      );
      const logs = (res?.logs ?? []).filter((l) => (l.items?.length ?? 0) > 0);
      if (logs.length === 0) {
        return;
      }
      const base = new Date(activeDateObj);
      base.setHours(12, 0, 0, 0);
      let i = 0;
      for (const log of logs) {
        await apiFetch(
          withTz("/api/meal-logs", tzOffset),
          z.any(),
          {
            method: "POST",
            body: {
              items: log.items,
              tags: log.tags ?? [],
              loggedAt: new Date(base.getTime() + i * 60_000).toISOString(),
            },
            baseUrl: WEBAPP_BASE_URL,
            getToken: () => token ?? undefined,
          },
        );
        i++;
      }
      await invalidateMindSession();
      await Promise.all([refetchMealLogs(), refetchSideTables()]);
    } catch {
      // ignore
    } finally {
      setCopyingYesterday(false);
    }
  }, [activeDateObj, copyingYesterday, refetchMealLogs, refetchSideTables, tzOffset, token]);

  const handleAddWater = useCallback(
    async (amount: number) => {
      try {
        await apiFetch(
          withTz("/api/nutrition/water", tzOffset),
          z.any(),
          {
            method: "POST",
            body: { amount, date: activeDate, tz: tzOffset },
            baseUrl: WEBAPP_BASE_URL,
            getToken: () => token ?? undefined,
          },
        );
        await refetchSideTables();
      } catch (err) {
        console.error("Failed to add water:", err);
      }
    },
    [activeDate, tzOffset, token, refetchSideTables],
  );

  const handleQuickAdd = useCallback(
    async (data: QuickAddData) => {
      if (isFuture) return;
      setSubmittingQuickAdd(true);
      try {
        await apiFetch(
          withTz("/api/nutrition/quick-add", tzOffset),
          z.any(),
          {
            method: "POST",
            body: {
              calories: data.calories,
              protein: data.protein ?? 0,
              carbs: data.carbs ?? 0,
              fats: data.fats ?? 0,
              note: data.note,
              date: activeDate,
              tz: tzOffset,
            },
            baseUrl: WEBAPP_BASE_URL,
            getToken: () => token ?? undefined,
          },
        );
        await invalidateMindSession();
        await refetchSideTables();
      } catch (err) {
        console.error("Failed to quick add:", err);
      } finally {
        setSubmittingQuickAdd(false);
        setQuickAddOpen(false);
      }
    },
    [activeDate, isFuture, tzOffset, token, refetchSideTables],
  );

  const handleDeleteQuickAdd = useCallback(
    async (quickAddId: string) => {
      try {
        await apiFetch(
          withTz("/api/nutrition/quick-add", tzOffset),
          z.any(),
          {
            method: "DELETE",
            body: { quickAddId, date: activeDate, tz: tzOffset },
            baseUrl: WEBAPP_BASE_URL,
            getToken: () => token ?? undefined,
          },
        );
        await refetchSideTables();
      } catch (err) {
        console.error("Failed to delete quick add:", err);
      }
    },
    [activeDate, tzOffset, token, refetchSideTables],
  );

  const openSearch = (tagToUse?: string, opts?: { barcode?: boolean }) => {
    setSearchTag(tagToUse ?? currentDefaultTag);
    setSearchBarcodeOpen(opts?.barcode === true);
    // A fresh search starts a fresh basket; the sitting target is only for
    // the explicit "add to this meal" affordance below.
    setAddToLogId(null);
    setSearchOpen(true);
  };

  // Meal-photo / describe estimate (NP-089): Take photo and Upload capture
  // inside the sheet (NP-059's capture helper); Describe opens on the text
  // surface. Capture needs no device check here — NP-093's code is on beta
  // and camera verification is deferred to NP-008.
  const openEstimate = (phase: "chooser" | "describe" | "review") => {
    if (phase !== "review") setReopenedScan(null);
    setEstimatePhase(phase === "review" ? "review" : phase);
    setEstimateOpen(true);
  };

  // Estimate history (NP-141): reopen a saved estimate in the native review
  // with its saved items — the native `?scan=<id>` into the review phase.
  // The scan is re-read first so the review opens on the server's current
  // items, not the list row's snapshot.
  const handleReopenScan = useCallback(
    async (scan: NutritionScan) => {
      try {
        const res = await apiFetch(
          `/api/nutrition/scans/${encodeURIComponent(scan._id)}`,
          NutritionScanResponseSchema,
          {
            baseUrl: WEBAPP_BASE_URL,
            getToken: () => token ?? undefined,
          },
        );
        const full = res.scan ?? scan;
        const items = Array.isArray(full.items) ? full.items : [];
        if (items.length === 0) return;
        setReopenedScan({
          items,
          imageUrl:
            typeof full.imageUrl === "string" && full.imageUrl
              ? full.imageUrl
              : null,
          scanId: full._id,
          tag: (full.tag ?? "").trim().toLowerCase() || currentDefaultTag,
        });
      } catch {
        const items = Array.isArray(scan.items) ? scan.items : [];
        if (items.length === 0) return;
        setReopenedScan({
          items,
          imageUrl:
            typeof scan.imageUrl === "string" && scan.imageUrl
              ? scan.imageUrl
              : null,
          scanId: scan._id,
          tag: (scan.tag ?? "").trim().toLowerCase() || currentDefaultTag,
        });
      }
      setHistoryOpen(false);
      setEstimatePhase("review");
      setEstimateOpen(true);
    },
    [token, currentDefaultTag],
  );

  const handleHistoryLogged = useCallback(async () => {
    await Promise.all([refetchMealLogs(), refetchSideTables()]);
  }, [refetchMealLogs, refetchSideTables]);

  const handleEstimateLogged = useCallback(async () => {
    await Promise.all([refetchMealLogs(), refetchSideTables()]);
  }, [refetchMealLogs, refetchSideTables]);

  // ── Basket: log several foods as one sitting (NP-094) ─────────────────────
  //
  // The web's basket (`FoodSearchModal` meal mode + `handleAddMany`): foods
  // picked in the search sheet collect in a basket and are logged in ONE
  // `POST /api/meal-logs` request, optionally kept as a reusable meal. The
  // log goes first and a failed meal save never costs it.
  const [basket, setBasket] = useState<BasketItem[]>([]);
  const [basketOpen, setBasketOpen] = useState(false);
  const [basketSubmitting, setBasketSubmitting] = useState(false);
  const [basketError, setBasketError] = useState<string | null>(null);
  const [basketNotice, setBasketNotice] = useState<string | null>(null);
  // When set, the search sheet appends to THIS specific MealLog (the web's
  // "add to this meal" on a logged sitting) instead of the basket.
  const [addToLogId, setAddToLogId] = useState<string | null>(null);
  // A saved meal picked from the Meals filter waits here for its portion.
  const [mealToLog, setMealToLog] = useState<Meal | null>(null);
  const [mealLogSubmitting, setMealLogSubmitting] = useState(false);
  const [mealLogError, setMealLogError] = useState<string | null>(null);
  // Plan mode on a future day (NP-232): a food picked from the search sheet
  // waits here for its portion + tag in `PlanFoodSheet` (the web's
  // `FoodSearchModal` plan mode, `page.tsx:1474-1519`), and a saved meal waits
  // in `mealToLog` for `MealLogSheet mode="plan"`. The web hides the basket
  // in plan mode (`FoodSearchModal.tsx:2495`), so the search sheet opens with
  // `basketMode={false}` and nothing on this screen calls `/api/meal-logs`
  // or `/api/meals/{id}/log` for a future date.
  const [foodToPlan, setFoodToPlan] = useState<Food | null>(null);

  const handleAddToBasket = (food: Food) => {
    const variant = defaultVariantOf(food);
    if (!variant) return;
    const item = buildMealItemPayload({
      food: food as unknown as Parameters<typeof buildMealItemPayload>[0]["food"],
      variant,
      quantity: 1,
      unit: variant.servingUnit,
    });
    const key = `${String(food._id ?? food.id ?? "food")}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const entry: BasketItem = { ...item, key };
    setBasket((prev) => [...prev, entry]);
  };

  const handleRemoveBasketItem = (key: string) => {
    setBasket((prev) => prev.filter((item) => item.key !== key));
  };

  const handleSubmitBasket = async (opts: {
    mealName?: string | undefined;
    saveAsMeal: boolean;
  }) => {
    if (basketSubmitting || basket.length === 0) return;
    setBasketSubmitting(true);
    setBasketError(null);
    setBasketNotice(null);
    try {
      const count = basket.length;
      const result = await logBasket({
        items: basket.map(({ key: _key, ...item }) => item as MealItemPayload),
        tag: searchTag ?? currentDefaultTag,
        mealName: opts.saveAsMeal ? opts.mealName : undefined,
        apiFetch,
        token,
        baseUrl: WEBAPP_BASE_URL,
      });
      // A saved meal consumed an allowance slot: re-read the snapshot so the
      // next sheet shows the cap it just reached rather than the one before.
      if (opts.saveAsMeal && !result.mealNotSaved) {
        await refreshEntitlements().catch(() => {});
      }
      setBasket([]);
      setBasketOpen(false);
      setSearchOpen(false);
      setSearchBarcodeOpen(false);
      setBasketNotice(
        result.mealNotSaved
          ? `Logged ${count} item${count === 1 ? "" : "s"}. Could not save the meal.`
          : null,
      );
      await refetchMealLogs();
    } catch (err) {
      // A plan gate goes to the upgrade sheet through the root handler; an
      // ordinary refusal keeps the server's own words in the sheet.
      const { handled, message } = handleApiError(err);
      if (!handled) setBasketError(message);
    } finally {
      setBasketSubmitting(false);
    }
  };

  // Log a saved meal from the Meals filter through `POST /api/meals/{id}/log`
  // with portion, tag and time — the web's `MealApplySheet`.
  const handleLogSavedMeal = async (opts: {
    portion: number;
    tag: string;
    untimed: boolean;
  }) => {
    if (!mealToLog || mealLogSubmitting) return;
    setMealLogSubmitting(true);
    setMealLogError(null);
    try {
      await logSavedMeal({
        mealId: mealToLog._id,
        portion: opts.portion,
        tag: opts.tag,
        untimed: opts.untimed,
        apiFetch,
        token,
        baseUrl: WEBAPP_BASE_URL,
      });
      setMealToLog(null);
      setSearchOpen(false);
      setSearchBarcodeOpen(false);
      await refetchMealLogs();
    } catch (err) {
      const { handled, message } = handleApiError(err);
      if (!handled) setMealLogError(message);
    } finally {
      setMealLogSubmitting(false);
    }
  };

  // "Add to this meal" on a logged sitting: the search sheet appends to that
  // specific MealLog (`POST /api/meal-logs/{id}/items`).
  const handleAddToMeal = (logId: string, tag: string) => {
    setAddToLogId(logId);
    setSearchTag(tag);
    setSearchBarcodeOpen(false);
    setSearchOpen(true);
  };

  const handlePickMeal = (meal: Meal) => {
    // On a future day the meal is PLANNED, not logged (the web's plan-mode
    // `MealApplySheet`, `page.tsx:1474-1519`): open `MealLogSheet mode="plan"`
    // rooted at this day. Never call `/api/meals/{id}/log` for a future date.
    if (isFuture) {
      setMealLogError(null);
      setMealToLog(meal);
      setPlanToolsNotice(null);
      return;
    }
    setMealLogError(null);
    setMealToLog(meal);
  };

  // Plan a saved meal from the Meals filter on a future day through
  // `POST /api/meal-plans { plannedDate, tag, mealId }` — the web's
  // `MealApplySheet` plan branch (`MealApplySheet.tsx:213-235`). The portion
  // the sheet collected is a display choice only: the server snapshots the
  // meal's items at plan-create time. After the plan lands, refetch plans and
  // show the web's "Planned for <weekday, Mon d>" toast (`page.tsx:1509-1512`).
  const handlePlanSavedMeal = async (opts: {
    portion: number;
    tag: string;
    untimed: boolean;
  }) => {
    if (!mealToLog || mealLogSubmitting) return;
    setMealLogSubmitting(true);
    setMealLogError(null);
    try {
      await createMealPlan({
        plannedDate: activeDate,
        tag: opts.tag,
        mealId: mealToLog._id,
        apiFetch,
        token,
        baseUrl: WEBAPP_BASE_URL,
      });
      setMealToLog(null);
      setSearchOpen(false);
      setSearchBarcodeOpen(false);
      // The web's toast names the planned day (`page.tsx:1509-1512`):
      // "Planned for <weekday, Mon d>".
      setPlanToolsNotice(plannedForToast(activeDateObj));
      await refetchMealPlans();
    } catch (err) {
      const { handled, message } = handleApiError(err);
      if (!handled) setMealLogError(message);
    } finally {
      setMealLogSubmitting(false);
    }
  };

  // Bulk tools applied: show the web's toast text and refetch the day, like
  // `timeline/page.tsx#onApplied` (toast + month reload + fetchData).
  const handleBulkApplied = useCallback(
    (toast: string) => {
      setPlanToolsNotice(toast);
      setCopyDayOpen(false);
      setApplyMealOpen(false);
      if (showPlans) {
        void refetchMealPlans();
      }
      void refetchMealLogs();
    },
    [showPlans, refetchMealPlans, refetchMealLogs],
  );

  const handlePickBasketFood = async (food: Food) => {
    // On a future day the food is PLANNED, not logged (the web's plan-mode
    // `FoodSearchModal`, `page.tsx:1474-1519`): open `PlanFoodSheet` for this
    // day. Never call `/api/meal-logs` for a future date.
    if (isFuture) {
      setFoodToPlan(food);
      return;
    }
    // Pinned to a sitting: log one food straight into it, like the web's
    // `handleAddFood` with `addToLogId` set.
    if (addToLogId) {
      const variant = defaultVariantOf(food);
      if (!variant) return;
      const item = buildMealItemPayload({
        food: food as unknown as Parameters<typeof buildMealItemPayload>[0]["food"],
        variant,
        quantity: 1,
        unit: variant.servingUnit,
      });
      try {
        await addToLoggedMeal({
          logId: addToLogId,
          item,
          apiFetch,
          token,
          baseUrl: WEBAPP_BASE_URL,
        });
        setAddToLogId(null);
        setSearchOpen(false);
        setSearchBarcodeOpen(false);
        await refetchMealLogs();
      } catch (err) {
        const { handled, message } = handleApiError(err);
        if (!handled) setBasketError(message);
      }
      return;
    }
    handleAddToBasket(food);
  };

  // "Schedule meals" — the same control rendered in two places, so the two
  // can never drift apart (the web's `page.tsx:1023-1032`): above the tag
  // list on a future day (the only thing you can do on a day you have not
  // lived yet), below the water tracker at the end of today (NP-262).
  const scheduleMealsButton = (
    <Pressable
      testID="nutrition-schedule-meals-button"
      accessibilityRole="button"
      accessibilityLabel="Schedule meals"
      onPress={() => router.push("/(tabs)/nutrition/meal-schedule")}
      className="bg-blue-600"
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        borderRadius: 12,
        paddingVertical: 12,
      }}
    >
      <CalendarDays size={16} color={colors["primary-foreground"]} />
      <Text className="text-white text-sm font-semibold">Schedule meals</Text>
    </Pressable>
  );

  return (
    <SafeAreaView
      edges={["top", "bottom"]}
      style={{ flex: 1, backgroundColor: colors.background }}
      testID="nutrition-index-route"
    >
      {/* Header */}
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          paddingHorizontal: 16,
          paddingTop: 12,
          paddingBottom: 8,
        }}
      >
        <View style={{ flex: 1, minWidth: 0, marginRight: 8 }}>
          <Text className="text-foreground text-2xl font-bold" numberOfLines={1}>
            Nutrition
          </Text>
          <Text className="text-muted-foreground text-xs mt-0.5" numberOfLines={1}>
            Track your food, macros, and hydration
          </Text>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
          {/* My Stuff header action */}
          <Pressable
            testID="nutrition-my-stuff-button"
            accessibilityRole="button"
            accessibilityLabel="My Stuff"
            onPress={() => {
              // My Stuff (NP-142): meals, own recipes and saved foods tabs.
              router.push("/(tabs)/nutrition/recipes");
            }}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 4,
              paddingHorizontal: 8,
              paddingVertical: 6,
              borderRadius: 8,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.card,
            }}
          >
            <ChefHat size={16} color={colors.foreground} />
            <Text className="text-xs font-semibold text-foreground">My Stuff</Text>
          </Pressable>

          {/* Timeline toggle header action */}
          <Pressable
            testID="nutrition-timeline-button"
            accessibilityRole="button"
            accessibilityLabel="Timeline"
            onPress={() => setTimelineMenuOpen((o) => !o)}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 4,
              paddingHorizontal: 8,
              paddingVertical: 6,
              borderRadius: 8,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.card,
            }}
          >
            <Clock size={16} color={colors.foreground} />
            <Text className="text-xs font-semibold text-foreground">Timeline</Text>
            <ChevronDown size={14} color={colors["muted-foreground"]} />
          </Pressable>
        </View>
      </View>

      {/* The bulk tools' word when plans landed (NP-177). */}
      {planToolsNotice ? (
        <View style={{ marginHorizontal: 16, marginBottom: 8 }}>
          <Text
            testID="nutrition-plan-tools-notice"
            accessibilityRole="alert"
            className="text-muted-foreground text-xs"
            onPress={() => setPlanToolsNotice(null)}
          >
            {planToolsNotice}
          </Text>
        </View>
      ) : null}

      {/* The basket's quiet word when the log landed but the keep did not. */}
      {basketNotice ? (
        <View style={{ marginHorizontal: 16, marginBottom: 8 }}>
          <Text
            testID="nutrition-basket-notice"
            accessibilityRole="alert"
            className="text-muted-foreground text-xs"
            onPress={() => setBasketNotice(null)}
          >
            {basketNotice}
          </Text>
        </View>
      ) : null}

      {/* 4-segment View Selector (Day / Week / Month / Training) */}
      <View
        testID="nutrition-view-selector"
        style={{
          flexDirection: "row",
          marginHorizontal: 16,
          marginBottom: 8,
          padding: 3,
          borderRadius: 10,
          backgroundColor: colors.muted,
        }}
      >
        <Pressable
          testID="nutrition-view-day"
          accessibilityRole="button"
          accessibilityLabel="Day view"
          onPress={() => handleViewChange("day")}
          style={{
            flex: 1,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            paddingVertical: 6,
            borderRadius: 7,
            backgroundColor: viewMode === "day" ? colors.card : "transparent",
            borderWidth: viewMode === "day" ? 1 : 0,
            borderColor: colors.border,
          }}
        >
          <Clock
            size={14}
            color={viewMode === "day" ? colors.foreground : colors["muted-foreground"]}
          />
          <Text
            className={`text-xs font-semibold ${
              viewMode === "day" ? "text-foreground" : "text-muted-foreground"
            }`}
          >
            Day
          </Text>
        </Pressable>

        <Pressable
          testID="nutrition-view-week"
          accessibilityRole="button"
          accessibilityLabel="Week view"
          onPress={() => handleViewChange("week")}
          style={{
            flex: 1,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            paddingVertical: 6,
            borderRadius: 7,
            backgroundColor: viewMode === "week" ? colors.card : "transparent",
            borderWidth: viewMode === "week" ? 1 : 0,
            borderColor: colors.border,
          }}
        >
          <CalendarDays
            size={14}
            color={viewMode === "week" ? colors.foreground : colors["muted-foreground"]}
          />
          <Text
            className={`text-xs font-semibold ${
              viewMode === "week" ? "text-foreground" : "text-muted-foreground"
            }`}
          >
            Week
          </Text>
        </Pressable>

        <Pressable
          testID="nutrition-view-month"
          accessibilityRole="button"
          accessibilityLabel="Month view"
          onPress={() => handleViewChange("month")}
          style={{
            flex: 1,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            paddingVertical: 6,
            borderRadius: 7,
            backgroundColor: viewMode === "month" ? colors.card : "transparent",
            borderWidth: viewMode === "month" ? 1 : 0,
            borderColor: colors.border,
          }}
        >
          <CalendarDays
            size={14}
            color={viewMode === "month" ? colors.foreground : colors["muted-foreground"]}
          />
          <Text
            className={`text-xs font-semibold ${
              viewMode === "month" ? "text-foreground" : "text-muted-foreground"
            }`}
          >
            Month
          </Text>
        </Pressable>

        <Pressable
          testID="nutrition-view-training"
          accessibilityRole="button"
          accessibilityLabel="Training preferences"
          onPress={() => handleViewChange("training")}
          style={{
            flex: 1,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            paddingVertical: 6,
            borderRadius: 7,
            backgroundColor: viewMode === "training" ? colors.card : "transparent",
            borderWidth: viewMode === "training" ? 1 : 0,
            borderColor: colors.border,
          }}
        >
          <Text
            className={`text-xs font-semibold ${
              viewMode === "training" ? "text-foreground" : "text-muted-foreground"
            }`}
          >
            Training
          </Text>
        </Pressable>
      </View>

      {/* Date Navigation & Swipe Container */}
      <View
        style={{ flex: 1 }}
        onTouchStart={viewMode === "day" ? onTouchStart : undefined}
        onTouchEnd={viewMode === "day" ? onTouchEnd : undefined}
      >
        {viewMode === "training" ? (
          <TrainingPreferencesScreen />
        ) : (
        <ScrollView
          contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 80 }}
        >
          {viewMode === "day" ? (
            <>
          {/* Undo Auto-promote Banner (NP-147) */}
          {undoBatch ? (
            <View
              testID="nutrition-undo-banner"
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                backgroundColor: colors.card,
                borderColor: colors.border,
                borderWidth: 1,
                borderRadius: 12,
                paddingHorizontal: 16,
                paddingVertical: 12,
                shadowColor: colors.foreground,
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.08,
                shadowRadius: 4,
                elevation: 3,
              }}
            >
              <View style={{ flex: 1, marginRight: 12 }}>
                <Text className="text-foreground text-sm font-semibold">
                  Auto-logged planned meals
                </Text>
                <Text className="text-muted-foreground text-xs">
                  Today&apos;s active plans were logged automatically.
                </Text>
              </View>
              <Button
                testID="nutrition-undo-auto-promote"
                variant="secondary"
                size="sm"
                onPress={handleUndoAutoPromote}
              >
                Undo
              </Button>
            </View>
          ) : null}

          {/* Search row: input + camera + upload */}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Pressable
              testID="nutrition-search-bar"
              accessibilityRole="button"
              accessibilityLabel="Search foods"
              onPress={() => openSearch()}
              style={{
                flex: 1,
                flexDirection: "row",
                alignItems: "center",
                backgroundColor: colors.card,
                borderColor: colors.border,
                borderWidth: 1,
                borderRadius: 12,
                paddingHorizontal: 14,
                paddingVertical: 10,
              }}
            >
              <Search size={16} color={colors["muted-foreground"]} />
              <Text className="text-muted-foreground text-sm ml-2.5">
                Search foods…
              </Text>
            </Pressable>

            {/* Camera button (photo log) */}
            <Pressable
              testID="nutrition-camera-button"
              accessibilityRole="button"
              accessibilityLabel="Camera options"
              onPress={() => setCameraMenuOpen((o) => !o)}
              style={{
                width: 42,
                height: 42,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: colors.card,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Camera size={18} color={colors.foreground} />
            </Pressable>

            {/* Upload button */}
            <Pressable
              testID="nutrition-upload-button"
              accessibilityRole="button"
              accessibilityLabel="Upload options"
              onPress={() => setUploadMenuOpen((o) => !o)}
              style={{
                width: 42,
                height: 42,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: colors.card,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Upload size={18} color={colors.foreground} />
            </Pressable>
          </View>

          {/* Date Navigator */}
          <DateNav
            dateKey={activeDate}
            isToday={isToday}
            onPrev={() => shiftDay(-1)}
            onNext={() => shiftDay(1)}
            onToday={() => setExplicitDate(null)}
            onSelectDate={(newDateKey) => setExplicitDate(newDateKey)}
          />

          {/* Calorie Ring & Macro Bars */}
          <CalorieRing
            consumed={consumedCalories}
            goal={goalCalories}
            protein={{
              current: totalProtein,
              goal: goalProtein,
              planned: todayPlannedExtra?.protein,
            }}
            carbs={{
              current: totalCarbs,
              goal: goalCarbs,
              planned: todayPlannedExtra?.carbs,
            }}
            fats={{
              current: totalFats,
              goal: goalFats,
              planned: todayPlannedExtra?.fats,
            }}
            fiber={totalFiber}
            goalLine={goalLineText}
            plannedExtra={todayPlannedExtra?.calories}
            onEditGoals={handleEditGoals}
          />

          {/* Future-day schedule CTA — leads above the tag list, same spot
              the web puts it: scheduling is the only thing you can do on a
              day you have not lived yet (NP-262). */}
          {isFuture ? (
            <View style={{ gap: 10 }}>
              {scheduleMealsButton}
              <Button
                testID="nutrition-copy-day-button"
                variant="secondary"
                onPress={() => {
                  setPlanToolsNotice(null);
                  setCopyDayOpen(true);
                }}
              >
                Copy day…
              </Button>
              <Button
                testID="nutrition-repeat-meal-button"
                variant="secondary"
                onPress={() => {
                  setPlanToolsNotice(null);
                  setApplyMealOpen(true);
                }}
              >
                Repeat a meal…
              </Button>
            </View>
          ) : null}

          {/* Empty State when nothing logged and nothing planned — fork/knife
              icon, a black (web: `bg-zinc-900 dark:bg-white`) Add food pill,
              and icons on the secondary actions (NP-262). */}
          {sections.length === 0 && quickAdds.length === 0 && (
            <Card testID="nutrition-empty-state">
              <View style={{ alignItems: "center", paddingVertical: 12, gap: 12 }}>
                <UtensilsCrossed size={24} color={colors["muted-foreground"]} />
                <Text className="text-foreground text-lg font-bold text-center">
                  {isFuture ? "Nothing planned yet" : "Nothing logged yet"}
                </Text>
                <Text className="text-muted-foreground text-sm text-center px-4">
                  {isFuture
                    ? "Plan ahead — schedule meals for this day so they're ready when it arrives."
                    : "Add your first food of the day to start tracking."}
                </Text>
                <View
                  style={{
                    flexDirection: "row",
                    flexWrap: "wrap",
                    justifyContent: "center",
                    gap: 8,
                    marginTop: 4,
                  }}
                >
                  {!isFuture && (
                    <>
                      <Button
                        testID="nutrition-empty-add-food"
                        variant="inverted"
                        size="sm"
                        onPress={() => openSearch()}
                      >
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                          <Plus size={14} color={colors.background} />
                          <Text className="text-background text-sm font-semibold">
                            Add food
                          </Text>
                        </View>
                      </Button>
                      <Button
                        testID="nutrition-copy-yesterday"
                        variant="secondary"
                        size="sm"
                        disabled={copyingYesterday}
                        onPress={copyYesterday}
                      >
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                          <Copy size={14} color={colors.foreground} />
                          <Text className="text-foreground text-sm font-semibold">
                            {copyingYesterday ? "Copying…" : "Copy yesterday"}
                          </Text>
                        </View>
                      </Button>
                    </>
                  )}
                  <Button
                    testID="nutrition-empty-browse-my-stuff"
                    variant="secondary"
                    size="sm"
                    onPress={() => router.push("/(tabs)/nutrition/recipes")}
                  >
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                      <ChefHat size={14} color={colors.foreground} />
                      <Text className="text-foreground text-sm font-semibold">
                        Browse My Stuff
                      </Text>
                    </View>
                  </Button>
                </View>
              </View>
            </Card>
          )}

          {/* Occurrence / Tag Sections (including Planned meals) */}
          {sections.map((section) => (
            <TagSection
              key={section.key}
              occurrence={section}
              empty={section.empty}
              removable={section.empty && sessionTags.includes(section.tag)}
              onRemoveItem={handleRemoveItem}
              onEditItem={handleEditItem}
              onEditMeal={handleEditMeal}
              onFlagItem={handleFlagItem}
              onRemoveTag={handleRemoveTag}
              onAddFood={openSearch}
              onAddToMeal={handleAddToMeal}
              onLogPlan={isToday ? handleLogPlan : undefined}
              onRemovePlan={handleRemovePlan}
              onSkipPlan={handleSkipPlan}
              onEditPlanItem={handleEditPlanItem}
              onStartSelect={handleStartSelect}
              selecting={selectSectionKey === section.key}
              selectedKeys={combineSelection}
              onToggleSelect={handleToggleSelect}
              onCancelSelect={exitSelectMode}
              onCombine={() => {
                setCombineError(null);
                setCombineSheetOpen(true);
              }}
            />
          ))}

          {/* + Add tag — an inline row (text, Add, Cancel), matching the
              web's `showAddTagInput` flow, not a centred modal (NP-262). */}
          {addTagOpen ? (
            <View
              testID="nutrition-add-tag-row"
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: 12,
                padding: 12,
                backgroundColor: colors.card,
              }}
            >
              <View style={{ flex: 1 }}>
                <Input
                  testID="nutrition-add-tag-input"
                  placeholder="e.g. brunch"
                  value={newTagInput}
                  onChangeText={setNewTagInput}
                />
              </View>
              <Pressable
                testID="nutrition-add-tag-submit"
                accessibilityRole="button"
                accessibilityLabel="Add tag"
                disabled={!newTagInput.trim()}
                onPress={() => {
                  const norm = newTagInput.trim().toLowerCase();
                  if (norm && !sessionTags.includes(norm)) {
                    setSessionTags((prev) => [...prev, norm]);
                  }
                  setNewTagInput("");
                  setAddTagOpen(false);
                }}
                className="bg-foreground"
                style={{
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  borderRadius: 8,
                  opacity: newTagInput.trim() ? 1 : 0.4,
                }}
              >
                <Text className="text-background text-xs font-semibold">Add</Text>
              </Pressable>
              <Pressable
                testID="nutrition-add-tag-cancel"
                accessibilityRole="button"
                accessibilityLabel="Cancel adding a tag"
                onPress={() => {
                  setAddTagOpen(false);
                  setNewTagInput("");
                }}
                style={{ paddingHorizontal: 8, paddingVertical: 8 }}
              >
                <Text className="text-muted-foreground text-xs font-medium">Cancel</Text>
              </Pressable>
            </View>
          ) : (
            <Pressable
              testID="nutrition-add-tag-button"
              accessibilityRole="button"
              accessibilityLabel="Add tag"
              onPress={() => setAddTagOpen(true)}
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                borderWidth: 1,
                borderStyle: "dashed",
                borderColor: colors.border,
                borderRadius: 12,
                paddingVertical: 12,
              }}
            >
              <Plus size={16} color={colors["muted-foreground"]} />
              <Text className="text-muted-foreground text-sm font-medium">Add tag</Text>
            </Pressable>
          )}

          {/* Quick Adds (visible entries with delete) */}
          {quickAdds.length > 0 ? (
            <Card testID="nutrition-quick-adds-section">
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  paddingHorizontal: 16,
                  paddingVertical: 12,
                  borderBottomWidth: 1,
                  borderBottomColor: colors.border,
                }}
              >
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <View
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 8,
                      backgroundColor: tint("accent", 0.15),
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Zap size={15} color={colors.accent} />
                  </View>
                  <Text className="text-foreground text-sm font-semibold">
                    Quick Adds
                  </Text>
                </View>
                <Text className="text-muted-foreground text-xs font-medium tabular-nums">
                  {quickAddCalories} cal
                </Text>
              </View>
              <View>
                {quickAdds.map((qa, idx) => (
                  <View
                    key={qa.id ?? `qa-${idx}`}
                    testID={`nutrition-quick-add-item-${qa.id}`}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "space-between",
                      paddingHorizontal: 16,
                      paddingVertical: 10,
                      borderTopWidth: idx > 0 ? 1 : 0,
                      borderTopColor: colors.border,
                    }}
                  >
                    <View style={{ flex: 1, marginRight: 12 }}>
                      {qa.note ? (
                        <Text
                          className="text-foreground text-sm font-medium"
                          numberOfLines={1}
                        >
                          {qa.note}
                        </Text>
                      ) : (
                        <Text className="text-foreground text-sm font-medium">
                          Quick Add
                        </Text>
                      )}
                      <Text className="text-muted-foreground text-xs font-medium tabular-nums">
                        {qa.calories} cal
                        {((qa.protein ?? 0) > 0 ||
                          (qa.carbs ?? 0) > 0 ||
                          (qa.fats ?? 0) > 0) && (
                          <Text className="text-muted-foreground text-xs">
                            {` · P ${qa.protein ?? 0}g · C ${qa.carbs ?? 0}g · F ${qa.fats ?? 0}g`}
                          </Text>
                        )}
                      </Text>
                    </View>
                    <Pressable
                      testID={`nutrition-delete-quick-add-${qa.id}`}
                      accessibilityRole="button"
                      accessibilityLabel={`Delete quick add ${qa.note ?? `${qa.calories} cal`}`}
                      hitSlop={8}
                      onPress={() => handleDeleteQuickAdd(qa.id)}
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: 8,
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Trash2 size={16} color={colors.destructive} />
                    </Pressable>
                  </View>
                ))}
              </View>
            </Card>
          ) : null}

          {/* Water Tracker */}
          <WaterTracker
            current={sideTablesData?.water?.current ?? 0}
            goal={sideTablesData?.water?.goal ?? goalsData?.waterGoal ?? 96}
            onAddWater={handleAddWater}
          />

          {/* End of today: what is still ahead of you. See scheduleMealsButton above. */}
          {isToday ? scheduleMealsButton : null}

          {/* Nutrition consultant (NP-155) — the first suggestion quotes
              today's remaining calories/protein, letter for letter the
              web's formula (`goal - consumed`). Sits after the tag list,
              Add tag, Quick Adds, Water and Schedule meals — the web's order
              (NP-262). */}
          <NutritionConsultantTeaser
            remaining={{
              calories: goalCalories - consumedCalories,
              protein: goalProtein - totalProtein,
            }}
          />

          {/* Quick Actions tiles — Quick Add / My Stuff / Meal Plan, matching
              the web's bottom-of-page tile row (NP-262). The persistent
              "Quick Add" and "Find a food" buttons above duplicated the
              search bar and these tiles, so they are gone. */}
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Pressable
              testID="nutrition-quick-add-button"
              accessibilityRole="button"
              accessibilityLabel="Quick Add"
              disabled={isFuture}
              onPress={() => {
                if (!isFuture) setQuickAddOpen(true);
              }}
              style={{
                flex: 1,
                alignItems: "center",
                gap: 8,
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: 12,
                paddingVertical: 14,
                opacity: isFuture ? 0.5 : 1,
              }}
            >
              <View
                className="bg-green-100 dark:bg-green-900/30"
                style={{ width: 40, height: 40, borderRadius: 10, alignItems: "center", justifyContent: "center" }}
              >
                <Plus size={18} color={colors.foreground} />
              </View>
              <Text className="text-foreground text-xs font-medium">Quick Add</Text>
            </Pressable>

            <Pressable
              testID="nutrition-tile-my-stuff"
              accessibilityRole="button"
              accessibilityLabel="My Stuff"
              onPress={() => router.push("/(tabs)/nutrition/recipes")}
              style={{
                flex: 1,
                alignItems: "center",
                gap: 8,
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: 12,
                paddingVertical: 14,
              }}
            >
              <View
                className="bg-orange-100 dark:bg-orange-900/30"
                style={{ width: 40, height: 40, borderRadius: 10, alignItems: "center", justifyContent: "center" }}
              >
                <BookOpen size={18} color={colors.foreground} />
              </View>
              <Text className="text-foreground text-xs font-medium">My Stuff</Text>
            </Pressable>

            <Pressable
              testID="nutrition-tile-meal-plan"
              accessibilityRole="button"
              accessibilityLabel="Meal Plan"
              onPress={() => router.push("/(tabs)/nutrition/meal-plan")}
              style={{
                flex: 1,
                alignItems: "center",
                gap: 8,
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: 12,
                paddingVertical: 14,
              }}
            >
              <View
                className="bg-blue-100 dark:bg-blue-900/30"
                style={{ width: 40, height: 40, borderRadius: 10, alignItems: "center", justifyContent: "center" }}
              >
                <CalendarClock size={18} color={colors.foreground} />
              </View>
              <Text className="text-foreground text-xs font-medium">Meal Plan</Text>
            </Pressable>
          </View>
          </>
          ) : viewMode === "week" ? (
            <TimelineWeekView
              selectedDate={activeDate}
              calorieGoal={goalCalories}
              onOpenDay={handleOpenDay}
              onLogPlan={handleLogPlan}
              onSkipPlan={handleSkipPlan}
              onRemovePlan={handleRemovePlan}
              onEditPlanItem={handleEditPlanItem}
            />
          ) : viewMode === "month" ? (
            <TimelineMonthView
              selectedDate={activeDate}
              calorieGoal={goalCalories}
              onOpenDay={handleOpenDay}
              onLogPlan={handleLogPlan}
              onSkipPlan={handleSkipPlan}
              onRemovePlan={handleRemovePlan}
            />
          ) : (
            // viewMode === "training" inside the day ScrollView cannot happen:
            // the training branch above renders instead. Kept so the union
            // stays exhaustive if the branches above ever change.
            <TrainingPreferencesScreen />
          )}
        </ScrollView>
        )}
      </View>

      {/* Timeline Dropdown Menu */}
      <Modal
        visible={timelineMenuOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setTimelineMenuOpen(false)}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close timeline menu backdrop"
          style={{
            flex: 1,
            backgroundColor: scrim,
            justifyContent: "flex-start",
            alignItems: "flex-end",
            paddingTop: 60,
            paddingRight: 16,
          }}
          onPress={() => setTimelineMenuOpen(false)}
        >
          <Pressable
            testID="nutrition-timeline-menu"
            accessibilityRole="none"
            style={{
              backgroundColor: colors.card,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: colors.border,
              minWidth: 180,
              overflow: "hidden",
            }}
            onPress={(e) => e.stopPropagation()}
          >
            <Pressable
              testID="nutrition-timeline-item"
              accessibilityRole="button"
              accessibilityLabel="Timeline"
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 10,
                paddingHorizontal: 14,
                paddingVertical: 12,
              }}
              onPress={() => {
                setTimelineMenuOpen(false);
                handleViewChange("week");
              }}
            >
              <Clock size={16} color={colors.foreground} />
              <Text className="text-sm font-medium text-foreground">Timeline</Text>
            </Pressable>
            <Pressable
              testID="nutrition-timeline-meal-schedule"
              accessibilityRole="button"
              accessibilityLabel="Meal Schedule"
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 10,
                paddingHorizontal: 14,
                paddingVertical: 12,
                borderTopWidth: 1,
                borderTopColor: colors.border,
              }}
              onPress={() => {
                setTimelineMenuOpen(false);
                router.push("/(tabs)/nutrition/meal-schedule");
              }}
            >
              <Clock size={16} color={colors.foreground} />
              <Text className="text-sm font-medium text-foreground">Meal Schedule</Text>
            </Pressable>
            <Pressable
              testID="nutrition-timeline-scans"
              accessibilityRole="button"
              accessibilityLabel="Estimate history"
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 10,
                paddingHorizontal: 14,
                paddingVertical: 12,
                borderTopWidth: 1,
                borderTopColor: colors.border,
              }}
              onPress={() => {
                setTimelineMenuOpen(false);
                setHistoryOpen(true);
              }}
            >
              <History size={16} color={colors.foreground} />
              <Text className="text-sm font-medium text-foreground">Estimate history</Text>
            </Pressable>
            {/* Unread food-report outcomes (NP-174). Folded into the Timeline
                dropdown (NP-262) — the standalone header pill forced the
                title to wrap. */}
            <FoodReportsBadge
              variant="row"
              testID="nutrition-timeline-food-reports"
              token={token}
              refreshKey={reportsRefreshKey}
              onOpen={() => {
                setTimelineMenuOpen(false);
                setReportsOpen(true);
              }}
            />
          </Pressable>
        </Pressable>
      </Modal>

      {/* Camera Options Modal */}
      <Modal
        visible={cameraMenuOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setCameraMenuOpen(false)}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close camera menu backdrop"
          style={{
            flex: 1,
            backgroundColor: scrim,
            justifyContent: "center",
            alignItems: "center",
            padding: 24,
          }}
          onPress={() => setCameraMenuOpen(false)}
        >
          <Pressable
            testID="nutrition-camera-menu"
            accessibilityRole="none"
            style={{
              backgroundColor: colors.card,
              borderRadius: 16,
              borderWidth: 1,
              borderColor: colors.border,
              padding: 20,
              width: "100%",
              maxWidth: 300,
              gap: 10,
            }}
            onPress={(e) => e.stopPropagation()}
          >
            <Text className="text-foreground text-base font-bold mb-1">
              Camera options
            </Text>
            <Button
              testID="nutrition-camera-take-photo"
              variant="secondary"
              onPress={() => {
                setCameraMenuOpen(false);
                openEstimate("chooser");
              }}
            >
              Take photo
            </Button>
            <Button
              testID="nutrition-camera-scan-barcode"
              variant="secondary"
              onPress={() => {
                setCameraMenuOpen(false);
                openSearch(undefined, { barcode: true });
              }}
            >
              Scan barcode
            </Button>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Upload Options Modal */}
      <Modal
        visible={uploadMenuOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setUploadMenuOpen(false)}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close upload menu backdrop"
          style={{
            flex: 1,
            backgroundColor: scrim,
            justifyContent: "center",
            alignItems: "center",
            padding: 24,
          }}
          onPress={() => setUploadMenuOpen(false)}
        >
          <Pressable
            testID="nutrition-upload-menu"
            accessibilityRole="none"
            style={{
              backgroundColor: colors.card,
              borderRadius: 16,
              borderWidth: 1,
              borderColor: colors.border,
              padding: 20,
              width: "100%",
              maxWidth: 300,
              gap: 10,
            }}
            onPress={(e) => e.stopPropagation()}
          >
            <Text className="text-foreground text-base font-bold mb-1">
              Upload options
            </Text>
            <Button
              testID="nutrition-upload-photo"
              variant="secondary"
              onPress={() => {
                setUploadMenuOpen(false);
                openEstimate("chooser");
              }}
            >
              Upload photo
            </Button>
            <Button
              testID="nutrition-upload-describe"
              variant="secondary"
              onPress={() => {
                setUploadMenuOpen(false);
                openEstimate("describe");
              }}
            >
              Describe
            </Button>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Food Search Sheet (NP-092). On a future day the basket is hidden
          (the web hides it in plan mode, `FoodSearchModal.tsx:2495`): picks
          open `PlanFoodSheet` / `MealLogSheet mode="plan"` instead. */}
      <FoodSearchSheet
        visible={searchOpen}
        onClose={() => {
          setSearchOpen(false);
          setSearchBarcodeOpen(false);
          setAddToLogId(null);
        }}
        currentTag={searchTag}
        initialBarcodeOpen={searchBarcodeOpen}
        basketMode={addToLogId === null && !isFuture}
        basketCount={basket.length}
        onAddToBasket={handlePickBasketFood}
        onPickFood={isFuture ? handlePickBasketFood : undefined}
        onOpenBasket={() => setBasketOpen(true)}
        onPickMeal={handlePickMeal}
      />

      {/* Basket sheet (NP-094) */}
      <BasketSheet
        visible={basketOpen}
        items={basket}
        canSaveMeals={canSaveMeals}
        submitting={basketSubmitting}
        error={basketError}
        onRemoveItem={handleRemoveBasketItem}
        onClose={() => {
          setBasketOpen(false);
          setBasketError(null);
        }}
        onSubmit={handleSubmitBasket}
      />

      {/* Log a saved meal with a portion (NP-094); on a future day the same
          sheet plans it instead (NP-232, the web's plan-mode `MealApplySheet`).
          The plan branch posts through `createMealPlan`, refetches plans, and
          shows the web's "Planned for <weekday, Mon d>" toast. */}
      <MealLogSheet
        visible={mealToLog !== null}
        meal={mealToLog}
        currentTag={searchTag ?? currentDefaultTag}
        submitting={mealLogSubmitting}
        error={mealLogError}
        mode={isFuture ? "plan" : "log"}
        plannedDate={isFuture ? activeDate : undefined}
        onClose={() => {
          setMealToLog(null);
          setMealLogError(null);
        }}
        onSubmit={isFuture ? handlePlanSavedMeal : handleLogSavedMeal}
      />

      {/* Plan a food on a future day (NP-232, NP-230's sheet): the pick lands
          through `createMealPlan`, then plans refetch and the web's
          "Planned for <weekday, Mon d>" toast shows. */}
      <PlanFoodSheet
        visible={foodToPlan !== null}
        food={foodToPlan as QuantityPickerFood | null}
        plannedDate={activeDate}
        tag={searchTag ?? currentDefaultTag}
        onClose={() => setFoodToPlan(null)}
        onPlanned={(toast) => {
          setFoodToPlan(null);
          setSearchOpen(false);
          setSearchBarcodeOpen(false);
          setPlanToolsNotice(toast);
          void refetchMealPlans();
        }}
      />

      {/* Schedule-meals tools (NP-177): copy a day forward + repeat a meal
          across days, from the meal plan and from a future day. */}
      <CopyDaySheet
        visible={copyDayOpen}
        defaultSourceDate={activeDate}
        onClose={() => setCopyDayOpen(false)}
        onApplied={handleBulkApplied}
      />
      <ApplyMealSheet
        visible={applyMealOpen}
        defaultFromDate={activeDate}
        defaultToDate={activeDate}
        defaultTag={searchTag ?? currentDefaultTag}
        availableTags={availableTags}
        onClose={() => setApplyMealOpen(false)}
        onApplied={handleBulkApplied}
      />

      {/* Meal-photo / describe estimate (NP-089) */}
      <EstimateSheet
        visible={estimateOpen}
        onClose={() => {
          setEstimateOpen(false);
          setReopenedScan(null);
        }}
        onLogged={() => void handleEstimateLogged()}
        tag={reopenedScan?.tag ?? currentDefaultTag}
        tagOptions={[
          ...availableTags.defaults,
          ...availableTags.userTags,
          ...sessionTags,
        ]}
        dateKey={activeDate}
        todayKey={today}
        initialPhase={reopenedScan ? "review" : estimatePhase}
        initialReview={
          reopenedScan
            ? reopenedScan.items.map((it) => ({
                ...(typeof it.foodId === "string" ? { foodId: it.foodId } : {}),
                name: it.name,
                ...(it.brand ? { brand: it.brand } : {}),
                ...(it.estimatedServing
                  ? { estimatedServing: it.estimatedServing }
                  : {}),
                ...(it.servingSize != null
                  ? { servingSize: it.servingSize }
                  : {}),
                ...(it.servingUnit ? { servingUnit: it.servingUnit } : {}),
                ...(it.servings != null ? { servings: it.servings } : {}),
                nutrition: {
                  calories: it.nutrition?.calories ?? 0,
                  protein: it.nutrition?.protein ?? 0,
                  carbs: it.nutrition?.carbs ?? 0,
                  fats: it.nutrition?.fats ?? 0,
                },
                ...(it.confidence != null
                  ? { confidence: it.confidence }
                  : {}),
                ...(it.matchKind ? { matchKind: it.matchKind } : {}),
              }))
            : null
        }
        initialImageUrl={reopenedScan?.imageUrl ?? null}
        initialScanId={reopenedScan?.scanId ?? null}
      />

      {/* Estimate history (NP-141) */}
      <ScanHistorySheet
        visible={historyOpen}
        onClose={() => setHistoryOpen(false)}
        token={token}
        todayKey={today}
        windows={scheduleWindows}
        tagOptions={[
          ...availableTags.defaults,
          ...availableTags.userTags,
          ...sessionTags,
        ]}
        onReopen={(scan) => void handleReopenScan(scan)}
        onLogged={() => void handleHistoryLogged()}
      />

      {/* Combine Sheet (NP-175) */}
      <CombineSheet
        key={`combine-session-${combineSession}`}
        visible={combineSheetOpen}
        tag={selectedSection?.tag}
        picked={combinePicked}
        canSaveMeals={canSaveMeals}
        submitting={combining}
        error={combineError}
        onClose={() => {
          setCombineSheetOpen(false);
          setCombineError(null);
        }}
        onSubmit={handleCombine}
      />

      {/* Quick Add Sheet */}
      <QuickAddSheet
        visible={quickAddOpen}
        onClose={() => setQuickAddOpen(false)}
        onSubmit={handleQuickAdd}
        loading={submittingQuickAdd}
      />

      {/* My reports (NP-174): opening marks outcomes read, which clears the badge. */}
      <FoodReportsSheet
        visible={reportsOpen}
        onClose={() => {
          setReportsOpen(false);
          setReportsRefreshKey((k) => k + 1);
        }}
        token={token}
      />

      {/* Edit a logged item (NP-095) */}
      <EditLogItemSheet
        visible={editItemTarget !== null}
        logId={editItemTarget?.logId ?? null}
        item={editItemTarget?.item ?? null}
        loggedAt={
          typeof editItemLog?.loggedAt === "string"
            ? editItemLog.loggedAt
            : undefined
        }
        untimed={Boolean(editItemLog?.untimed)}
        currentTag={editItemTarget?.tag ?? "snack"}
        availableTags={availableTags}
        token={token}
        onClose={() => setEditItemTarget(null)}
        onSaved={handleEditSaved}
      />

      {/* Edit a planned item (NP-233): planId + planItems mode rebuilds the
          whole items[] and PATCHes /api/meal-plans/{id} with { items }. */}
      <EditLogItemSheet
        visible={editPlanTarget !== null}
        logId={null}
        planId={editPlanTarget?.planId ?? null}
        planItems={editPlanTarget?.planItems ?? null}
        item={editPlanTarget?.item ?? null}
        token={token}
        onClose={() => setEditPlanTarget(null)}
        onSaved={handleEditPlanSaved}
        testID="edit-plan-item"
      />

      {/* Edit a whole logged meal (NP-095) */}
      <EditLoggedMealSheet
        visible={editMealTarget !== null}
        logId={editMealTarget?.logId ?? null}
        mealName={editMealTarget?.mealName}
        currentTag={editMealTarget?.tag ?? "snack"}
        availableTags={availableTags}
        loggedAt={
          typeof editMealLog?.loggedAt === "string"
            ? editMealLog.loggedAt
            : undefined
        }
        untimed={Boolean(editMealLog?.untimed)}
        token={token}
        onClose={() => setEditMealTarget(null)}
        onSaved={handleEditSaved}
      />

      {/* Flag sheet for a logged row (NP-174). */}
      {flagTarget ? (
        <FlagFoodSheet
          visible={flagTarget !== null}
          foodId={flagTarget.foodId}
          foodName={flagTarget.name}
          token={token}
          currentNutrition={flagTarget.nutrition}
          portion={{
            label: flagTarget.portionLabel,
            factor: flagTarget.portionFactor,
          }}
          onApplyToLog={(values) => void handleApplyFlagCorrection(values)}
          onClose={() => setFlagTarget(null)}
          editableServingLabel
        />
      ) : null}

      {/* Floating Add Food Button (FAB) */}
      <Pressable
        testID="nutrition-fab-add"
        accessibilityRole="button"
        accessibilityLabel={isFuture ? "Schedule food" : "Add food"}
        onPress={() => openSearch()}
        style={{
          position: "absolute",
          bottom: 24,
          right: 20,
          width: 56,
          height: 56,
          borderRadius: 28,
          backgroundColor: colors.foreground,
          alignItems: "center",
          justifyContent: "center",
          shadowColor: colors.foreground,
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.3,
          shadowRadius: 6,
          elevation: 6,
          zIndex: 40,
        }}
      >
        <Plus size={28} color={colors.background} />
      </Pressable>
    </SafeAreaView>
  );
}
