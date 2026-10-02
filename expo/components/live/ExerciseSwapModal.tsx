import { useState, useEffect, useMemo, useRef } from "react";
import { Modal, View, Pressable, ScrollView, TextInput } from "react-native";
import { Text } from "@/components/Text";
import { Button } from "@/components/Button";
import {
  apiFetch,
  ExerciseAlternativesResponseSchema,
  ExerciseSearchResponseSchema,
  ExerciseVariationsResponseSchema,
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
import { Search, X, ChevronDown, ChevronUp, Sparkles } from "lucide-react-native";

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

/**
 * Exercise swap sheet with:
 * - Scored alternatives with reasons
 * - Catalogue search
 * - Equipment variations
 * - Member's custom exercises
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
  const [catalogMatches, setCatalogMatches] = useState<AlternativeCandidate[] | null>(null);
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [variationsCache, setVariationsCache] = useState<Record<string, ExerciseVariation[]>>({});
  const [selectedVariants, setSelectedVariants] = useState<Record<string, string>>({});

  // Reset local state when opened/closed
  const prevVisibleRef = useRef(visible);
  useEffect(() => {
    if (visible && !prevVisibleRef.current) {
      setSearchQuery("");
      setSelectedSlug(null);
      setCatalogMatches(null);
      setSelectedVariants({});
      setVariationsCache({});
    }
    prevVisibleRef.current = visible;
  }, [visible]);

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
    if (!q) return searchCandidates;
    return searchCandidates.filter((alt) => {
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
      return true;
    });
  }, [searchCandidates, searchQuery, effectiveCatalogMatches]);

  const handleSwap = (alt: AlternativeCandidate, scope: SwapScope) => {
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
              <Text className="text-foreground text-xl font-bold">
                {sourceName ? `Swap ${sourceName}` : "Swap exercise"}
              </Text>
              <Text className="text-muted-foreground text-xs">
                Replace exercise and choose session or program scope
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
              <View className="mb-2">
                <Text className="text-foreground font-semibold text-sm mb-2">
                  {searchQuery.trim().length >= 2 ? "Results" : "Top Suggestions"}
                </Text>
                {filteredAlternatives.map((alt) => {
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
                          onPress={() => setSelectedSlug(isExpanded ? null : alt.slug)}
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
                          onPress={() => setSelectedSlug(isExpanded ? null : alt.slug)}
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
                })}
              </View>
            </ScrollView>
          )}

          {/* Cancel button */}
          <View style={{ height: 8 }} />
          <Button testID={`${testID}-close`} variant="secondary" onPress={onClose}>
            Cancel
          </Button>
        </View>
      </View>
    </Modal>
  );
}
