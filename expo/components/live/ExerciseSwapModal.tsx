import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import type { ReactNode } from "react";
import { Modal, View, Pressable, ScrollView, TextInput } from "react-native";
import { Text } from "@/components/Text";
import { Button } from "@/components/Button";
import type { z } from "zod";
import {
  apiFetch,
  classifyApiError,
  ExerciseAlternativesResponseSchema,
  ExerciseSearchResponseSchema,
  ExerciseVariationsResponseSchema,
  CustomExerciseResponseSchema,
  CustomExercisesResponseSchema,
  type AlternativeCandidate,
  type ExerciseAlternativesResponse,
  type ExerciseSearchResponse,
  type ExerciseSearchResult,
  type ExerciseVariationsResponse,
  type ExerciseVariation,
  type CustomExercisesResponse,
  type CustomExercise,
} from "@become/api-client";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";
import { useAuth } from "@/lib/auth/useAuth";
import { WEBAPP_BASE_URL } from "@/lib/config";
import { FramedVideo } from "@/components/FramedVideo";
import { useSingleVideoPlayer } from "@/lib/video/useSingleVideoPlayer";
import { CustomExerciseForm } from "@/components/workout/CustomExerciseForm";
import {
  DEFAULT_CUSTOM_EXERCISE_FORM,
  toCustomExerciseWriteBody,
  type CustomExerciseFormValues,
} from "@/lib/workout/customExercises";
import { useEntitlements, syntheticGate } from "@/lib/entitlements";
import { showUpgradeSheet } from "@/lib/entitlements/upgradeSheet";
import { Search, X, ChevronDown, ChevronUp, Sparkles, Plus } from "lucide-react-native";

export type SwapScope = "session" | "program";

export interface ExerciseSwapModalProps {
  visible: boolean;
  /** Name of the exercise being swapped. */
  sourceName?: string;
  /** Slug of the exercise being swapped. */
  exerciseSlug?: string;
  /** Other exercise slugs in the current workout (to avoid duplicates). */
  workoutExerciseSlugs?: string[];
  /** Role override from the program context. */
  programRole?: string;
  /** Pre-loaded alternatives (optional, e.g. for testing). */
  alternatives?: AlternativeCandidate[];
  loading?: boolean;
  /** Quick sessions have no program — only offer session scope. */
  sessionScopeOnly?: boolean;
  onSelect?: (candidate: AlternativeCandidate, scope?: SwapScope) => void;
  onSwap?: (candidate: AlternativeCandidate, scope: SwapScope) => void;
  onClose: () => void;
  testID?: string;
}

const EQUIPMENT_LABELS: Record<string, string> = {
  barbell: "Barbell",
  dumbbell: "Dumbbell",
  kettlebell: "Kettlebell",
  ez_bar: "EZ Bar",
  trap_bar: "Trap Bar",
  safety_squat_bar: "SSB",
  cable: "Cable",
  leg_press: "Leg Press",
  leg_extension: "Leg Extension",
  leg_curl: "Leg Curl",
  hack_squat: "Hack Squat",
  chest_press_machine: "Chest Press",
  shoulder_press_machine: "Shoulder Press",
  lat_pulldown: "Lat Pulldown",
  seated_row_machine: "Seated Row",
  low_row_machine: "Low Row",
  pec_deck: "Pec Deck",
  smith_machine: "Smith Machine",
  glute_ham_raise: "GHR",
  back_extension: "Back Extension",
  sled: "Sled",
  flat_bench: "Flat Bench",
  incline_bench: "Incline Bench",
  decline_bench: "Decline Bench",
  squat_rack: "Squat Rack",
  pull_up_bar: "Pull-Up Bar",
  dip_station: "Dip Station",
  resistance_band: "Band",
  exercise_mat: "Mat",
  box: "Box",
  ab_wheel: "Ab Wheel",
  medicine_ball: "Med Ball",
  bodyweight: "Bodyweight",
  none: "None",
};

const DIFFICULTY_LABELS: Record<string, string> = {
  beginner: "Beginner",
  intermediate: "Intermediate",
  advanced: "Advanced",
  expert: "Expert",
};

const BODY_REGION_LABELS: Record<string, string> = {
  upper_body: "Upper Body",
  lower_body: "Lower Body",
  core: "Core",
  full_body: "Full Body",
};

// Filters mirror the web swap sheet (webapp/components/ExerciseSwapModal.tsx):
// equipment / body region / difficulty / category, each single-select and
// toggleable (tap again to clear).
interface SwapFilters {
  equipment: string | null;
  bodyRegion: string | null;
  difficulty: string | null;
  category: string | null;
}

const DEFAULT_SWAP_FILTERS: SwapFilters = {
  equipment: null,
  bodyRegion: null,
  difficulty: null,
  category: null,
};

