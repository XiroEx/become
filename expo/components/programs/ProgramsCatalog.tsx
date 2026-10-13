import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "expo-router";
import { Pressable, View } from "react-native";
import { Text } from "@/components/Text";
import { Input } from "@/components/Input";
import { Bookmark, ChevronRight, Filter, Search } from "lucide-react-native";
import {
  ActiveProgramsApiResponseSchema,
  ProgramCatalogItemSchema,
  ProgramSearchResponseSchema,
  SavedProgramsResponseSchema,
  SaveToggleResponseSchema,
  SavedProgramsReorderResponseSchema,
  ProfileResponseSchema,
  apiFetch,
  type SaveProgramRequest,
  type SaveToggleResponse,
  type SavedProgramsReorderRequest,
  type SavedProgramsReorderResponse,
} from "@become/api-client";
import { z } from "zod";
import {
  ProgramsList,
  type ProgramSummary,
} from "@/components/programs/ProgramsList";
import { SavedPrograms } from "@/components/programs/SavedPrograms";
import { WEBAPP_BASE_URL } from "@/lib/config";
import { useAuth } from "@/lib/auth/useAuth";
import { useFetch } from "@/lib/hooks/useFetch";
import { useMutation } from "@/lib/hooks/useMutation";
import { toProgramSummary } from "@/lib/programs/programSummary";
import { matchRecommendedPrograms } from "@/lib/programs/recommendations";
import { useDebouncedValue } from "@/lib/programs/useDebouncedValue";
import { BROWSE_LEVELS } from "@/lib/programs/levels";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";

const CatalogOrSearchSchema = z.union([
  ProgramSearchResponseSchema,
  z.array(ProgramCatalogItemSchema).transform((programs) => ({
    programs,
    pagination: undefined,
    availableTags: undefined,
  })),
]);

// Re-exported for existing call sites (the Browse route re-exports it too).
export { BROWSE_LEVELS };

export function buildSearchPath(
  q: string,
  tags: string[],
  level: string,
  page: number,
  limit = 20,
): string {
  const params = new URLSearchParams();
  const trimmed = q.trim();
  if (trimmed) params.set("q", trimmed);
  tags.forEach((tag) => params.append("tag", tag));
  if (level) params.set("level", level);
  params.set("page", String(page));
  params.set("limit", String(limit));
  return `/api/programs/search?${params.toString()}`;
}

export interface ProgramsCatalogProps {
  /** Heading for the catalog/list section. The Browse screen says "All
   * Programs"; the Workout tab (NP-277) mirrors the web's "Browse Programs"
   * wording for the identical section embedded under Continue Training. */
  catalogTitle?: string;
}

/**
 * Programs search, filter, Saved-for-Later and Recommended-for-You sections
 * (NP-072). Shared by the dedicated Browse screen AND the Workout tab
 * (NP-277), which renders these same sections under Continue Training the
 * way the web's single Workout page does.
 *
 * Implements server-side paged search with tag & level filters, a Recommended
 * row based on user profile goal & level (degrading gracefully on legacy
 * values), Save & Unsave on every card, and a Saved list with drag reorder.
 */
