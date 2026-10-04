/**
 * ─── BUILD A SESSION BY HAND (NP-137) ───────────────────────────────────────
 *
 * Native port of `webapp/components/SessionBuilder.tsx` WITHOUT inline
 * custom-exercise creation (that waits for NP-169 — the "Create … as a new
 * exercise" row is not rendered and `POST /api/exercises/custom` is never
 * called from here).
 *
 * What the builder does, in web order:
 *   • name it (the title input; `titleWasEdited` decides `needsName` on
 *     start, exactly as the web's `hasChosenName` does),
 *   • search the catalogue (`GET /api/exercises/search?q&limit=8`) plus the
 *     member's custom exercises (`GET /api/exercises/custom`, matched
 *     client-side and merged custom-first with catalogue dedupe),
 *   • add exercises with a sets stepper (1–8, the web's clamp),
 *   • superset an exercise with the one under it (or break the group apart),
 *   • ask the app to complete it: one-tap complements (`mode: 'suggest'`,
 *     debounced off the draft) and "Finish this for me" (`mode: 'finish'`),
 *     both through `POST /api/generate/session/complete`,
 *   • then start it (stash + live href), or log it for a past day / plan it
 *     for a future one (`POST /api/workouts { kind: 'quick', performedAt }`,
 *     the copied `buildLoggedExercises` + `fallbackQuickSessionName` from
 *     `@become/core`).
 *
 * RULES THAT TRAVEL:
 *   • `/api/generate/*` is never metered — no allowance line, no gate check,
 *     no upgrade sheet on the suggest/finish calls. A 403 there without
 *     `feature` and `requiresTier` is an ordinary error, never the sheet.
 *   • A past date logs the session as done and a future date plans it
 *     (`date <= today` → done, the web's `logQuickSession` rule).
 *   • The naming prompt uses the web's fallback name for that day
 *     (`fallbackQuickSessionName(logDate)`).
 *   • A superset of one is not a superset — removing the last partner strips
 *     the group fields off the survivor.
 *
 * The screen stays thin: the draft (title + chosen rows + suggestions) lives
 * here, the network calls live in `@/lib/quickSession/completeSession`, and
 * the log-or-plan POST lives in `@/lib/quickSession/logQuickSession`.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  Check,
  Dumbbell,
  Layers,
  Plus,
  Sparkles,
  Trash2,
  Unlink,
} from "lucide-react-native";
import type { z } from "zod";
import { apiFetch } from "@become/api-client";
import {
  CustomExercisesResponseSchema,
  ExerciseSearchResponseSchema,
} from "@become/api-client";
import type {
  ComplementSuggestion,
  CustomExercise,
  CustomExercisesResponse,
  ExerciseSearchResponse,
  ExerciseSearchResult,
} from "@become/api-client";
import {
  fallbackQuickSessionName,
  groupIndexes,
  implementLabel,
  localDateStr,
  setUnitLabel,
  ungroupAt,
  type DraftExercise,
} from "@become/core";
import { Text } from "@/components/Text";
import { Input } from "@/components/Input";
import { DatePicker } from "@/components/programs/DatePicker";
import { QuickSessionNamePrompt } from "@/components/workout/QuickSessionNamePrompt";
import { WEBAPP_BASE_URL } from "@/lib/config";
import { useAuth } from "@/lib/auth/useAuth";
import { useThemeTokens } from "@/lib/theme/useThemeTokens";
import { minTouchTarget } from "@/lib/a11y/touchTarget";
import { routeApiError } from "@/lib/errors";
import { useRouter } from "expo-router";
import { useDebouncedValue } from "@/lib/programs/useDebouncedValue";
import {
  completeSessionFinish,
  completeSessionSuggest,
  logQuickSession,
} from "@/lib/quickSession/logQuickSession";
import {
  quickSessionLiveHref,
  quickSessionOverviewHref,
  stashQuickSession,
} from "@/lib/quickSession/store";

export interface SessionBuilderExercise extends ExerciseSearchResult {
  isCustom: boolean;
}

export interface SessionBuilderProps {
  /** Fired right before navigating away (e.g. close a sheet). */
  onLaunch?: () => void;
  testID?: string;
}

