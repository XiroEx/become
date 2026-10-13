import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, View } from "react-native";
import { Search, X } from "lucide-react-native";
import type { z } from "zod";
import {
  apiFetch,
  CustomExercisesResponseSchema,
  ExerciseSearchResponseSchema,
  type CustomExercise,
  type CustomExercisesResponse,
  type ExerciseSearchResponse,
  type ExerciseSearchResult,
} from "@become/api-client";
import { Text } from "@/components/Text";
import { Input } from "@/components/Input";
import { useAuth } from "@/lib/auth/useAuth";
import { WEBAPP_BASE_URL } from "@/lib/config";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";
import { minTouchTarget } from "@/lib/a11y/touchTarget";
import { useDebouncedValue } from "@/lib/programs/useDebouncedValue";

/**
 * One row the picker can hand back. Catalogue and custom alike: the caller
 * writes `exerciseSlug` (the rule that travels with this card — a typed name
 * hydrates to nothing, resolves to no PR and plays no demo), plus the display
 * name so the row reads before the hydrate lands.
 */
export interface ExercisePickerSelection {
  exerciseSlug: string;
  name: string;
  isCustom: boolean;
}

export interface ExercisePickerProps {
  /** Slugs already in this workout — picked rows are hidden, not disabled. */
  excludeSlugs?: readonly string[];
  /**
   * The search box opens on this (NP-281's Quick Add chips: "+ Bench Press"
   * opens the picker already searching for Bench Press, so the row that lands
   * still carries a catalogue `exerciseSlug` rather than a typed name).
   */
  initialQuery?: string;
  onSelect: (selection: ExercisePickerSelection) => void;
  onClose: () => void;
  testID?: string;
}

function customToResult(exercise: CustomExercise): ExerciseSearchResult {
  return {
    slug: exercise.slug,
    name: exercise.name,
    trackingType: exercise.trackingType,
    category: exercise.category,
    equipment: exercise.equipment,
    primaryMuscles: exercise.primaryMuscles,
    difficulty: exercise.difficulty,
    isCustom: true,
  } as ExerciseSearchResult;
}

void customToResult;

const EMPTY_RESULTS: ExerciseSearchResult[] = [];

/**
 * THE EXERCISE PICKER (NP-171).
 *
 * Native counterpart of the autocomplete inside
 * `webapp/app/dashboard/admin/programs/_editors/ExerciseEditor.tsx`: the same
 * two sources — `GET /api/exercises/search` for the catalogue and
 * `GET /api/exercises/custom` for the member's own exercises — merged the same
 * way (custom matches first, catalogue rows a custom already covers dropped).
 *
 * The web fires its search 200ms after the name stops changing and only for
 * two or more characters; this picker debounces the same way and reads the
 * same empty-list-means-no-matches contract (the route answers 200 with `[]`
 * for a short query and for its own internal errors).
 */