function formatEquipment(eq?: string): string {
  if (!eq) return "Bodyweight";
  return EQUIPMENT_LABELS[eq] || eq.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatMuscle(m: string): string {
  return m.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function getScoreBadgeStyle(score?: number): { bg: string; text: string } {
  const s = score ?? 0;
  if (s >= 75) return { bg: "bg-green-500/20", text: "text-green-600 dark:text-green-400" };
  if (s >= 50) return { bg: "bg-yellow-500/20", text: "text-yellow-600 dark:text-yellow-400" };
  if (s >= 30) return { bg: "bg-orange-500/20", text: "text-orange-600 dark:text-orange-400" };
  return { bg: "bg-muted", text: "text-muted-foreground" };
}

/** One filter row: a label plus a wrapped row of toggleable chips. */
function FilterChipRow({
  label,
  options,
  selected,
  onSelect,
  formatLabel,
  testID,
}: {
  label: string;
  options: string[];
  selected: string | null;
  onSelect: (value: string) => void;
  formatLabel: (value: string) => string;
  testID: string;
}) {
  if (options.length === 0) return null;
  return (
    <View className="flex-row items-start" style={{ gap: 8 }}>
      <Text
        className="text-muted-foreground text-[11px] font-medium uppercase"
        style={{ width: 64, marginTop: 4 }}
      >
        {label}
      </Text>
      <View className="flex-1 flex-row flex-wrap" style={{ gap: 6 }}>
        {options.map((opt) => {
          const active = selected === opt;
          return (
            <Pressable
              key={opt}
              testID={`${testID}-${opt}`}
              onPress={() => onSelect(opt)}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              accessibilityLabel={formatLabel(opt)}
              className={`rounded-full px-2.5 py-1 ${active ? "bg-primary" : "bg-muted"}`}
            >
              <Text
                className={`text-xs font-medium ${
                  active ? "text-primary-foreground" : "text-muted-foreground"
                }`}
              >
                {formatLabel(opt)}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/**
 * A short preview of `items` with a "Show N more (M left)" control —
 * native port of the web's `CollapsibleSection` (webapp/components/CollapsibleSection.tsx).
 * Give it a `key` that changes (modal re-open, new search, filter change) to
 * snap it back to the preview; that's a remount, not a `resetKey` + effect.
 */
function SwapResultsSection({
  title,
  items,
  renderItem,
  testID,
  previewCount = 4,
  step = 8,
}: {
  title: string;
  items: AlternativeCandidate[];
  renderItem: (alt: AlternativeCandidate) => ReactNode;
  testID: string;
  previewCount?: number;
  step?: number;
}) {
  const [visibleCount, setVisibleCount] = useState(previewCount);
  if (items.length === 0) return null;
  const shown = items.slice(0, visibleCount);
  const remaining = items.length - visibleCount;

  return (
    <View className="mb-2">
      <Text className="text-foreground font-semibold text-xs uppercase tracking-wide mb-2">
        {title}
        <Text className="text-muted-foreground font-normal normal-case"> ({items.length})</Text>
      </Text>
      {shown.map((alt) => renderItem(alt))}
      {remaining > 0 ? (
        <Pressable
          testID={`${testID}-show-more`}
          onPress={() => setVisibleCount((v) => v + step)}
          accessibilityRole="button"
          accessibilityLabel={`Show ${Math.min(step, remaining)} more (${remaining} left)`}
          className="rounded-lg border border-border py-2 mt-1 items-center"
        >
          <Text className="text-muted-foreground text-xs font-semibold">
            Show {Math.min(step, remaining)} more
            <Text className="font-normal"> ({remaining} left)</Text>
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/**
 * Exercise swap sheet with:
 * - Scored alternatives with reasons
 * - Catalogue search
 * - Equipment variations
 * - Member's custom exercises
 * - Inline custom-exercise creation (NP-169, NP-083 follow-up)
 * - Program-wide and session-only scope selection
 */
export function ExerciseSwapModal({
  visible,
  sourceName,
  exerciseSlug,
  workoutExerciseSlugs = [],
  programRole,
  alternatives: propsAlternatives,
  loading: propsLoading = false,
  sessionScopeOnly = false,
  onSelect,
  onSwap,
  onClose,
  testID = "swap-modal",
}: ExerciseSwapModalProps) {
  const { colors, scrim } = useThemeTokens();
  const { token } = useAuth();

  const [internalAlts, setInternalAlts] = useState<AlternativeCandidate[]>([]);
  const [internalLoading, setInternalLoading] = useState(false);
  const [customExercises, setCustomExercises] = useState<AlternativeCandidate[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [filters, setFilters] = useState<SwapFilters>(DEFAULT_SWAP_FILTERS);
  const [showFilters, setShowFilters] = useState(false);
  const [catalogMatches, setCatalogMatches] = useState<AlternativeCandidate[] | null>(null);
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [variationsCache, setVariationsCache] = useState<Record<string, ExerciseVariation[]>>({});
  const [selectedVariants, setSelectedVariants] = useState<Record<string, string>>({});
  // Inline creation (NP-169): the same form the My exercises screen uses,
  // so "custom exercise" means the same thing in the swap sheet and the
  // library. Creating goes through `canCreate` (requireQuota on the server);
  // a member at the cap gets the upgrade sheet, not a form error.
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createValues, setCreateValues] = useState<CustomExerciseFormValues>(
    DEFAULT_CUSTOM_EXERCISE_FORM,
  );
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const { data: entitlements, canCreate, refresh: refreshEntitlements } =
    useEntitlements();
  const mayCreateCustom = canCreate("custom-exercises");

  const {
    activeSlug: activePlayingSlug,
    play: playVideo,
    release: releaseVideo,
    registerLayout: registerSwapLayout,
    onScroll: handleSwapScroll,
  } = useSingleVideoPlayer();

  const handleToggleExpand = (slug: string) => {
    setSelectedSlug((prev) => {
      if (prev === slug) {
        releaseVideo();
        return null;
      }
      playVideo(slug);
      return slug;
    });
  };

  // Reset local state when opened/closed
  const prevVisibleRef = useRef(visible);
  useEffect(() => {
    if (visible && !prevVisibleRef.current) {
      setSearchQuery("");
      setSelectedSlug(null);
      releaseVideo();
      setCatalogMatches(null);
      setSelectedVariants({});
      setVariationsCache({});
      setShowCreateForm(false);
      setCreateValues(DEFAULT_CUSTOM_EXERCISE_FORM);
      setCreateError(null);
      setFilters(DEFAULT_SWAP_FILTERS);
      setShowFilters(false);
    } else if (!visible && prevVisibleRef.current) {
      releaseVideo();
    }
    prevVisibleRef.current = visible;
  }, [visible, releaseVideo]);

  // Fetch alternatives if not provided via props
  useEffect(() => {
    if (!visible) return;
    if (propsAlternatives !== undefined) return;
    if (!exerciseSlug) return;

    let active = true;
    const fetchAlts = async () => {
      setInternalLoading(true);
      try {
        const params = new URLSearchParams({ slug: exerciseSlug, limit: "30" });
        if (workoutExerciseSlugs.length > 0) {
          params.set("workoutSlugs", workoutExerciseSlugs.join(","));
        }
        if (programRole) {
          params.set("programRole", programRole);
        }
        const data = await apiFetch<ExerciseAlternativesResponse>(
          `/api/exercises/alternatives?${params.toString()}`,
          ExerciseAlternativesResponseSchema,
          {
            baseUrl: WEBAPP_BASE_URL,
            getToken: () => token ?? undefined,
          },
        );
        if (active && data?.alternatives) {
          setInternalAlts(data.alternatives);
        }
      } catch {
        if (active) setInternalAlts([]);
      } finally {
        if (active) setInternalLoading(false);
      }
    };
    void fetchAlts();
    return () => {
      active = false;
    };
  }, [visible, exerciseSlug, workoutExerciseSlugs, programRole, propsAlternatives, token]);

  // Fetch user's custom exercises
  useEffect(() => {
    if (!visible) return;
    let active = true;
    const fetchCustom = async () => {
      try {
        const data = await apiFetch<CustomExercisesResponse>(
          "/api/exercises/custom",
          CustomExercisesResponseSchema,
          {
            baseUrl: WEBAPP_BASE_URL,
            getToken: () => token ?? undefined,
          },
        );
        if (active && data?.exercises) {
          const excluded = new Set([exerciseSlug, ...workoutExerciseSlugs]);
          const mapped: AlternativeCandidate[] = (data.exercises as CustomExercise[])
            .filter((e: CustomExercise) => !excluded.has(e.slug))
            .map((e: CustomExercise) => ({
              slug: e.slug,
              name: e.name,
              score: 100,
              reasons: ["Your custom exercise"],
              equipment: e.equipment ?? [],
              primaryMuscles: e.primaryMuscles ?? [],
              movementPatterns: e.movementPatterns ?? [],
              difficulty: e.difficulty ?? "intermediate",
              category: e.category,
              bodyRegion: e.bodyRegion,
              role: e.role ?? "accessory",
              trackingType: e.trackingType,
              isExplicitAlternative: true,
              isCustom: true,
              videoUrl: e.videoUrl ?? null,
            }));
          setCustomExercises(mapped);
        }
      } catch {
        if (active) setCustomExercises([]);
      }
    };
    void fetchCustom();
    return () => {
      active = false;
    };
  }, [visible, exerciseSlug, workoutExerciseSlugs, token]);

  // Debounced catalog search
  useEffect(() => {
    const q = searchQuery.trim();
    if (q.length < 2) return;
    const timer = setTimeout(async () => {
      try {
        const res = await apiFetch<ExerciseSearchResponse>(
          `/api/exercises/search?q=${encodeURIComponent(q)}&limit=30`,
          ExerciseSearchResponseSchema,
          {
            baseUrl: WEBAPP_BASE_URL,
            getToken: () => token ?? undefined,
          },
        );
        const excluded = new Set([exerciseSlug, ...workoutExerciseSlugs]);
        const mapped: AlternativeCandidate[] = ((res?.exercises ?? []) as ExerciseSearchResult[])
          .filter((e: ExerciseSearchResult) => !excluded.has(e.slug))
          .map((e: ExerciseSearchResult) => ({
            slug: e.slug,
            name: e.name,
            score: 0,
            reasons: ["Matches your search"],
            equipment: e.equipment ?? [],
            primaryMuscles: e.primaryMuscles ?? [],
            movementPatterns: e.movementPatterns ?? [],
            difficulty: e.difficulty ?? "intermediate",
            category: e.category ?? "strength",
            bodyRegion: e.bodyRegion ?? "full_body",
            role: e.role ?? "accessory",
            trackingType: e.trackingType,
            isExplicitAlternative: false,
            isCustom: e.isCustom ?? false,
            videoUrl: e.videoUrl ?? null,
          }));
        setCatalogMatches(mapped);
      } catch {
        setCatalogMatches([]);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, exerciseSlug, workoutExerciseSlugs, token]);

  // Fetch variations when an alternative card is expanded
  useEffect(() => {
    if (!selectedSlug || variationsCache[selectedSlug] !== undefined) return;
    let active = true;
    const fetchVariations = async () => {
      try {
        const res = await apiFetch<ExerciseVariationsResponse>(
          `/api/exercises/variations?slug=${encodeURIComponent(selectedSlug)}`,
          ExerciseVariationsResponseSchema,
          {
            baseUrl: WEBAPP_BASE_URL,
            getToken: () => token ?? undefined,
          },
        );
        if (active && res?.variations) {
          setVariationsCache((prev) => ({
            ...prev,
            [selectedSlug]: res.variations,
          }));
        }
      } catch {
        if (active) {
          setVariationsCache((prev) => ({
            ...prev,
            [selectedSlug]: [],
          }));
        }
      }
    };
    void fetchVariations();
    return () => {
      active = false;
    };
  }, [selectedSlug, variationsCache, token]);

  const effectiveCatalogMatches =
    searchQuery.trim().length < 2 ? null : catalogMatches;

  const baseAlternatives = propsAlternatives ?? internalAlts;
  const isLoading =
    propsLoading ||
    internalLoading ||
    (propsAlternatives === undefined &&
      internalAlts.length === 0 &&
      Boolean(exerciseSlug) &&
      internalLoading);

  // Merge search candidates
  const searchCandidates = useMemo(() => {
    if (!effectiveCatalogMatches) return baseAlternatives;
    const bySlug = new Map(baseAlternatives.map((alt) => [alt.slug, alt]));
    for (const match of effectiveCatalogMatches) {
      if (!bySlug.has(match.slug)) bySlug.set(match.slug, match);
    }
    return [...bySlug.values()];
  }, [baseAlternatives, effectiveCatalogMatches]);

  const filteredAlternatives = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return searchCandidates.filter((alt) => {
      if (q) {
        const isCatalogMatch =
          effectiveCatalogMatches?.some((m) => m.slug === alt.slug) ?? false;
        if (
          !isCatalogMatch &&
          !alt.name.toLowerCase().includes(q) &&
          !alt.equipment?.some((e: string) =>
            formatEquipment(e).toLowerCase().includes(q),
          ) &&
          !alt.primaryMuscles?.some((m: string) =>
            formatMuscle(m).toLowerCase().includes(q),
          )
        ) {
          return false;
        }
      }
      if (filters.equipment && !alt.equipment?.includes(filters.equipment)) {
        return false;
      }
      if (filters.bodyRegion && alt.bodyRegion !== filters.bodyRegion) {
        return false;
      }
      if (filters.difficulty && alt.difficulty !== filters.difficulty) {
        return false;
      }
      if (filters.category && alt.category !== filters.category) {
        return false;
      }
      return true;
    });
  }, [searchCandidates, searchQuery, effectiveCatalogMatches, filters]);

  // Filter chip options, collected from whatever is currently in play
  // (scored alternatives + any catalogue search match) — mirrors the web's
  // equipmentOptions/bodyRegionOptions/difficultyOptions/categoryOptions.
  const equipmentOptions = useMemo(
    () => [...new Set(searchCandidates.flatMap((alt) => alt.equipment ?? []))].sort(),
    [searchCandidates],
  );
  const bodyRegionOptions = useMemo(
    () =>
      [
        ...new Set(
          searchCandidates
            .map((alt) => alt.bodyRegion)
            .filter((v): v is string => Boolean(v)),
        ),
      ].sort(),
    [searchCandidates],
  );
  const difficultyOptions = useMemo(
    () =>
      [
        ...new Set(
          searchCandidates
            .map((alt) => alt.difficulty)
            .filter((v): v is string => Boolean(v)),
        ),
      ].sort(),
    [searchCandidates],
  );
  const categoryOptions = useMemo(
    () =>
      [
        ...new Set(
          searchCandidates
            .map((alt) => alt.category)
            .filter((v): v is string => Boolean(v)),
        ),
      ].sort(),
    [searchCandidates],
  );

  const activeFilterCount = useMemo(
    () => Object.values(filters).filter(Boolean).length,
    [filters],
  );

  const toggleFilter = useCallback((key: keyof SwapFilters, value: string) => {
    setFilters((prev) => ({
      ...prev,
      [key]: prev[key] === value ? null : value,
    }));
  }, []);

  const clearFilters = useCallback(() => setFilters(DEFAULT_SWAP_FILTERS), []);

  // Snap the results section back to its preview (4 shown) whenever the
  // modal re-opens, the query changes, or a filter changes — a section must
  // never open already showing every one of 30 results from a previous visit.
  const sectionResetKey = useMemo(
    () =>
      [
        visible,
        searchQuery,
        filters.equipment,
        filters.bodyRegion,
        filters.difficulty,
        filters.category,
      ].join("|"),
    [visible, searchQuery, filters],
  );

  // The swap handler must read the LATEST `selectedVariants` at press time
  // (the variation-selection test pins this: picking a variation then tapping
  // Swap must swap the VARIED slug). A `useCallback` with empty deps would
  // close over the first render's state, and a plain function re-created every
  // render trips `exhaustive-deps` in the inline-create callback below — so
  // the implementation lives in a ref updated by effect (outside render), and
  // the stable handle calls through it.
  const handleSwapRef = useRef(
    (_alt: AlternativeCandidate, _scope: SwapScope) => {},
  );
  useEffect(() => {
    handleSwapRef.current = (alt: AlternativeCandidate, scope: SwapScope) => {
    const chosenVarSlug = selectedVariants[alt.slug];
    let chosenCandidate = alt;
    if (chosenVarSlug && chosenVarSlug !== alt.slug) {
      const variations = variationsCache[alt.slug] || [];
      const chosenVariation = variations.find((v) => v.slug === chosenVarSlug);
      if (chosenVariation) {
        chosenCandidate = {
          ...alt,
          slug: chosenVariation.slug,
          name: chosenVariation.name,
          equipment: chosenVariation.equipment,
          laterality: chosenVariation.laterality,
          difficulty: chosenVariation.difficulty,
          trackingType: chosenVariation.trackingType ?? alt.trackingType,
          category: chosenVariation.category ?? alt.category,
          movementPatterns: chosenVariation.movementPatterns ?? alt.movementPatterns,
        };
      }
    }
    if (onSwap) {
      onSwap(chosenCandidate, scope);
    }
    if (onSelect) {
      if (onSwap) {
        onSelect(chosenCandidate, scope);
      } else {
        // If only onSelect provided (e.g. legacy/stub tests with 1-arg expectations)
        onSelect(chosenCandidate);
      }
    }
    onClose();
    };
  }, [selectedVariants, variationsCache, onSwap, onSelect, onClose]);
  // Stable handle for every press site: always calls the latest render's
  // implementation above (which must read the latest `selectedVariants` —
  // see its note), without changing identity every render.
  const handleSwap = useCallback(
    (alt: AlternativeCandidate, scope: SwapScope) => {
      handleSwapRef.current(alt, scope);
    },
    [],
  );

  const openCreateForm = useCallback(() => {
    if (!mayCreateCustom && entitlements && entitlements.enforced !== false) {
      const entitlement = entitlements.features?.["custom-exercises"] ?? null;
      showUpgradeSheet(
        syntheticGate(
          "custom-exercises",
          entitlement?.requiresTier ?? "plus",
          entitlement,
        ),
      );
      return;
    }
    setCreateError(null);
    setCreateValues(DEFAULT_CUSTOM_EXERCISE_FORM);
    setShowCreateForm(true);
  }, [mayCreateCustom, entitlements]);

  const closeCreateForm = useCallback(() => {
    if (creating) return;
    setShowCreateForm(false);
    setCreateError(null);
  }, [creating]);

  // Inline creation: POST the same body the library sends, map the created
  // exercise onto a swap candidate, and swap it straight in — the web's
  // "Create & Swap In" in one step. A plan-gate raises the upgrade sheet
  // (NP-052); anything else is the server's own words under the form.
  const confirmCreateForm = useCallback(async () => {
    if (!createValues.name.trim()) {
      setCreateError("Name is required");
      return;
    }
    setCreating(true);
    setCreateError(null);
    try {
      // `z.infer` spelled out: a bare `apiFetch(path, schema)` infers `{}`
      // under this repo's zod/TS pairing (every other screen does the same).
      const created = await apiFetch<
        z.infer<typeof CustomExerciseResponseSchema>
      >(
        "/api/exercises/custom",
        CustomExerciseResponseSchema,
        {
          method: "POST",
          body: toCustomExerciseWriteBody(createValues),
          baseUrl: WEBAPP_BASE_URL,
          getToken: () => token ?? undefined,
        },
      );
      const ex = created.exercise;
      const candidate: AlternativeCandidate = {
        slug: ex.slug,
        name: ex.name,
        score: 100,
        reasons: ["Your custom exercise"],
        equipment: ex.equipment ?? [],
        primaryMuscles: ex.primaryMuscles ?? [],
        movementPatterns: ex.movementPatterns ?? [],
        difficulty: ex.difficulty ?? "intermediate",
        category: ex.category,
        bodyRegion: ex.bodyRegion,
        role: ex.role ?? "accessory",
        trackingType: ex.trackingType,
        isExplicitAlternative: true,
        isCustom: true,
        videoUrl: ex.videoUrl ?? null,
      };
      setCustomExercises((prev) =>
        prev.some((c) => c.slug === candidate.slug) ? prev : [...prev, candidate],
      );
      setShowCreateForm(false);
      setCreateValues(DEFAULT_CUSTOM_EXERCISE_FORM);
      await refreshEntitlements().catch(() => {});
      handleSwap(candidate, "session");
    } catch (err) {
      const classification = classifyApiError(err);
      if (classification.kind === "plan-gate") {
        setCreating(false);
        setShowCreateForm(false);
        showUpgradeSheet(classification.gate);
        await refreshEntitlements().catch(() => {});
        return;
      }
      const message =
        classification.message ?? "Could not create that exercise. Try again.";
      setCreateError(message);
      setCreating(false);
    }
  }, [createValues, token, refreshEntitlements, handleSwap]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View
        testID={testID}
        style={{ flex: 1, justifyContent: "flex-end", backgroundColor: scrim }}
      >
        <View
          style={{
            backgroundColor: colors.card,
            padding: 16,
            borderTopLeftRadius: 20,
            borderTopRightRadius: 20,
            maxHeight: "85%",
          }}
        >
          {/* Drag Handle */}
          <View className="self-center mb-2 h-1 w-10 rounded-full bg-muted" />

          {/* Header */}
          <View className="flex-row items-center justify-between mb-3">
            <View className="flex-1 mr-2">
              <Text className="text-foreground text-xl font-bold">Swap Exercise</Text>
              <Text className="text-muted-foreground text-xs">
                Replace {sourceName || "exercise"}
              </Text>
            </View>
            <Pressable
              onPress={onClose}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Close"
              className="p-1 rounded-full bg-muted"
            >
              <X size={18} color={colors["muted-foreground"]} />
            </Pressable>
          </View>

          {/* Search input */}
          <View className="flex-row items-center bg-card border border-border rounded-xl px-3 py-2 mb-3">
            <Search size={16} color={colors["muted-foreground"]} />
            <TextInput
              testID={`${testID}-search`}
              placeholder="Search exercises, muscles, equipment..."
              placeholderTextColor={colors["muted-foreground"]}
              value={searchQuery}
              onChangeText={setSearchQuery}
              className="flex-1 ml-2 text-foreground text-sm py-0"
              style={{ color: colors.foreground }}
              autoCapitalize="none"
              autoCorrect={false}
            />
            {searchQuery.length > 0 ? (
              <Pressable
                onPress={() => setSearchQuery("")}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Clear search"
              >
                <X size={14} color={colors["muted-foreground"]} />
              </Pressable>
            ) : null}
          </View>

          {/* Filters toggle + result count */}
          <View className="flex-row items-center mb-2" style={{ gap: 8 }}>
            <Pressable
              testID={`${testID}-filters-toggle`}
              onPress={() => setShowFilters((v) => !v)}
              accessibilityRole="button"
              accessibilityLabel="Filters"
              accessibilityState={{ expanded: showFilters }}
              className={`flex-row items-center rounded-full px-3 py-1.5 ${
                showFilters || activeFilterCount > 0 ? "bg-primary/15" : "bg-muted"
              }`}
              style={{ gap: 6 }}
            >
              <Text
                className={`text-xs font-medium ${
                  showFilters || activeFilterCount > 0 ? "text-primary" : "text-muted-foreground"
                }`}
              >
                Filters
              </Text>
              {activeFilterCount > 0 ? (
                <View className="h-4 w-4 items-center justify-center rounded-full bg-primary">
                  <Text className="text-primary-foreground text-[10px] font-semibold">
                    {activeFilterCount}
                  </Text>
                </View>
              ) : null}
            </Pressable>
            {activeFilterCount > 0 ? (
              <Pressable
                testID={`${testID}-filters-clear`}
                onPress={clearFilters}
                accessibilityRole="button"
                accessibilityLabel="Clear all filters"
              >
                <Text className="text-muted-foreground text-xs">Clear all</Text>
              </Pressable>
            ) : null}
            <View style={{ flex: 1 }} />
            <Text testID={`${testID}-result-count`} className="text-muted-foreground text-xs">
              {filteredAlternatives.length} result{filteredAlternatives.length !== 1 ? "s" : ""}
            </Text>
          </View>

          {showFilters ? (
            <View className="mb-3" style={{ gap: 8 }}>
              <FilterChipRow
                label="Equipment"
                options={equipmentOptions}
                selected={filters.equipment}
                onSelect={(v) => toggleFilter("equipment", v)}
                formatLabel={formatEquipment}
                testID={`${testID}-filter-equipment`}
              />
              <FilterChipRow
                label="Region"
                options={bodyRegionOptions}
                selected={filters.bodyRegion}
                onSelect={(v) => toggleFilter("bodyRegion", v)}
                formatLabel={(v) => BODY_REGION_LABELS[v] || v}
                testID={`${testID}-filter-region`}
              />
              <FilterChipRow
                label="Difficulty"
                options={difficultyOptions}
                selected={filters.difficulty}
                onSelect={(v) => toggleFilter("difficulty", v)}
                formatLabel={(v) => DIFFICULTY_LABELS[v] || v}
                testID={`${testID}-filter-difficulty`}
              />
              <FilterChipRow
                label="Type"
                options={categoryOptions}
                selected={filters.category}
                onSelect={(v) => toggleFilter("category", v)}
                formatLabel={(v) => v.charAt(0).toUpperCase() + v.slice(1)}
                testID={`${testID}-filter-category`}
              />
            </View>
          ) : null}

          {/* Content */}
          {isLoading ? (
            <Text testID={`${testID}-loading`} className="text-muted-foreground py-6 text-center">
              Finding alternatives…
            </Text>
          ) : filteredAlternatives.length === 0 && customExercises.length === 0 ? (
            <Text testID={`${testID}-empty`} className="text-muted-foreground py-6 text-center">
              No alternatives found.
            </Text>
          ) : (
            <ScrollView
              style={{ maxHeight: 420 }}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              onScroll={handleSwapScroll}
              scrollEventThrottle={16}
            >
              {/* My Custom Exercises */}
              {customExercises.length > 0 && !searchQuery.trim() ? (
                <View className="mb-4">
                  <Text className="text-foreground font-semibold text-sm mb-2">
                    My Exercises
                  </Text>
                  {customExercises.map((cust) => (
                    <View
                      key={cust.slug}
                      testID={`${testID}-custom-${cust.slug}`}
                      className="border border-border rounded-xl p-3 mb-2 bg-card flex-row items-center justify-between"
                    >
                      <View className="flex-1 mr-2">
                        <View className="flex-row items-center gap-1.5 flex-wrap">
                          <Text className="text-foreground font-semibold text-sm">
                            {cust.name}
                          </Text>
                          <View className="flex-row items-center bg-green-500/20 rounded px-1.5 py-0.5">
                            <Sparkles size={10} color={colors.primary} />
                            <Text className="text-primary text-[10px] font-semibold ml-0.5">
                              Yours
                            </Text>
                          </View>
                        </View>
                        <Text className="text-muted-foreground text-xs mt-0.5">
                          {cust.trackingType?.replace(/_/g, " ")}
                          {cust.primaryMuscles && cust.primaryMuscles.length > 0
                            ? ` · ${cust.primaryMuscles.slice(0, 2).map((m: string) => formatMuscle(m)).join(", ")}`
                            : ""}
                        </Text>
                      </View>
                      <Pressable
                        testID={`${testID}-custom-${cust.slug}-swap`}
                        onPress={() => handleSwap(cust, "session")}
                        accessibilityRole="button"
                        accessibilityLabel={`Use ${cust.name}`}
                        className="bg-primary px-3 py-1.5 rounded-lg"
                      >
                        <Text className="text-primary-foreground font-semibold text-xs">
                          Use
                        </Text>
                      </Pressable>
                    </View>
                  ))}
                </View>
              ) : null}

              {/* Suggestions / Search Results */}
              <SwapResultsSection
                key={sectionResetKey}
                testID={testID}
                title={searchQuery.trim().length >= 2 ? "Results" : "Top Suggestions"}
                items={filteredAlternatives}
                renderItem={(alt) => {
                  const isExpanded = selectedSlug === alt.slug;
                  const scoreBadge = getScoreBadgeStyle(alt.score);
                  const variations = variationsCache[alt.slug] ?? null;
                  const hasVariations = variations !== null && variations.length > 1;
                  const chosenVarSlug = selectedVariants[alt.slug];
                  const chosenVariation = hasVariations
                    ? variations?.find((v) => v.slug === chosenVarSlug) ?? null
                    : null;
                  const displayName = chosenVariation ? chosenVariation.name : alt.name;

                  return (
                    <View
                      key={alt.slug}
                      onLayout={(e) => {
                        registerSwapLayout(alt.slug, {
                          y: e.nativeEvent.layout.y,
                          height: e.nativeEvent.layout.height,
                        });
                      }}
                      className={`border rounded-xl p-3 mb-2.5 ${
                        isExpanded ? "border-primary bg-primary/5" : "border-border bg-card"
                      }`}
                    >
                      {/* Main row */}
                      <View className="flex-row items-center">
                        {/* Match score badge */}
                        <View
                          className={`w-9 h-9 rounded-full items-center justify-center mr-3 ${scoreBadge.bg}`}
                        >
                          <Text className={`text-xs font-bold ${scoreBadge.text}`}>
                            {alt.score ?? 0}
                          </Text>
                        </View>

                        {/* Title and details */}
                        <Pressable
                          className="flex-1 min-w-0"
                          onPress={() => handleToggleExpand(alt.slug)}
                          accessibilityRole="button"
                          accessibilityLabel={`View details for ${displayName}`}
                        >
                          <View className="flex-row items-center gap-1.5 flex-wrap">
                            <Text className="text-foreground font-semibold text-sm truncate">
                              {displayName}
                            </Text>
                            {alt.isCustom ? (
                              <View className="flex-row items-center bg-green-500/20 rounded px-1.5 py-0.5">
                                <Sparkles size={10} color={colors.primary} />
                                <Text className="text-primary text-[10px] font-semibold ml-0.5">
                                  Yours
                                </Text>
                              </View>
                            ) : null}
                            {alt.isExplicitAlternative && !alt.isCustom ? (
                              <View className="bg-primary/20 rounded px-1.5 py-0.5">
                                <Text className="text-primary text-[10px] font-semibold">
                                  Recommended
                                </Text>
                              </View>
                            ) : null}
                            {hasVariations ? (
                              <View className="bg-blue-500/20 rounded px-1.5 py-0.5">
                                <Text className="text-blue-500 text-[10px] font-semibold">
                                  {variations?.length} variations
                                </Text>
                              </View>
                            ) : null}
                          </View>
                          <Text className="text-muted-foreground text-xs mt-0.5 truncate">
                            {formatEquipment(chosenVariation?.equipment?.[0] ?? alt.equipment?.[0])}
                            {" · "}
                            {DIFFICULTY_LABELS[chosenVariation?.difficulty ?? alt.difficulty ?? "intermediate"] ?? alt.difficulty}
                          </Text>
                        </Pressable>

                        {/* Quick Swap button (session scope) */}
                        <Pressable
                          testID={`${testID}-option-${alt.slug}`}
                          onPress={() => handleSwap(alt, "session")}
                          accessibilityRole="button"
                          accessibilityLabel={`Swap to ${displayName}`}
                          className="bg-primary/10 border border-primary/30 rounded-lg px-2.5 py-1.5 ml-2"
                        >
                          <Text className="text-primary text-xs font-semibold">Swap</Text>
                        </Pressable>

                        {/* Expand Chevron */}
                        <Pressable
                          testID={`${testID}-option-${alt.slug}-expand`}
                          onPress={() => handleToggleExpand(alt.slug)}
                          accessibilityRole="button"
                          accessibilityLabel={isExpanded ? "Collapse" : "Expand"}
                          className="p-1.5 ml-1"
                        >
                          {isExpanded ? (
                            <ChevronUp size={18} color={colors["muted-foreground"]} />
                          ) : (
                            <ChevronDown size={18} color={colors["muted-foreground"]} />
                          )}
                        </Pressable>
                      </View>

                      {/* Expanded Section */}
                      {isExpanded ? (
                        <View className="mt-3 pt-3 border-t border-border">
                          {/* Demo video preview */}
                          {alt.videoUrl ? (
                            <View className="mb-3">
                              <FramedVideo
                                src={alt.videoUrl}
                                thumbnailUrl={typeof alt.thumbnailUrl === "string" ? alt.thumbnailUrl : null}
                                surface="preview"
                                exerciseName={displayName}
                                isPlaying={activePlayingSlug === alt.slug}
                                onPlayPress={() => playVideo(alt.slug)}
                                testID={`${testID}-option-${alt.slug}-video`}
                              />
                            </View>
                          ) : null}

                          {/* Reasons */}
                          {alt.reasons && alt.reasons.length > 0 ? (
                            <View className="mb-2">
                              {alt.reasons.slice(0, 3).map((reason: string, idx: number) => (
                                <Text
                                  key={idx}
                                  className="text-muted-foreground text-xs mb-0.5"
                                >
                                  • {reason}
                                </Text>
                              ))}
                            </View>
                          ) : null}

                          {/* Muscles & Patterns */}
                          <View className="flex-row flex-wrap gap-1 mb-3">
                            {alt.primaryMuscles?.map((m: string) => (
                              <View key={m} className="bg-muted rounded px-1.5 py-0.5">
                                <Text className="text-muted-foreground text-[10px]">
                                  {formatMuscle(m)}
                                </Text>
                              </View>
                            ))}
                            {alt.movementPatterns?.map((p: string) => (
                              <View key={p} className="bg-muted rounded px-1.5 py-0.5">
                                <Text className="text-muted-foreground text-[10px]">
                                  {p.replace(/_/g, " ")}
                                </Text>
                              </View>
                            ))}
                          </View>

                          {/* Variations */}
                          {hasVariations ? (
                            <View className="mb-3">
                              <Text className="text-foreground text-xs font-medium mb-1.5">
                                Pick a variation
                              </Text>
                              <View className="flex-row flex-wrap gap-1.5">
                                {variations?.map((v: ExerciseVariation) => {
                                  const isVarActive =
                                    chosenVarSlug === v.slug ||
                                    (!chosenVarSlug && v.slug === alt.slug);
                                  return (
                                    <Pressable
                                      key={v.slug}
                                      testID={`${testID}-option-${alt.slug}-var-${v.slug}`}
                                      onPress={() =>
                                        setSelectedVariants((prev) => ({
                                          ...prev,
                                          [alt.slug]: v.slug,
                                        }))
                                      }
                                      accessibilityRole="button"
                                      accessibilityLabel={`Select variation ${v.name}`}
                                      className={`rounded-lg border px-2 py-1 ${
                                        isVarActive
                                          ? "border-primary bg-primary/10"
                                          : "border-border bg-card"
                                      }`}
                                    >
                                      <Text
                                        className={`text-xs ${
                                          isVarActive
                                            ? "text-primary font-semibold"
                                            : "text-muted-foreground"
                                        }`}
                                      >
                                        {v.name}
                                      </Text>
                                    </Pressable>
                                  );
                                })}
                              </View>
                            </View>
                          ) : null}

                          {/* Scope Buttons */}
                          {sessionScopeOnly ? (
                            <Button
                              testID={`${testID}-option-${alt.slug}-swap`}
                              variant="primary"
                              size="sm"
                              onPress={() => handleSwap(alt, "session")}
                            >
                              Swap {chosenVariation ? chosenVariation.name : "Exercise"}
                            </Button>
                          ) : (
                            <View className="gap-2">
                              <Button
                                testID={`${testID}-option-${alt.slug}-program`}
                                variant="primary"
                                size="sm"
                                onPress={() => handleSwap(alt, "program")}
                              >
                                {chosenVariation
                                  ? `Swap "${chosenVariation.name}" for All Future Workouts`
                                  : "Swap for All Future Workouts"}
                              </Button>
                              <Button
                                testID={`${testID}-option-${alt.slug}-session`}
                                variant="secondary"
                                size="sm"
                                onPress={() => handleSwap(alt, "session")}
                              >
                                Just This Session
                              </Button>
                            </View>
                          )}
                        </View>
                      ) : null}
                    </View>
                  );
                }}
              />
            </ScrollView>
          )}

          {/* Cancel button */}
          <View style={{ height: 8 }} />
          {showCreateForm ? (
            <View testID={`${testID}-create-form`} style={{ marginTop: 8 }}>
              <View className="flex-row items-center gap-2 mb-3">
                <Pressable
                  testID={`${testID}-create-back`}
                  onPress={closeCreateForm}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel="Back to alternatives"
                  className="p-1 rounded-full bg-muted"
                >
                  <X size={18} color={colors["muted-foreground"]} />
                </Pressable>
                <Text className="text-foreground text-sm font-semibold">
                  Create Custom Exercise
                </Text>
              </View>
              <CustomExerciseForm
                values={createValues}
                onChange={setCreateValues}
                error={createError}
                submitting={creating}
                submitLabel={creating ? "Creating..." : "Create & Swap In"}
                onSubmit={() => void confirmCreateForm()}
                onCancel={closeCreateForm}
                testID={`${testID}-create`}
              />
            </View>
          ) : (
            <>
              <Pressable
                testID={`${testID}-create-custom`}
                onPress={openCreateForm}
                accessibilityRole="button"
                accessibilityLabel="Create Custom Exercise"
                className="flex-row items-center justify-center gap-2 rounded-xl border border-dashed border-border py-3 mt-1"
              >
                <Plus size={16} color={colors["muted-foreground"]} />
                <Text className="text-muted-foreground text-sm font-medium">
                  Create Custom Exercise
                </Text>
              </Pressable>
              <View style={{ height: 8 }} />
              <Button testID={`${testID}-close`} variant="secondary" onPress={onClose}>
                Cancel
              </Button>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}
