import React from "react";
import { View, Pressable } from "react-native";
import { Text } from "@/components/Text";
import { Input } from "@/components/Input";
import { BROWSE_LEVELS } from "@/lib/programs/levels";
import type { ProgramSearchQuery } from "@become/api-client";

export interface ProgramSearchFiltersState {
  tags: string[];
  level?: string;
  days?: number;
  minWeeks?: number;
  maxWeeks?: number;
}

export const DAYS_OPTIONS = [1, 2, 3, 4, 5, 6, 7] as const;

export interface ProgramFiltersProps {
  availableTags?: string[];
  filters: ProgramSearchFiltersState;
  onChange: (filters: ProgramSearchFiltersState) => void;
  onClear: () => void;
  testID?: string;
}

/**
 * Builds a query string adhering to ProgramSearchQuerySchema.
 * Multi-value tag is repeated (tag=A&tag=B).
 * Level, days, minWeeks, and maxWeeks use schema names and are omitted when unset.
 * Page is omitted when 1.
 */
export function buildProgramSearchUrl(query: ProgramSearchQuery): string {
  const params = new URLSearchParams();

  const trimmedQ = query.q?.trim();
  if (trimmedQ) {
    params.set("q", trimmedQ);
  }

  if (query.tag && query.tag.length > 0) {
    for (const t of query.tag) {
      const clean = t.trim();
      if (clean) {
        params.append("tag", clean);
      }
    }
  }

  if (query.level && query.level.trim()) {
    params.set("level", query.level.trim());
  }

  if (
    typeof query.days === "number" &&
    !Number.isNaN(query.days) &&
    query.days >= 1 &&
    query.days <= 7
  ) {
    params.set("days", String(query.days));
  }

  if (
    typeof query.minWeeks === "number" &&
    !Number.isNaN(query.minWeeks) &&
    query.minWeeks >= 0
  ) {
    params.set("minWeeks", String(query.minWeeks));
  }

  if (
    typeof query.maxWeeks === "number" &&
    !Number.isNaN(query.maxWeeks) &&
    query.maxWeeks >= 0
  ) {
    params.set("maxWeeks", String(query.maxWeeks));
  }

  if (typeof query.page === "number" && query.page > 1) {
    params.set("page", String(query.page));
  }

  if (typeof query.limit === "number" && !Number.isNaN(query.limit)) {
    params.set("limit", String(query.limit));
  }

  const qs = params.toString();
  return qs ? `/api/programs/search?${qs}` : "/api/programs/search";
}

export function hasActiveFilters(filters: ProgramSearchFiltersState): boolean {
  return (
    filters.tags.length > 0 ||
    Boolean(filters.level) ||
    filters.days !== undefined ||
    filters.minWeeks !== undefined ||
    filters.maxWeeks !== undefined
  );
}

export function countActiveFilters(
  filters: ProgramSearchFiltersState,
  query?: string,
): number {
  return (
    (query?.trim() ? 1 : 0) +
    filters.tags.length +
    (filters.level ? 1 : 0) +
    (filters.days !== undefined ? 1 : 0) +
    (filters.minWeeks !== undefined ? 1 : 0) +
    (filters.maxWeeks !== undefined ? 1 : 0)
  );
}

/**
 * Filter panel for program search, matching the layout and wording of the web
 * Programs browse filter panel in webapp/app/dashboard/workout/WorkoutClient.tsx.
 */
