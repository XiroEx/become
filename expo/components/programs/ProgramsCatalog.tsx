import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "expo-router";
import { Pressable, ScrollView, View } from "react-native";
import { Text } from "@/components/Text";
import { Input } from "@/components/Input";
import { Filter, Heart } from "lucide-react-native";
import {
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
import { useThemeTokens } from "@/lib/theme/useThemeTokens";

const CatalogOrSearchSchema = z.union([
  ProgramSearchResponseSchema,
  z.array(ProgramCatalogItemSchema).transform((programs) => ({
    programs,
    pagination: undefined,
    availableTags: undefined,
  })),
]);

export const BROWSE_LEVELS = [
  "Beginner",
  "Intermediate",
  "Advanced",
  "Beginner to Intermediate",
  "Intermediate to Advanced",
] as const;

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
    return matchRecommendedPrograms(
      programs,
      userFitnessGoal,
      userExperienceLevel,
    );
  }, [hasFilters, programs, userFitnessGoal, userExperienceLevel]);

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

  return (
    <>
      {/* Search Input */}
      <View style={{ marginBottom: 12 }}>
        <Input
          testID="programming-browse-search-input"
          label="Search programs"
          placeholder="Search by name, tags, or description…"
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
      </View>

      {/* Filters Toggle & Chips */}
      <View style={{ marginBottom: 16 }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 8,
          }}
        >
          <Pressable
            testID="programming-browse-filter-toggle"
            accessibilityRole="button"
            accessibilityLabel="Toggle filters"
            onPress={() => setShowFilters((prev) => !prev)}
            className={`flex-row items-center gap-1.5 px-3 py-1.5 rounded-lg border ${
              showFilters || hasFilters
                ? "border-primary bg-primary/10"
                : "border-border bg-card"
            }`}
          >
            <Filter
              size={14}
              color={
                showFilters || hasFilters
                  ? colors.primary
                  : colors["muted-foreground"]
              }
            />
            <Text className="text-foreground text-xs font-semibold">
              Filters
              {hasFilters
                ? ` (${(searchQuery ? 1 : 0) + selectedTags.length + (selectedLevel ? 1 : 0)})`
                : ""}
            </Text>
          </Pressable>

          {hasFilters ? (
            <Pressable
              testID="programming-browse-clear-filters"
              accessibilityRole="button"
              accessibilityLabel="Clear all filters"
              onPress={handleClearFilters}
            >
              <Text className="text-destructive text-xs font-medium">
                Clear filters
              </Text>
            </Pressable>
          ) : null}
        </View>

        {/* Expanded Filter Panel */}
        {showFilters ? (
          <View
            className="p-3 rounded-xl border border-border bg-card mb-2"
            style={{ gap: 12 }}
          >
            {/* Level Filter */}
            <View>
              <Text className="text-muted-foreground text-xs uppercase font-medium mb-2">
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
                      className={`px-3 py-1 rounded-full border ${
                        isSelected
                          ? "bg-primary border-primary"
                          : "bg-background border-border"
                      }`}
                    >
                      <Text
                        className={`text-xs ${
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

            {/* Tag Filters */}
            {availableTags.length > 0 ? (
              <View>
                <Text className="text-muted-foreground text-xs uppercase font-medium mb-2">
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
                        className={`px-3 py-1 rounded-full border ${
                          isSelected
                            ? "bg-primary border-primary"
                            : "bg-background border-border"
                        }`}
                      >
                        <Text
                          className={`text-xs ${
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
          </View>
        ) : null}
      </View>

      {/* Saved Programs Section (shown when saved programs exist and no active query/filters) */}
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
              <Heart
                size={16}
                color={colors.primary}
                fill={colors.primary}
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

      {/* Recommended Programs Row (shown when matches exist and no search/filters) */}
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
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ marginHorizontal: -16 }}
          >
            <View
              style={{
                flexDirection: "row",
                gap: 12,
                paddingHorizontal: 16,
              }}
            >
              {recommendedPrograms.slice(0, 5).map((program) => {
                const isItemSaved = savedProgramIds.has(program.id);
                return (
                  <View
                    key={program.id}
                    testID={`browse-recommended-item-${program.id}`}
                    style={{ width: 240 }}
                    className="rounded-xl border border-border bg-card p-3 justify-between"
                  >
                    <Pressable
                      onPress={() =>
                        router.push(`/(tabs)/programming/${program.id}`)
                      }
                      accessibilityRole="button"
                      accessibilityLabel={`Open program ${program.name}`}
                    >
                      <Text
                        className="text-foreground font-bold text-base mb-1"
                        numberOfLines={1}
                      >
                        {program.name}
                      </Text>
                      <Text
                        className="text-muted-foreground text-xs mb-2"
                        numberOfLines={2}
                      >
                        {program.description}
                      </Text>
                      <View
                        style={{
                          flexDirection: "row",
                          flexWrap: "wrap",
                          gap: 6,
                        }}
                      >
                        {program.durationWeeks ? (
                          <Text className="text-muted-foreground text-xs">
                            {program.durationWeeks}w
                          </Text>
                        ) : null}
                        {program.trainingDaysPerWeek ? (
                          <Text className="text-muted-foreground text-xs">
                            · {program.trainingDaysPerWeek}d/wk
                          </Text>
                        ) : null}
                        {program.targetUser ? (
                          <Text className="text-muted-foreground text-xs">
                            · {program.targetUser}
                          </Text>
                        ) : null}
                      </View>
                    </Pressable>
                    <View
                      style={{
                        flexDirection: "row",
                        justifyContent: "flex-end",
                        marginTop: 8,
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
                        className="p-1.5"
                      >
                        <Heart
                          color={
                            isItemSaved
                              ? colors.primary
                              : colors["muted-foreground"]
                          }
                          fill={
                            isItemSaved ? colors.primary : "transparent"
                          }
                          size={18}
                          strokeWidth={1.5}
                        />
                      </Pressable>
                    </View>
                  </View>
                );
              })}
            </View>
          </ScrollView>
        </View>
      ) : null}

      {/* Catalog / All Programs Header */}
      <View
        style={{
          marginBottom: 8,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Text className="text-foreground text-lg font-bold">
          {hasFilters ? "Search Results" : catalogTitle}
          {total > 0 ? (
            <Text className="text-muted-foreground text-sm font-normal">
              {" "}
              ({total})
            </Text>
          ) : null}
        </Text>
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
          programs={programs}
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