export function ProgramsCatalog({
  catalogTitle = "All Programs",
}: ProgramsCatalogProps) {
  const { colors } = useThemeTokens();
  const router = useRouter();
  const { token } = useAuth();

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedQuery = useDebouncedValue(searchQuery, 250);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [selectedLevel, setSelectedLevel] = useState<string>("");
  const [showFilters, setShowFilters] = useState<boolean>(false);

  // Catalog server-paged state
  const [programs, setPrograms] = useState<ProgramSummary[]>([]);
  const [availableTags, setAvailableTags] = useState<string[]>([]);
  const [hasMore, setHasMore] = useState<boolean>(false);
  const [total, setTotal] = useState<number>(0);
  const [page, setPage] = useState<number>(1);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<unknown>(null);

  const fetchOpts = useMemo(
    () => ({
      baseUrl: WEBAPP_BASE_URL,
      getToken: () => token ?? undefined,
    }),
    [token],
  );

  // Saved programs fetch & mutations
  const saved = useFetch(
    "/api/programs/saved",
    SavedProgramsResponseSchema,
    {
      ...fetchOpts,
      skip: !token,
    },
  );

  const [savedItems, setSavedItems] = useState<ProgramSummary[] | null>(null);

  useEffect(() => {
    if (saved.data?.savedPrograms) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- sync saved list from server fetch
      setSavedItems(saved.data.savedPrograms.map(toProgramSummary));
    }
  }, [saved.data]);

  const saveMut = useMutation<SaveProgramRequest, SaveToggleResponse>(
    "/api/programs/saved",
    SaveToggleResponseSchema,
    {
      method: "POST",
      ...fetchOpts,
    },
  );

  const unsaveMut = useMutation<SaveProgramRequest, SaveToggleResponse>(
    "/api/programs/saved",
    SaveToggleResponseSchema,
    {
      method: "DELETE",
      ...fetchOpts,
    },
  );

  const reorderMut = useMutation<
    SavedProgramsReorderRequest,
    SavedProgramsReorderResponse
  >("/api/programs/saved", SavedProgramsReorderResponseSchema, {
    method: "PATCH",
    ...fetchOpts,
  });

  const savedList = useMemo(
    () =>
      savedItems ??
      (saved.data?.savedPrograms ?? []).map(toProgramSummary),
    [savedItems, saved.data],
  );

  const savedProgramIds = useMemo(
    () => new Set(savedList.map((p) => p.id)),
    [savedList],
  );

  // Active (enrolled) programs — fetched so Browse can exclude them (NP-278:
  // the web's catalog never lists a program the member is already enrolled
  // in; native used to list it anyway).
  const activePrograms = useFetch(
    "/api/programs/active",
    ActiveProgramsApiResponseSchema,
    {
      ...fetchOpts,
      skip: !token,
    },
  );

  const activeProgramIds = useMemo(
    () =>
      new Set(
        (activePrograms.data?.activePrograms ?? []).map((p) => p.programId),
      ),
    [activePrograms.data],
  );

  // A program belongs in Browse only if it is neither a program the member
  // is already enrolled in NOR one of their own custom programs (those live
  // in My Programs). Mirrors the web's `filteredPrograms` exclusion in
  // WorkoutClient.tsx, extended to customs per NP-278.
  const isBrowsable = useCallback(
    (p: ProgramSummary) => !p.isCustom && !activeProgramIds.has(p.id),
    [activeProgramIds],
  );

  const browsePrograms = useMemo(
    () => programs.filter(isBrowsable),
    [programs, isBrowsable],
  );

  // Fetch catalog programs on debounced search / filter change
  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const path = buildSearchPath(
          debouncedQuery,
          selectedTags,
          selectedLevel,
          1,
          20,
        );
        const res = await apiFetch(path, CatalogOrSearchSchema, {
          baseUrl: WEBAPP_BASE_URL,
          getToken: () => token ?? undefined,
        });
        if (!active) return;
        const rawList = Array.isArray(res) ? res : (res.programs ?? []);
        const mapped = rawList.map(toProgramSummary);
        setPrograms(mapped);
        setPage(1);
        setHasMore(Boolean(res.pagination?.hasMore));
        setTotal(res.pagination?.total ?? mapped.length);
        if (res.availableTags && res.availableTags.length > 0) {
          setAvailableTags(res.availableTags);
        }
      } catch (err) {
        if (!active) return;
        setError(err);
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [debouncedQuery, selectedTags, selectedLevel, token]);

  const handleLoadMore = useCallback(async () => {
    if (loading || !hasMore) return;
    const nextPage = page + 1;
    try {
      const path = buildSearchPath(
        debouncedQuery,
        selectedTags,
        selectedLevel,
        nextPage,
        20,
      );
      const res = await apiFetch(path, CatalogOrSearchSchema, {
        baseUrl: WEBAPP_BASE_URL,
        getToken: () => token ?? undefined,
      });
      const rawList = Array.isArray(res) ? res : (res.programs ?? []);
      const mapped = rawList.map(toProgramSummary);
      setPrograms((prev) => [...prev, ...mapped]);
      setPage(nextPage);
      setHasMore(Boolean(res.pagination?.hasMore));
    } catch (err) {
      console.warn("Failed to load more programs:", err);
    }
  }, [
    loading,
    hasMore,
    page,
    debouncedQuery,
    selectedTags,
    selectedLevel,
    token,
  ]);

  // Profile fetch for goal/level-based recommendations
  const profileFetch = useFetch("/api/profile", ProfileResponseSchema, {
    ...fetchOpts,
    skip: !token,
  });

  const userFitnessGoal = profileFetch.data?.profile?.fitnessGoal;
  const userExperienceLevel = profileFetch.data?.profile?.experienceLevel;

  const hasFilters = Boolean(
    debouncedQuery.trim() || selectedTags.length > 0 || selectedLevel,
  );

  const recommendedPrograms = useMemo(() => {
    if (hasFilters) return [];
    // Same base as Browse (no enrolled/custom programs), MINUS anything
    // already saved — the web drops a saved program from "Recommended for
    // You" because it is already surfaced in "Saved for Later" above it.
    const eligible = browsePrograms.filter((p) => !savedProgramIds.has(p.id));
    return matchRecommendedPrograms(
      eligible,
      userFitnessGoal,
      userExperienceLevel,
    );
  }, [
    hasFilters,
    browsePrograms,
    savedProgramIds,
    userFitnessGoal,
    userExperienceLevel,
  ]);

  // Toggle Save handler for every card (catalog, recommended, saved)
  const handleToggleSave = useCallback(
    async (programId: string) => {
      const isCurrentlySaved = savedProgramIds.has(programId);
      const prevSaved = savedItems ?? savedList;

      if (isCurrentlySaved) {
        const next = prevSaved.filter((p) => p.id !== programId);
        setSavedItems(next);
        try {
          await unsaveMut.mutate({ programId });
        } catch {
          setSavedItems(prevSaved);
          await saved.refetch();
        }
      } else {
        const found =
          programs.find((p) => p.id === programId) ??
          recommendedPrograms.find((p) => p.id === programId);
        if (!found) return;

        const next = [...prevSaved, found];
        setSavedItems(next);
        try {
          await saveMut.mutate({ programId });
        } catch {
          setSavedItems(prevSaved);
          await saved.refetch();
        }
      }
    },
    [
      savedProgramIds,
      savedItems,
      savedList,
      programs,
      recommendedPrograms,
      unsaveMut,
      saveMut,
      saved,
    ],
  );

  const handleReorderSaved = useCallback(
    async (reordered: ProgramSummary[]) => {
      const prev = savedItems ?? savedList;
      setSavedItems(reordered);
      try {
        await reorderMut.mutate({ programIds: reordered.map((p) => p.id) });
      } catch {
        setSavedItems(prev);
        await saved.refetch();
      }
    },
    [savedItems, savedList, reorderMut, saved],
  );

  const handleToggleTag = useCallback((tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
    );
  }, []);

  const handleClearFilters = useCallback(() => {
    setSearchQuery("");
    setSelectedTags([]);
    setSelectedLevel("");
  }, []);

  const initialLoading = loading && programs.length === 0;

  // The server's `total` counts every program the catalog visibility clause
  // matches — it does not know about enrollment or which ones are this
  // member's own customs. Subtract what Browse actually excludes so the
  // header count matches what is on screen (NP-278: native showed "(8)"
  // against the web's "(7)" with one enrolled + one custom program on the
  // account).
  const excludedFromBrowseCount = useMemo(
    () => programs.filter((p) => !isBrowsable(p)).length,
    [programs, isBrowsable],
  );
  const displayTotal = Math.max(total - excludedFromBrowseCount, 0);

  return (
    <>
      {/* Saved Programs Section (shown when saved programs exist and no active query/filters) —
          renders first, matching the web order: Saved for Later > Recommended
          for You > Browse Programs (NP-327). */}
      {!hasFilters && savedList.length > 0 ? (
        <View
          testID="programming-browse-saved-section"
          style={{ marginBottom: 20 }}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 8,
            }}
          >
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
            >
              <Bookmark
                size={16}
                color={colors.accent}
                fill={colors.accent}
              />
              <Text className="text-foreground text-lg font-bold">
                Saved for Later
              </Text>
            </View>
            <Text className="text-muted-foreground text-xs">
              Drag to reorder
            </Text>
          </View>
          <SavedPrograms
            programs={savedList}
            onItemPress={(id) => router.push(`/(tabs)/programming/${id}`)}
            onToggleSave={handleToggleSave}
            onReorder={handleReorderSaved}
            scrollEnabled={false}
            testID="saved-programs"
          />
        </View>
      ) : null}

      {/* Recommended Programs Section (shown when matches exist and no
          search/filters) — a vertical stack of full-width cards, matching
          the web's `recommendedPrograms.slice(0, 3)` list (WorkoutClient.tsx);
          native used to show a horizontal carousel of compact cards (NP-327). */}
      {!hasFilters && recommendedPrograms.length > 0 ? (
        <View
          testID="programming-browse-recommended"
          style={{ marginBottom: 20 }}
        >
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 8,
              marginBottom: 10,
            }}
          >
            <Text className="text-foreground text-lg font-bold">
              Recommended for You
            </Text>
            <View className="rounded-full bg-emerald-500/10 px-2 py-0.5 border border-emerald-500/20">
              <Text className="text-emerald-500 text-xs font-medium">
                Based on your goal
              </Text>
            </View>
          </View>
          <View style={{ gap: 12 }}>
            {recommendedPrograms.slice(0, 3).map((program) => {
              const isItemSaved = savedProgramIds.has(program.id);
              const visibleTags = program.tags?.slice(0, 4) ?? [];
              const extraTags =
                (program.tags?.length ?? 0) - visibleTags.length;
              return (
                <View
                  key={program.id}
                  testID={`browse-recommended-item-${program.id}`}
                  style={{
                    flexDirection: "row",
                    alignItems: "flex-start",
                    gap: 12,
                    borderWidth: 1,
                    borderLeftWidth: 6,
                    borderColor: colors.border,
                    borderLeftColor: colors.success,
                    borderRadius: 16,
                    backgroundColor: colors.card,
                    padding: 16,
                  }}
                >
                  <Pressable
                    testID={`browse-recommended-save-${program.id}`}
                    onPress={() => handleToggleSave(program.id)}
                    accessibilityRole="button"
                    accessibilityLabel={
                      isItemSaved
                        ? `Unsave program ${program.name}`
                        : `Save program ${program.name}`
                    }
                    className="p-1 shrink-0"
                  >
                    <Bookmark
                      color={
                        isItemSaved
                          ? colors.success
                          : colors["muted-foreground"]
                      }
                      fill={isItemSaved ? colors.success : "transparent"}
                      size={18}
                      strokeWidth={1.5}
                    />
                  </Pressable>
                  <Pressable
                    onPress={() =>
                      router.push(`/(tabs)/programming/${program.id}`)
                    }
                    accessibilityRole="button"
                    accessibilityLabel={`Open program ${program.name}`}
                    style={{ flex: 1 }}
                  >
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: 6,
                        flexWrap: "wrap",
                      }}
                    >
                      <Text
                        className="text-foreground font-semibold text-base flex-1"
                        numberOfLines={2}
                      >
                        {program.name}
                      </Text>
                    </View>
                    <View
                      style={{
                        flexDirection: "row",
                        flexWrap: "wrap",
                        gap: 4,
                        marginTop: 4,
                      }}
                    >
                      {program.durationWeeks ? (
                        <View className="rounded-full bg-muted px-1.5 py-0.5">
                          <Text className="text-muted-foreground text-xs font-medium">
                            {program.durationWeeks}w
                          </Text>
                        </View>
                      ) : null}
                      {program.trainingDaysPerWeek ? (
                        <View className="rounded-full bg-muted px-1.5 py-0.5">
                          <Text className="text-muted-foreground text-xs font-medium">
                            {program.trainingDaysPerWeek}x/wk
                          </Text>
                        </View>
                      ) : null}
                    </View>
                    {program.targetUser ? (
                      <Text className="text-muted-foreground text-sm mt-1">
                        {program.targetUser}
                      </Text>
                    ) : null}
                    {visibleTags.length > 0 ? (
                      <View
                        style={{
                          flexDirection: "row",
                          flexWrap: "wrap",
                          gap: 4,
                          marginTop: 4,
                        }}
                      >
                        {visibleTags.map((tag) => (
                          <View
                            key={tag}
                            className="rounded-full bg-success/10 px-2 py-0.5"
                          >
                            <Text className="text-success text-xs">
                              {tag}
                            </Text>
                          </View>
                        ))}
                        {extraTags > 0 ? (
                          <Text className="text-muted-foreground text-xs">
                            +{extraTags} more
                          </Text>
                        ) : null}
                      </View>
                    ) : null}
                  </Pressable>
                  <ChevronRight
                    color={colors["muted-foreground"]}
                    size={20}
                    strokeWidth={1.5}
                  />
                </View>
              );
            })}
          </View>
        </View>
      ) : null}

      {/* Browse Heading + Filters Toggle — the web puts Filters to the
          right of the heading, not under the search bar. Renders after
          Saved for Later / Recommended for You, matching the web order
          (NP-327; native used to put this above them). */}
      <View
        testID="programming-browse-heading-row"
        style={{
          marginBottom: 12,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Text className="text-foreground text-lg font-bold">
          {hasFilters ? "Search Results" : catalogTitle}
          {displayTotal > 0 ? (
            <Text className="text-muted-foreground text-sm font-normal">
              {" "}
              ({displayTotal})
            </Text>
          ) : null}
        </Text>

        <Pressable
          testID="programming-browse-filter-toggle"
          accessibilityRole="button"
          accessibilityLabel="Toggle filters"
          onPress={() => setShowFilters((prev) => !prev)}
          className={`flex-row items-center gap-1.5 px-3 py-1.5 rounded-lg ${
            showFilters || hasFilters ? "bg-success/15" : "bg-muted"
          }`}
        >
          <Filter
            size={16}
            color={showFilters || hasFilters ? colors.success : colors["muted-foreground"]}
          />
          <Text
            className={`text-sm font-medium ${
              showFilters || hasFilters ? "text-success" : "text-muted-foreground"
            }`}
          >
            Filters
            {hasFilters
              ? ` (${(searchQuery ? 1 : 0) + selectedTags.length + (selectedLevel ? 1 : 0)})`
              : ""}
          </Text>
        </Pressable>
      </View>

      {/* Search Input */}
      <View style={{ marginBottom: 12 }}>
        <Input
          testID="programming-browse-search-input"
          placeholder="Search by name, tags, or description…"
          accessibilityLabel="Search programs"
          value={searchQuery}
          onChangeText={setSearchQuery}
          leftIcon={<Search size={20} color={colors["muted-foreground"]} />}
        />
      </View>

      {/* Expanded Filter Panel — TAGS first, then EXPERIENCE LEVEL, matching
          the web's order (WorkoutClient.tsx renders Tags before the level
          buttons). */}
      <View style={{ marginBottom: 16 }}>
        {showFilters ? (
          <View
            className="p-4 rounded-xl border border-border bg-card mb-4"
            style={{ gap: 12 }}
          >
            {/* Tag Filters */}
            {availableTags.length > 0 ? (
              <View>
                <Text className="text-muted-foreground text-xs uppercase font-medium tracking-wide mb-2">
                  Tags
                </Text>
                <View
                  style={{
                    flexDirection: "row",
                    flexWrap: "wrap",
                    gap: 6,
                  }}
                >
                  {availableTags.map((tag) => {
                    const isSelected = selectedTags.includes(tag);
                    return (
                      <Pressable
                        key={tag}
                        testID={`programming-browse-tag-${tag}`}
                        accessibilityRole="button"
                        accessibilityLabel={`Filter by tag ${tag}`}
                        onPress={() => handleToggleTag(tag)}
                        className={`px-3 py-1 rounded-full ${
                          isSelected ? "bg-success" : "bg-background border border-border"
                        }`}
                      >
                        <Text
                          className={`text-sm font-medium ${
                            isSelected
                              ? "text-primary-foreground font-semibold"
                              : "text-foreground"
                          }`}
                        >
                          {tag}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ) : null}

            {/* Level Filter */}
            <View>
              <Text className="text-muted-foreground text-xs uppercase font-medium tracking-wide mb-2">
                Experience Level
              </Text>
              <View
                style={{
                  flexDirection: "row",
                  flexWrap: "wrap",
                  gap: 6,
                }}
              >
                {BROWSE_LEVELS.map((level) => {
                  const isSelected = selectedLevel === level;
                  return (
                    <Pressable
                      key={level}
                      testID={`programming-browse-level-${level}`}
                      accessibilityRole="button"
                      accessibilityLabel={`Filter by level ${level}`}
                      onPress={() =>
                        setSelectedLevel(isSelected ? "" : level)
                      }
                      className={`px-3 py-1 rounded-full ${
                        isSelected ? "bg-success" : "bg-background border border-border"
                      }`}
                    >
                      <Text
                        className={`text-sm font-medium ${
                          isSelected
                            ? "text-primary-foreground font-semibold"
                            : "text-foreground"
                        }`}
                      >
                        {level}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {hasFilters ? (
              <Pressable
                testID="programming-browse-clear-filters"
                accessibilityRole="button"
                accessibilityLabel="Clear all filters"
                onPress={handleClearFilters}
              >
                <Text className="text-destructive text-sm font-medium">
                  Clear all filters
                </Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
      </View>

      {/* Error State */}
      {error && programs.length === 0 ? (
        <Text
          testID="programming-browse-error"
          className="text-destructive py-4"
        >
          Couldn&apos;t load programs.
        </Text>
      ) : initialLoading ? (
        /* Loading skeleton */
        <View testID="programming-browse-loading" style={{ gap: 12 }}>
          {[0, 1, 2].map((i) => (
            <View
              key={i}
              style={{
                height: 72,
                borderRadius: 12,
                backgroundColor: colors.muted,
              }}
            />
          ))}
        </View>
      ) : (
        /* Programs List with Server Paging and Save/Unsave on each card */
        <ProgramsList
          programs={browsePrograms}
          serverPaging={true}
          hasMore={hasMore}
          onLoadMore={handleLoadMore}
          onItemPress={(id) => router.push(`/(tabs)/programming/${id}`)}
          onToggleSave={handleToggleSave}
          savedProgramIds={savedProgramIds}
          testID="programs-list"
        />
      )}
    </>
  );
}
