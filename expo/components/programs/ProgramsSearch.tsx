import { useEffect, useState } from "react";
import { View, Pressable } from "react-native";
import { Filter } from "lucide-react-native";
import { Text } from "@/components/Text";
import { Input } from "@/components/Input";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";
import { ProgramsList, type ProgramSummary } from "./ProgramsList";
import {
  ProgramFilters,
  type ProgramSearchFiltersState,
  countActiveFilters,
  hasActiveFilters,
} from "./ProgramFilters";
import { useDebouncedValue } from "@/lib/programs/useDebouncedValue";

export interface ProgramsSearchProps {
  /** Fires after debounceMs of inactivity. */
  onSearch: (query: string) => void;
  results: ProgramSummary[];
  debounceMs?: number;
  onItemPress?: (id: string) => void;
  setTimeoutImpl?: typeof setTimeout;
  clearTimeoutImpl?: typeof clearTimeout;
  testID?: string;

  // Filters & server pagination
  availableTags?: string[];
  filters?: ProgramSearchFiltersState;
  onFiltersChange?: (filters: ProgramSearchFiltersState) => void;
  hasMore?: boolean;
  onLoadMore?: () => void;
  serverPaging?: boolean;
}

const DEFAULT_DEBOUNCE_MS = 300;

const DEFAULT_FILTERS: ProgramSearchFiltersState = {
  tags: [],
  level: undefined,
  days: undefined,
  minWeeks: undefined,
  maxWeeks: undefined,
};

export function ProgramsSearch({
  onSearch,
  results,
  debounceMs = DEFAULT_DEBOUNCE_MS,
  onItemPress,
  setTimeoutImpl,
  clearTimeoutImpl,
  testID = "programs-search",
  availableTags = [],
  filters,
  onFiltersChange,
  hasMore = false,
  onLoadMore,
  serverPaging = true,
}: ProgramsSearchProps) {
  const { colors } = useThemeTokens();
  const [query, setQuery] = useState<string>("");
  const [showFilters, setShowFilters] = useState<boolean>(false);
  const [internalFilters, setInternalFilters] =
    useState<ProgramSearchFiltersState>(DEFAULT_FILTERS);

  const activeFilters = filters ?? internalFilters;

  const debounced = useDebouncedValue(
    query,
    debounceMs,
    setTimeoutImpl,
    clearTimeoutImpl,
  );

  useEffect(() => {
    onSearch(debounced);
    // onSearch identity is caller-owned; only re-fire when the debounced
    // value changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  const handleFiltersChange = (newFilters: ProgramSearchFiltersState) => {
    if (onFiltersChange) {
      onFiltersChange(newFilters);
    } else {
      setInternalFilters(newFilters);
    }
  };

  const handleClearFilters = () => {
    handleFiltersChange(DEFAULT_FILTERS);
  };

  const filterCount = countActiveFilters(activeFilters, query);
  const isFilterActive = hasActiveFilters(activeFilters) || Boolean(query.trim());

  return (
    <View testID={testID}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 10,
        }}
      >
        <Text className="text-foreground text-lg font-bold">
          {isFilterActive ? "Search Results" : "Search"}
        </Text>
        <Pressable
          testID={`${testID}-filter-toggle`}
          accessibilityRole="button"
          accessibilityLabel="Toggle filters"
          onPress={() => setShowFilters((prev) => !prev)}
          className={`flex-row items-center gap-1.5 px-3 py-1.5 rounded-lg ${
            showFilters || isFilterActive ? "bg-success/15" : "bg-muted"
          }`}
        >
          <Filter
            size={16}
            color={
              showFilters || isFilterActive
                ? colors.success
                : colors["muted-foreground"]
            }
          />
          <Text
            className={`text-sm font-medium ${
              showFilters || isFilterActive
                ? "text-success"
                : "text-muted-foreground"
            }`}
          >
            Filters
            {filterCount > 0 ? ` (${filterCount})` : ""}
          </Text>
        </Pressable>
      </View>

      <Input
        testID={`${testID}-input`}
        label="Search programs"
        placeholder="Strength, hypertrophy…"
        value={query}
        onChangeText={setQuery}
      />
      <View style={{ height: 12 }} />

      {showFilters ? (
        <ProgramFilters
          testID={`${testID}-filter`}
          availableTags={availableTags}
          filters={activeFilters}
          onChange={handleFiltersChange}
          onClear={handleClearFilters}
        />
      ) : null}

      <ProgramsList
        testID={`${testID}-results`}
        programs={results}
        serverPaging={serverPaging}
        hasMore={hasMore}
        onLoadMore={onLoadMore}
        onItemPress={onItemPress}
      />
    </View>
  );
}