export function ExercisePicker({
  excludeSlugs = [],
  initialQuery = "",
  onSelect,
  onClose,
  testID = "exercise-picker",
}: ExercisePickerProps) {
  const { colors } = useThemeTokens();
  const { token } = useAuth();
  // Seeded once, from the prop: the picker is mounted fresh per opening (the
  // caller unmounts it on select/close), so a later prop change is not a
  // thing that happens.
  const [query, setQuery] = useState(initialQuery);
  const [customExercises, setCustomExercises] = useState<CustomExercise[]>([]);
  const [customFailed, setCustomFailed] = useState(false);
  const [results, setResults] = useState<ExerciseSearchResult[]>([]);
  const debouncedQuery = useDebouncedValue(query, 200);
  const searchSeqRef = useRef(0);

  // The member's own exercises, once per opening — the list is small and the
  // web reads it unfiltered then matches client-side too. The fetch is a sync
  // from outside React (the network), so the state write lives in its
  // callback rather than the effect body.
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const data = await apiFetch<z.infer<typeof CustomExercisesResponseSchema>>(
          "/api/exercises/custom",
          CustomExercisesResponseSchema,
          { baseUrl: WEBAPP_BASE_URL, getToken: () => token ?? undefined },
        );
        if (!active) return;
        const list = ((data as CustomExercisesResponse | null)?.exercises ??
          []) as CustomExercise[];
        setCustomExercises(list);
        setCustomFailed(false);
      } catch {
        if (!active) return;
        setCustomExercises([]);
        setCustomFailed(true);
      }
    })();
    return () => {
      active = false;
    };
  }, [token]);

  // Catalogue search, debounced, two characters or more. Same shape: the
  // effect only subscribes (request per debounced query); every setState runs
  // in the request callback. A short query clears the catalogue rows — during
  // render, where the value is derived, not in an effect.
  const catalogResults =
    debouncedQuery.trim().length >= 2 ? results : EMPTY_RESULTS;
  useEffect(() => {
    const queryText = debouncedQuery.trim();
    if (queryText.length < 2) return;
    const seq = searchSeqRef.current + 1;
    searchSeqRef.current = seq;
    let active = true;
    void (async () => {
      try {
        const data = await apiFetch<z.infer<typeof ExerciseSearchResponseSchema>>(
          `/api/exercises/search?q=${encodeURIComponent(queryText)}&limit=8`,
          ExerciseSearchResponseSchema,
          { baseUrl: WEBAPP_BASE_URL, getToken: () => token ?? undefined },
        );
        if (!active || searchSeqRef.current !== seq) return;
        const list = ((data as ExerciseSearchResponse | null)?.exercises ??
          []) as ExerciseSearchResult[];
        setResults(list);
      } catch {
        if (active && searchSeqRef.current === seq) setResults([]);
      }
    })();
    return () => {
      active = false;
    };
  }, [debouncedQuery, token]);

  const excluded = new Set(excludeSlugs.filter(Boolean));
  const q = debouncedQuery.trim().toLowerCase();
  const queryTrimmed = query.trim();
  // A search is in flight while the debounced query is ahead of the answered
  // one — derived during render, not synced in an effect.
  const searching = queryTrimmed.length >= 2 && queryTrimmed !== debouncedQuery;

  // Custom matches first (the web's order), catalogue rows a custom already
  // covers dropped (the web's dedupe), everything already in the workout
  // hidden, capped at eight rows like the web's suggestion list.
  const customMatches = customExercises
    .filter((exercise) =>
      q.length >= 2 ? exercise.name.toLowerCase().includes(q) : true,
    )
    .filter((exercise) => !excluded.has(exercise.slug))
    .slice(0, 8);
  const customSlugs = new Set(customMatches.map((exercise) => exercise.slug));
  const catalogMatches = catalogResults
    .filter((hit) => !customSlugs.has(hit.slug))
    .filter((hit) => !excluded.has(hit.slug))
    .slice(0, Math.max(0, 8 - customMatches.length));

  const pick = useCallback(
    (slug: string, name: string, isCustom: boolean) => {
      onSelect({ exerciseSlug: slug, name, isCustom });
    },
    [onSelect],
  );

  return (
    <View testID={testID} style={{ gap: 12 }}>
      <View
        style={{ flexDirection: "row", alignItems: "center", gap: 8 }}
      >
        <View style={{ flex: 1 }}>
          <Input
            testID={`${testID}-search`}
            label="Find an exercise"
            placeholder="e.g. Bench Press"
            value={query}
            onChangeText={setQuery}
            autoCapitalize="none"
            autoCorrect={false}
            accessibilityHint="Type at least two characters to search the catalogue and your custom exercises"
          />
        </View>
        <Pressable
          testID={`${testID}-close`}
          accessibilityRole="button"
          accessibilityLabel="Close exercise picker"
          onPress={onClose}
          style={[
            minTouchTarget,
            {
              alignItems: "center",
              justifyContent: "center",
              borderRadius: 12,
              backgroundColor: colors.muted,
            },
          ]}
        >
          <X size={18} color={colors["muted-foreground"]} />
        </Pressable>
      </View>

      {searching ? (
        <Text
          testID={`${testID}-searching`}
          className="text-muted-foreground text-xs"
        >
          Searching…
        </Text>
      ) : null}

      {customFailed && customMatches.length === 0 && catalogMatches.length === 0 && q.length >= 2 ? (
        <Text
          testID={`${testID}-custom-error`}
          className="text-muted-foreground text-xs"
        >
          Your custom exercises could not be loaded — catalogue results below.
        </Text>
      ) : null}

      {!searching &&
      q.length >= 2 &&
      customMatches.length === 0 &&
      catalogMatches.length === 0 ? (
        <Text testID={`${testID}-empty`} className="text-muted-foreground text-sm">
          No matches. Try another name, or create it as a custom exercise in My
          exercises.
        </Text>
      ) : null}

      {customMatches.length > 0 ? (
        <View style={{ gap: 4 }}>
          <Text className="text-muted-foreground text-xs font-semibold">
            Your exercises
          </Text>
          {customMatches.map((exercise) => (
            <Pressable
              key={`custom-${exercise.slug}`}
              testID={`${testID}-custom-${exercise.slug}`}
              accessibilityRole="button"
              accessibilityLabel={`Add ${exercise.name}, your custom exercise`}
              onPress={() => pick(exercise.slug, exercise.name, true)}
              style={[
                minTouchTarget,
                {
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 8,
                  paddingHorizontal: 12,
                  borderRadius: 12,
                  backgroundColor: colors.muted,
                },
              ]}
            >
              <Text className="text-foreground text-sm font-medium">
                {exercise.name}
              </Text>
              <Text className="text-muted-foreground text-xs">★ Custom</Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      {catalogMatches.length > 0 ? (
        <View style={{ gap: 4 }}>
          <Text className="text-muted-foreground text-xs font-semibold">
            Catalogue
          </Text>
          {catalogMatches.map((hit) => (
            <Pressable
              key={`catalog-${hit.slug}`}
              testID={`${testID}-result-${hit.slug}`}
              accessibilityRole="button"
              accessibilityLabel={`Add ${hit.name}`}
              onPress={() => pick(hit.slug, hit.name, hit.isCustom ?? false)}
              style={[
                minTouchTarget,
                {
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 8,
                  paddingHorizontal: 12,
                  borderRadius: 12,
                  backgroundColor: colors.card,
                  borderWidth: 1,
                  borderColor: colors.border,
                },
              ]}
            >
              <Text className="text-foreground text-sm font-medium">
                {hit.name}
              </Text>
              <Text className="text-muted-foreground text-xs">
                {hit.isCustom
                  ? "★ Custom"
                  : (hit.trackingType ?? "").replace(/_/g, " ")}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      {q.length < 2 && customMatches.length === 0 ? (
        <View
          style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
        >
          <Search size={14} color={colors["muted-foreground"]} />
          <Text className="text-muted-foreground text-xs">
            Type to search the catalogue, or pick one of your exercises above.
          </Text>
        </View>
      ) : null}

      {/* Kept out of the layout: a hook for tests counting loaded customs. */}
      <View
        testID={`${testID}-custom-count`}
        collapsable={false}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <Text className="text-muted-foreground text-xs" style={{ display: "none" }}>
          {`${customExercises.length} custom loaded`}
        </Text>
      </View>
    </View>
  );
}

export default ExercisePicker;
