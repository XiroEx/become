import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "expo-router";
import { ScrollView, View } from "react-native";
import { Text } from "@/components/Text";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  ProgramSearchResponseSchema,
  apiFetch,
  type ProgramSearchQuery,
} from "@become/api-client";
import { ProgramsSearch } from "@/components/programs/ProgramsSearch";
import {
  buildProgramSearchUrl,
  hasActiveFilters,
  type ProgramSearchFiltersState,
} from "@/components/programs/ProgramFilters";
import { WEBAPP_BASE_URL } from "@/lib/config";
import { useAuth } from "@/lib/auth/useAuth";
import { toProgramSummary } from "@/lib/programs/programSummary";
import type { ProgramSummary } from "@/components/programs/ProgramsList";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";

const SEARCH_DEBOUNCE_MS = 250;

const INITIAL_FILTERS: ProgramSearchFiltersState = {
  tags: [],
  level: undefined,
  days: undefined,
  minWeeks: undefined,
  maxWeeks: undefined,
};

/**
 * Program search route. ProgramsSearch owns the input + debounce and surfaces
 * the debounced query and filters; this route coordinates with GET /api/programs/search
 * using typed query params, reads availableTags and pagination, and handles server-side page appending.
 */
export default function ProgramsSearchRoute() {
  const { colors } = useThemeTokens();
  const router = useRouter();
  const { token } = useAuth();

  const [query, setQuery] = useState<string>("");
  const [filters, setFilters] =
    useState<ProgramSearchFiltersState>(INITIAL_FILTERS);
  const [programs, setPrograms] = useState<ProgramSummary[]>([]);
  const [availableTags, setAvailableTags] = useState<string[]>([]);
  const [hasMore, setHasMore] = useState<boolean>(false);
  const [page, setPage] = useState<number>(1);
  const [loading, setLoading] = useState<boolean>(false);

  const trimmedQuery = query.trim();
  const isSearchOrFilterActive = Boolean(
    trimmedQuery || hasActiveFilters(filters),
  );

  const fetchOpts = useMemo(
    () => ({
      baseUrl: WEBAPP_BASE_URL,
      getToken: () => token ?? undefined,
    }),
    [token],
  );

  // New query or filter change resets to page 1 and fetches fresh results
  useEffect(() => {
    if (!isSearchOrFilterActive) {
      return;
    }

    let active = true;
    async function searchPageOne() {
      setLoading(true);
      try {
        const queryObj: ProgramSearchQuery = {
          q: trimmedQuery || undefined,
          tag: filters.tags.length > 0 ? filters.tags : undefined,
          level: filters.level || undefined,
          days: filters.days,
          minWeeks: filters.minWeeks,
          maxWeeks: filters.maxWeeks,
          page: 1,
        };
        const url = buildProgramSearchUrl(queryObj);
        const res = await apiFetch(url, ProgramSearchResponseSchema, fetchOpts);
        if (!active) return;
        const mapped = (res.programs ?? []).map(toProgramSummary);
        setPrograms(mapped);
        setPage(1);
        setHasMore(Boolean(res.pagination?.hasMore));
        if (res.availableTags && res.availableTags.length > 0) {
          setAvailableTags(res.availableTags);
        }
      } catch (err) {
        if (!active) return;
        console.warn("Failed to search programs:", err);
      } finally {
        if (active) setLoading(false);
      }
    }

    void searchPageOne();
    return () => {
      active = false;
    };
  }, [trimmedQuery, filters, fetchOpts, isSearchOrFilterActive]);

  // Load more fetches page + 1 and appends to existing programs
  const handleLoadMore = useCallback(async () => {
    if (loading || !hasMore) return;
    const nextPage = page + 1;
    setLoading(true);
    try {
      const queryObj: ProgramSearchQuery = {
        q: trimmedQuery || undefined,
        tag: filters.tags.length > 0 ? filters.tags : undefined,
        level: filters.level || undefined,
        days: filters.days,
        minWeeks: filters.minWeeks,
        maxWeeks: filters.maxWeeks,
        page: nextPage,
      };
      const url = buildProgramSearchUrl(queryObj);
      const res = await apiFetch(url, ProgramSearchResponseSchema, fetchOpts);
      const mapped = (res.programs ?? []).map(toProgramSummary);
      setPrograms((prev) => [...prev, ...mapped]);
      setPage(nextPage);
      setHasMore(Boolean(res.pagination?.hasMore));
      if (res.availableTags && res.availableTags.length > 0) {
        setAvailableTags(res.availableTags);
      }
    } catch (err) {
      console.warn("Failed to load more programs:", err);
    } finally {
      setLoading(false);
    }
  }, [loading, hasMore, page, trimmedQuery, filters, fetchOpts]);

  const displayedResults = isSearchOrFilterActive ? programs : [];
  const displayedHasMore = isSearchOrFilterActive && hasMore;

  return (
    <SafeAreaView
      edges={["top", "bottom"]}
      style={{ flex: 1, backgroundColor: colors.background }}
      testID="programming-search-route"
    >
      <ScrollView
        contentContainerStyle={{ padding: 16 }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={{ marginBottom: 12 }}>
          <Text className="text-foreground text-2xl font-bold">Search</Text>
        </View>
        <ProgramsSearch
          debounceMs={SEARCH_DEBOUNCE_MS}
          onSearch={setQuery}
          results={displayedResults}
          availableTags={availableTags}
          filters={filters}
          onFiltersChange={setFilters}
          hasMore={displayedHasMore}
          onLoadMore={handleLoadMore}
          serverPaging={true}
          onItemPress={(id) => router.push(`/(tabs)/programming/${id}`)}
        />
      </ScrollView>
    </SafeAreaView>
  );
}