function toDraftExercise(r: {
  slug: string;
  name: string;
  trackingType?: string;
  equipment?: string[];
  laterality?: string;
  movementPatterns?: string[];
}): DraftExercise {
  const trackingType = r.trackingType ?? "reps_weight";
  const isTime = trackingType.startsWith("time");
  return {
    exerciseSlug: r.slug,
    name: r.name,
    trackingType,
    sets: 3,
    reps: isTime ? "" : "8-12",
    ...(isTime ? { duration: "30" } : {}),
    ...(r.equipment ? { equipment: r.equipment } : {}),
    ...(r.laterality ? { laterality: r.laterality } : {}),
    ...(r.movementPatterns ? { movementPatterns: r.movementPatterns } : {}),
  };
}

function stripGroup(ex: DraftExercise): DraftExercise {
  const next = { ...ex };
  delete next.groupId;
  delete next.groupType;
  delete next.groupLabel;
  delete next.groupRest;
  delete next.groupRounds;
  return next;
}

export function SessionBuilder({
  onLaunch,
  testID = "session-builder",
}: SessionBuilderProps) {
  const { colors } = useThemeTokens();
  const { token } = useAuth();
  const router = useRouter();
  const fetchOpts = useMemo(
    () => ({
      baseUrl: WEBAPP_BASE_URL,
      getToken: () => token ?? undefined,
    }),
    [token],
  );

  const [title, setTitle] = useState("Quick Session");
  const [titleWasEdited, setTitleWasEdited] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ExerciseSearchResult[]>([]);
  const [customs, setCustoms] = useState<CustomExercise[]>([]);
  const [chosen, setChosen] = useState<DraftExercise[]>([]);
  // Log-or-plan (no playthrough): past/today date → logged done, future → planned.
  const [logOpen, setLogOpen] = useState(false);
  const [logDate, setLogDate] = useState(localDateStr());
  const [logging, setLogging] = useState(false);
  const [logError, setLogError] = useState<string | null>(null);
  const [showNamePrompt, setShowNamePrompt] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [suggestions, setSuggestions] = useState<ComplementSuggestion[]>([]);
  const [completionError, setCompletionError] = useState<string | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);

  const todayStr = localDateStr();
  const isFutureDate = logDate > todayStr;
  const hasChosenName = titleWasEdited && !!title.trim();

  const handleFailure = useCallback((err: unknown): string => {
    const { handled, message } = routeApiError(err, {});
    return handled ? "Something went wrong. Please try again." : message;
  }, []);

  // The member's custom exercises, once per mount — the list is small and the
  // web reads it unfiltered then matches client-side too.
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
        setCustoms(((data as CustomExercisesResponse | null)?.exercises ?? []) as CustomExercise[]);
      } catch {
        // Customs stay empty — the catalogue search still works.
        if (active) setCustoms([]);
      }
    })();
    return () => {
      active = false;
    };
  }, [token]);

  // Debounced catalogue search — two characters or more, limit 8, the web's
  // contract (the route answers 200 with `[]` for a short query and for its
  // own internal errors, so an empty list never means "the search failed").
  const debouncedQuery = useDebouncedValue(query, 250);
  const searchSeqRef = useRef(0);
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
        setResults((((data as ExerciseSearchResponse | null)?.exercises ?? []) as ExerciseSearchResult[]));
        setSearchError(null);
      } catch (err) {
        if (active && searchSeqRef.current === seq) {
          setResults([]);
          if (err instanceof Error && err.name === "AbortError") return;
          setSearchError(null);
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [debouncedQuery, token]);

  // One-tap complements for the current draft (`mode: 'suggest'`), debounced
  // off the draft. Kept separate from search so an empty draft never calls
  // the completion endpoint, and a stale response never replaces newer pills
  // (the sequence guard drops it). Never metered — see the module docblock.
  // The empty-draft clear below syncs from the draft (React state), so it is
  // derived during render, not in this effect.
  const suggestSeqRef = useRef(0);
  const chosenSlugsKey = useMemo(
    () => chosen.map((e) => e.exerciseSlug).join(","),
    [chosen],
  );
  const hasDraft = chosen.length > 0;
  const emptySuggestions: ComplementSuggestion[] = useMemo(() => [], []);
  const visibleSuggestions = hasDraft ? suggestions : emptySuggestions;
  useEffect(() => {
    if (!hasDraft) return;
    const seq = suggestSeqRef.current + 1;
    suggestSeqRef.current = seq;
    const timer = setTimeout(() => {
      void (async () => {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- sync from outside React (network) after debounce
        setSuggesting(true);
        try {
          const data = await completeSessionSuggest(
            { exercises: chosen, suggestionCount: 3 },
            fetchOpts,
          );
          if (suggestSeqRef.current !== seq) return;
          const chosenSlugs = new Set(chosen.map((e) => e.exerciseSlug));
          setSuggestions(
            (data.suggestions ?? [])
              .filter(
                ({ exercise }: { exercise: { exerciseSlug: string } }) =>
                  !chosenSlugs.has(exercise.exerciseSlug),
              )
              .slice(0, 3),
          );
          setCompletionError(null);
        } catch (err) {
          if (suggestSeqRef.current !== seq) return;
          setSuggestions([]);
          setCompletionError(handleFailure(err));
        } finally {
          if (suggestSeqRef.current === seq) setSuggesting(false);
        }
      })();
    }, 250);
    return () => clearTimeout(timer);
    // `chosenSlugsKey` re-fires the effect when the draft's membership
    // changes; `chosen` itself is read fresh inside the request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chosenSlugsKey]);

  const addExercise = useCallback(
    (r: { slug: string; name: string; trackingType?: string; equipment?: string[]; laterality?: string; movementPatterns?: string[] }) => {
      setChosen((prev) => {
        if (prev.some((e) => e.exerciseSlug === r.slug)) return prev;
        return [...prev, toDraftExercise(r)];
      });
      setQuery("");
      setResults([]);
    },
    [],
  );

  const removeExercise = useCallback((slug: string) => {
    setChosen((prev) => {
      const gone = prev.find((e) => e.exerciseSlug === slug);
      const next = prev.filter((e) => e.exerciseSlug !== slug);
      // A superset of one is not a superset.
      if (gone?.groupId && next.filter((e) => e.groupId === gone.groupId).length < 2) {
        return next.map((e) => (e.groupId === gone.groupId ? stripGroup(e) : e));
      }
      return next;
    });
  }, []);

  // Superset an exercise with the one under it, or break the group apart —
  // the same gesture the live and track views offer mid-session.
  const toggleGroup = useCallback((slug: string) => {
    setChosen((prev) => {
      const i = prev.findIndex((e) => e.exerciseSlug === slug);
      if (i === -1) return prev;
      if (prev[i]!.groupId) return ungroupAt(prev, i).exercises;
      if (i + 1 >= prev.length) return prev;
      return groupIndexes(prev, [i, i + 1], "superset").exercises;
    });
  }, []);

  const setSets = useCallback((slug: string, sets: number) => {
    const clamped = Math.max(1, Math.min(8, sets));
    setChosen((prev) =>
      prev.map((e) => (e.exerciseSlug === slug ? { ...e, sets: clamped } : e)),
    );
  }, []);

  const finish = useCallback(async () => {
    if (chosen.length === 0 || finishing) return;
    setFinishing(true);
    setCompletionError(null);
    try {
      const data = await completeSessionFinish({ exercises: chosen }, fetchOpts);
      const appended = (data.session?.exercises ?? []).filter(
        (exercise: { exerciseSlug: string }) =>
          !chosen.some((e) => e.exerciseSlug === exercise.exerciseSlug),
      );
      setChosen((current) => {
        const currentSlugs = new Set(current.map((e) => e.exerciseSlug));
        return [
          ...current,
          ...appended
            .filter(
              (exercise: { exerciseSlug: string }) =>
                !currentSlugs.has(exercise.exerciseSlug),
            )
            .map(
              (exercise: {
                exerciseSlug: string;
                name: string;
                trackingType: string;
                sets: number;
                reps: string;
                rest?: string;
                duration?: string;
                equipment?: string[];
                laterality?: string;
                movementPatterns?: string[];
              }) => ({
                exerciseSlug: exercise.exerciseSlug,
                name: exercise.name,
                trackingType: exercise.trackingType,
                sets: exercise.sets,
                reps: exercise.reps,
                ...(exercise.rest ? { rest: exercise.rest } : {}),
                ...(exercise.duration ? { duration: exercise.duration } : {}),
                ...(exercise.equipment ? { equipment: exercise.equipment } : {}),
                ...(exercise.laterality ? { laterality: exercise.laterality } : {}),
                ...(exercise.movementPatterns
                  ? { movementPatterns: exercise.movementPatterns }
                  : {}),
              }),
            ),
        ];
      });
    } catch (err) {
      setCompletionError(handleFailure(err));
    } finally {
      setFinishing(false);
    }
  }, [chosen, finishing, fetchOpts, handleFailure]);

  const start = useCallback(async () => {
    if (chosen.length === 0) return;
    const session = { title: title.trim() || "Quick Session", exercises: chosen };
    const id = await stashQuickSession(session, { needsName: !hasChosenName });
    onLaunch?.();
    router.push(quickSessionLiveHref(id) as never);
  }, [chosen, title, hasChosenName, onLaunch, router]);

  // Log (past/today) or plan (future) the built session without playing it —
  // the backfill path for "I worked out yesterday and never logged it". A
  // past date logs the session as done; a future date plans it.
  const saveLogOrPlan = useCallback(
    async (sessionTitle: string) => {
      if (chosen.length === 0 || logging) return;
      setLogging(true);
      setLogError(null);
      try {
        const session = { title: sessionTitle, exercises: chosen };
        // A future plan can still need its first-completion name. A past/today
        // log reaches that completion now, after the prompt if one was needed.
        const needsName = isFutureDate && !hasChosenName;
        const id = await stashQuickSession(session, { needsName });
        const { done } = await logQuickSession(
          { sessionId: id, title: session.title, needsName, exercises: chosen, date: logDate },
          fetchOpts,
        );
        onLaunch?.();
        router.push(
          (done
            ? quickSessionOverviewHref(id)
            : quickSessionOverviewHref(id, { saved: true })) as never,
        );
      } catch (e) {
        const message = e instanceof Error ? e.message : "Failed to save session";
        setLogError(message);
        throw new Error(message);
      } finally {
        setLogging(false);
      }
    },
    [chosen, logDate, logging, isFutureDate, hasChosenName, fetchOpts, onLaunch, router],
  );

  const logOrPlan = useCallback(() => {
    if (!isFutureDate && !hasChosenName) {
      setShowNamePrompt(true);
      return;
    }
    void saveLogOrPlan(title.trim() || "Quick Session").catch(() => {});
  }, [hasChosenName, isFutureDate, saveLogOrPlan, title]);

  // Search shows catalog matches + matching customs (deduped by slug,
  // customs first — the web's merge order).
  const q = query.trim().toLowerCase();
  const customMatches: SessionBuilderExercise[] =
    q.length >= 2
      ? customs
          .filter((c) => c.name.toLowerCase().includes(q))
          .map((c) => ({
            slug: c.slug,
            name: c.name,
            trackingType: c.trackingType ?? "reps_weight",
            category: c.category,
            equipment: c.equipment,
            primaryMuscles: c.primaryMuscles,
            difficulty: c.difficulty,
            isCustom: true,
          }) as SessionBuilderExercise)
      : [];
  const customSlugs = new Set(customMatches.map((c) => c.slug));
  const merged: SessionBuilderExercise[] = [
    ...customMatches,
    ...results
      .filter((r) => !customSlugs.has(r.slug))
      .map((r) => ({ ...r, isCustom: false })),
  ];
  const showResults = query.trim().length >= 2;
  const searching = showResults && query.trim() !== debouncedQuery.trim();

  return (
    <View testID={testID} style={{ gap: 12 }}>
      <Input
        testID={`${testID}-title`}
        label="Session name"
        placeholder="Session title"
        value={title}
        onChangeText={(text) => {
          setTitle(text);
          setTitleWasEdited(true);
        }}
        autoCapitalize="words"
      />

      <View>
        <Input
          testID={`${testID}-search`}
          label="Add an exercise"
          placeholder="Add an exercise…"
          value={query}
          onChangeText={setQuery}
          autoCapitalize="none"
          autoCorrect={false}
          accessibilityHint="Type at least two characters to search the catalogue and your custom exercises"
        />
        {searching ? (
          <Text testID={`${testID}-searching`} className="text-muted-foreground text-xs mt-1">
            Searching…
          </Text>
        ) : null}
        {searchError ? (
          <Text testID={`${testID}-search-error`} className="text-destructive text-xs mt-1">
            {searchError}
          </Text>
        ) : null}
        {showResults && !searching ? (
          <View
            testID={`${testID}-results`}
            style={{
              marginTop: 8,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.card,
              overflow: "hidden",
            }}
          >
            {merged.length === 0 ? (
              <Text className="text-muted-foreground text-sm" style={{ padding: 12 }}>
                No matches. Try another name.
              </Text>
            ) : (
              merged.map((r) => {
                const already = chosen.some((e) => e.exerciseSlug === r.slug);
                return (
                  <Pressable
                    key={r.slug}
                    testID={`${testID}-result-${r.slug}`}
                    accessibilityRole="button"
                    accessibilityLabel={`Add ${r.name}`}
                    disabled={already}
                    onPress={() => addExercise(r)}
                    style={{ padding: 12, opacity: already ? 0.4 : 1, ...minTouchTarget }}
                  >
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text className="text-foreground text-sm font-medium" numberOfLines={1}>
                          {r.name}
                          {r.isCustom ? " · Custom" : ""}
                        </Text>
                        <Text className="text-muted-foreground text-xs">
                          {[implementLabel(r.equipment), (r.trackingType ?? "").replace(/_/g, " ")]
                            .filter(Boolean)
                            .join(" · ")}
                        </Text>
                      </View>
                      <Plus size={16} color={colors.primary} strokeWidth={2} />
                    </View>
                  </Pressable>
                );
              })
            )}
          </View>
        ) : null}
      </View>

      {chosen.length === 0 ? (
        <View
          testID={`${testID}-empty`}
          style={{
            borderRadius: 12,
            borderWidth: 1,
            borderColor: colors.border,
            borderStyle: "dashed",
            padding: 24,
            alignItems: "center",
          }}
        >
          <Text className="text-muted-foreground text-xs">Search above to add exercises</Text>
        </View>
      ) : (
        <View testID={`${testID}-chosen`} style={{ gap: 6 }}>
          {chosen.map((ex) => (
            <View
              key={ex.exerciseSlug}
              testID={`${testID}-chosen-${ex.exerciseSlug}`}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 8,
                padding: 12,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: colors.card,
              }}
            >
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text className="text-foreground text-sm font-medium" numberOfLines={1}>
                  {ex.name}
                </Text>
                <Text className="text-muted-foreground text-xs">
                  {ex.reps ? `${ex.reps} reps` : (ex.trackingType ?? "").replace(/_/g, " ")}
                  {ex.groupId ? ` · ${ex.groupLabel || "Superset"}` : ""}
                </Text>
              </View>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <Pressable
                  testID={`${testID}-fewer-${ex.exerciseSlug}`}
                  accessibilityRole="button"
                  accessibilityLabel={`Fewer sets for ${ex.name}`}
                  disabled={ex.sets <= 1}
                  onPress={() => setSets(ex.exerciseSlug, ex.sets - 1)}
                  style={{ padding: 6, opacity: ex.sets <= 1 ? 0.3 : 1, ...minTouchTarget }}
                >
                  <Text className="text-foreground text-base font-semibold">−</Text>
                </Pressable>
                <Text
                  testID={`${testID}-sets-${ex.exerciseSlug}`}
                  className="text-muted-foreground text-xs font-medium"
                  style={{ minWidth: 44, textAlign: "center" }}
                >
                  {ex.sets} {setUnitLabel(ex.trackingType, ex.sets).toLowerCase()}
                </Text>
                <Pressable
                  testID={`${testID}-more-${ex.exerciseSlug}`}
                  accessibilityRole="button"
                  accessibilityLabel={`More sets for ${ex.name}`}
                  disabled={ex.sets >= 8}
                  onPress={() => setSets(ex.exerciseSlug, ex.sets + 1)}
                  style={{ padding: 6, opacity: ex.sets >= 8 ? 0.3 : 1, ...minTouchTarget }}
                >
                  <Text className="text-foreground text-base font-semibold">+</Text>
                </Pressable>
              </View>
              <Pressable
                testID={`${testID}-group-${ex.exerciseSlug}`}
                accessibilityRole="button"
                accessibilityLabel={
                  ex.groupId
                    ? `Break up the group containing ${ex.name}`
                    : `Superset ${ex.name} with the next exercise`
                }
                onPress={() => toggleGroup(ex.exerciseSlug)}
                style={{ padding: 6, ...minTouchTarget }}
              >
                {ex.groupId ? (
                  <Unlink size={16} color={colors.primary} strokeWidth={2} />
                ) : (
                  <Layers size={16} color={colors["muted-foreground"]} strokeWidth={2} />
                )}
              </Pressable>
              <Pressable
                testID={`${testID}-remove-${ex.exerciseSlug}`}
                accessibilityRole="button"
                accessibilityLabel={`Remove ${ex.name}`}
                onPress={() => removeExercise(ex.exerciseSlug)}
                style={{ padding: 6, ...minTouchTarget }}
              >
                <Trash2 size={16} color={colors.destructive} strokeWidth={2} />
              </Pressable>
            </View>
          ))}
        </View>
      )}

      {chosen.length > 0 ? (
        <View
          testID={`${testID}-complete`}
          style={{
            borderRadius: 12,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.card,
            padding: 12,
            gap: 8,
          }}
        >
          <Pressable
            testID={`${testID}-finish`}
            accessibilityRole="button"
            accessibilityLabel={finishing ? "Finishing…" : "Finish this for me"}
            disabled={finishing}
            onPress={() => void finish()}
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              borderRadius: 8,
              paddingVertical: 10,
              backgroundColor: colors.primary,
              opacity: finishing ? 0.6 : 1,
              ...minTouchTarget,
            }}
          >
            {finishing ? (
              <ActivityIndicator size="small" color={colors["primary-foreground"]} />
            ) : (
              <Sparkles size={16} color={colors["primary-foreground"]} strokeWidth={2} />
            )}
            <Text
              style={{ fontSize: 14, fontWeight: "600", color: colors["primary-foreground"] }}
            >
              {finishing ? "Finishing…" : "Finish this for me"}
            </Text>
          </Pressable>
          {suggesting ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <ActivityIndicator size="small" color={colors["muted-foreground"]} />
              <Text testID={`${testID}-suggesting`} className="text-muted-foreground text-xs">
                Finding complements…
              </Text>
            </View>
          ) : null}
          {completionError ? (
            <Text
              testID={`${testID}-complete-error`}
              accessibilityRole="alert"
              style={{ fontSize: 12, color: colors.destructive }}
            >
              {completionError}
            </Text>
          ) : null}
          {!suggesting && visibleSuggestions.length > 0 ? (
            <View style={{ gap: 6 }}>
              <Text className="text-muted-foreground text-[11px] font-semibold uppercase">
                Complements for this draft
              </Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {visibleSuggestions.map((suggestion) => (
                  <Pressable
                    key={suggestion.exercise.exerciseSlug}
                    testID={`${testID}-suggestion-${suggestion.exercise.exerciseSlug}`}
                    accessibilityRole="button"
                    accessibilityLabel={`Add ${suggestion.exercise.name}`}
                    accessibilityHint={suggestion.reason}
                    onPress={() => {
                      setSuggestions((current) =>
                        current.filter(
                          ({
                            exercise,
                          }: {
                            exercise: { exerciseSlug: string };
                          }) =>
                            exercise.exerciseSlug !== suggestion.exercise.exerciseSlug,
                        ),
                      );
                      addExercise({
                        slug: suggestion.exercise.exerciseSlug,
                        name: suggestion.exercise.name,
                        trackingType: suggestion.exercise.trackingType,
                      });
                    }}
                    style={{
                      borderRadius: 999,
                      borderWidth: 1,
                      borderColor: colors.primary,
                      paddingHorizontal: 12,
                      paddingVertical: 6,
                      ...minTouchTarget,
                    }}
                  >
                    <Text style={{ fontSize: 12, fontWeight: "500", color: colors.primary }}>
                      {suggestion.exercise.name}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ) : null}
        </View>
      ) : null}

      <Pressable
        testID={`${testID}-start`}
        accessibilityRole="button"
        accessibilityLabel={`Start session${chosen.length > 0 ? ` with ${chosen.length} exercises` : ""}`}
        disabled={chosen.length === 0}
        onPress={() => void start()}
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          borderRadius: 12,
          paddingVertical: 12,
          backgroundColor: colors.success,
          opacity: chosen.length === 0 ? 0.5 : 1,
          ...minTouchTarget,
        }}
      >
        <Dumbbell size={16} color={colors["primary-foreground"]} strokeWidth={2} />
        <Text style={{ fontSize: 14, fontWeight: "600", color: colors["primary-foreground"] }}>
          Start session{chosen.length > 0 ? ` (${chosen.length})` : ""}
        </Text>
      </Pressable>

      <Pressable
        testID={`${testID}-log-toggle`}
        accessibilityRole="button"
        accessibilityLabel={logOpen ? "Hide log options" : "Log it or plan it instead"}
        accessibilityState={{ expanded: logOpen }}
        disabled={chosen.length === 0}
        onPress={() => setLogOpen((v) => !v)}
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: 6,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: colors.border,
          paddingVertical: 10,
          opacity: chosen.length === 0 ? 0.5 : 1,
          ...minTouchTarget,
        }}
      >
        <Check size={16} color={colors.foreground} strokeWidth={2} />
        <Text style={{ fontSize: 14, fontWeight: "500", color: colors.foreground }}>
          {logOpen ? "Hide log options" : "Log it or plan it instead"}
        </Text>
      </Pressable>
      {logOpen && chosen.length > 0 ? (
        <View
          testID={`${testID}-log-panel`}
          style={{
            borderRadius: 12,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.card,
            padding: 12,
            gap: 8,
          }}
        >
          <Text className="text-muted-foreground text-[11px] font-semibold uppercase">
            {isFutureDate ? "Plan this session for" : "When did you do this?"}
          </Text>
          <DatePicker value={logDate} onChange={setLogDate} testID={`${testID}-date`} />
          <Pressable
            testID={`${testID}-log-or-plan`}
            accessibilityRole="button"
            accessibilityLabel={logging ? "Saving…" : isFutureDate ? "Plan it" : "Log it"}
            disabled={logging}
            onPress={logOrPlan}
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              borderRadius: 8,
              paddingVertical: 10,
              backgroundColor: colors.primary,
              opacity: logging ? 0.5 : 1,
              ...minTouchTarget,
            }}
          >
            {logging ? (
              <ActivityIndicator size="small" color={colors["primary-foreground"]} />
            ) : (
              <Check size={16} color={colors["primary-foreground"]} strokeWidth={2} />
            )}
            <Text
              style={{ fontSize: 14, fontWeight: "600", color: colors["primary-foreground"] }}
            >
              {logging ? "Saving…" : isFutureDate ? "Plan it" : "Log it"}
            </Text>
          </Pressable>
          {logError ? (
            <Text
              testID={`${testID}-log-error`}
              accessibilityRole="alert"
              style={{ fontSize: 12, color: colors.destructive }}
            >
              {logError}
            </Text>
          ) : null}
        </View>
      ) : null}

      {showNamePrompt ? (
        <QuickSessionNamePrompt
          initialName={title}
          confirmLabel="Save name & log"
          fallbackName={fallbackQuickSessionName(logDate)}
          onConfirm={(name) => saveLogOrPlan(name)}
          onSkip={(name) => saveLogOrPlan(name)}
          onCancel={() => setShowNamePrompt(false)}
          testID={`${testID}-name-prompt`}
        />
      ) : null}
    </View>
  );
}

export function SessionBuilderScreen({
  onLaunch,
  testID = "session-builder",
}: SessionBuilderProps) {
  const { colors } = useThemeTokens();
  return (
    <SafeAreaView
      edges={["top", "bottom"]}
      style={{ flex: 1, backgroundColor: colors.background }}
      testID={`${testID}-route`}
    >
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 48, gap: 0 }}>
        <SessionBuilder onLaunch={onLaunch} testID={testID} />
      </ScrollView>
    </SafeAreaView>
  );
}