export function ProgramFilters({
  availableTags = [],
  filters,
  onChange,
  onClear,
  testID = "program-filters",
}: ProgramFiltersProps) {
  const isFilterActive = hasActiveFilters(filters);

  const toggleTag = (tag: string) => {
    const isSelected = filters.tags.includes(tag);
    const nextTags = isSelected
      ? filters.tags.filter((t) => t !== tag)
      : [...filters.tags, tag];
    onChange({ ...filters, tags: nextTags });
  };

  const selectLevel = (level: string) => {
    const nextLevel = filters.level === level ? undefined : level;
    onChange({ ...filters, level: nextLevel });
  };

  const selectDays = (days: number) => {
    const nextDays = filters.days === days ? undefined : days;
    onChange({ ...filters, days: nextDays });
  };

  const changeMinWeeks = (val: string) => {
    const trimmed = val.trim();
    if (!trimmed) {
      onChange({ ...filters, minWeeks: undefined });
      return;
    }
    const n = parseInt(trimmed, 10);
    if (!Number.isNaN(n) && n >= 0) {
      onChange({ ...filters, minWeeks: n });
    }
  };

  const changeMaxWeeks = (val: string) => {
    const trimmed = val.trim();
    if (!trimmed) {
      onChange({ ...filters, maxWeeks: undefined });
      return;
    }
    const n = parseInt(trimmed, 10);
    if (!Number.isNaN(n) && n >= 0) {
      onChange({ ...filters, maxWeeks: n });
    }
  };

  return (
    <View
      testID={`${testID}-panel`}
      className="p-4 rounded-xl border border-border bg-card mb-4"
      style={{ gap: 12 }}
    >
      {/* Tags section — built from availableTags returned by server */}
      {availableTags.length > 0 ? (
        <View testID={`${testID}-tags-section`}>
          <Text className="text-muted-foreground text-xs uppercase font-medium tracking-wide mb-2">
            Tags
          </Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
            {availableTags.map((tag) => {
              const isSelected = filters.tags.includes(tag);
              return (
                <Pressable
                  key={tag}
                  testID={`${testID}-tag-${tag}`}
                  accessibilityRole="button"
                  accessibilityLabel={`Filter by tag ${tag}`}
                  onPress={() => toggleTag(tag)}
                  className={`px-3 py-1 rounded-full ${
                    isSelected
                      ? "bg-success"
                      : "bg-background border border-border"
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

      {/* Experience Level section */}
      <View testID={`${testID}-level-section`}>
        <Text className="text-muted-foreground text-xs uppercase font-medium tracking-wide mb-2">
          Experience Level
        </Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
          {BROWSE_LEVELS.map((level) => {
            const isSelected = filters.level === level;
            return (
              <Pressable
                key={level}
                testID={`${testID}-level-${level}`}
                accessibilityRole="button"
                accessibilityLabel={`Filter by level ${level}`}
                onPress={() => selectLevel(level)}
                className={`px-3 py-1 rounded-full ${
                  isSelected
                    ? "bg-success"
                    : "bg-background border border-border"
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

      {/* Days per week section */}
      <View testID={`${testID}-days-section`}>
        <Text className="text-muted-foreground text-xs uppercase font-medium tracking-wide mb-2">
          Days per week
        </Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
          {DAYS_OPTIONS.map((days) => {
            const isSelected = filters.days === days;
            return (
              <Pressable
                key={days}
                testID={`${testID}-days-${days}`}
                accessibilityRole="button"
                accessibilityLabel={`Filter by ${days} days per week`}
                onPress={() => selectDays(days)}
                className={`px-3 py-1 rounded-full ${
                  isSelected
                    ? "bg-success"
                    : "bg-background border border-border"
                }`}
              >
                <Text
                  className={`text-sm font-medium ${
                    isSelected
                      ? "text-primary-foreground font-semibold"
                      : "text-foreground"
                  }`}
                >
                  {days} {days === 1 ? "day" : "days"}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* Duration (Weeks) section */}
      <View testID={`${testID}-weeks-section`}>
        <Text className="text-muted-foreground text-xs uppercase font-medium tracking-wide mb-2">
          Duration (Weeks)
        </Text>
        <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}>
          <View style={{ flex: 1 }}>
            <Input
              testID={`${testID}-min-weeks`}
              placeholder="Min weeks"
              accessibilityLabel="Minimum weeks"
              keyboardType="numeric"
              value={
                filters.minWeeks !== undefined ? String(filters.minWeeks) : ""
              }
              onChangeText={changeMinWeeks}
            />
          </View>
          <Text className="text-muted-foreground text-sm font-medium">to</Text>
          <View style={{ flex: 1 }}>
            <Input
              testID={`${testID}-max-weeks`}
              placeholder="Max weeks"
              accessibilityLabel="Maximum weeks"
              keyboardType="numeric"
              value={
                filters.maxWeeks !== undefined ? String(filters.maxWeeks) : ""
              }
              onChangeText={changeMaxWeeks}
            />
          </View>
        </View>
      </View>

      {/* Clear all filters */}
      {isFilterActive ? (
        <Pressable
          testID={`${testID}-clear`}
          accessibilityRole="button"
          accessibilityLabel="Clear all filters"
          onPress={onClear}
        >
          <Text className="text-destructive text-sm font-medium">
            Clear all filters
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}
