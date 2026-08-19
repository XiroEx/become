"use client";

// Build-your-own session surface: name it, search the exercise catalog (plus
// your custom exercises — you can create one inline right from the search), add
// exercises with a sets stepper, then either launch it live, LOG it for a past
// day (backfill yesterday's workout), or PLAN it for a future date. Extracted
// from QuickSessionModal so the Workout hub's Sessions tab and any other entry
// point can reuse the exact same builder.

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Plus, Trash2, Dumbbell, Loader2, CalendarClock, Check, Sparkles, Layers, Unlink } from "lucide-react";
import type { ComplementSuggestion, DraftExercise, DraftSession } from "@/lib/quickSession/types";
import { stashQuickSession, quickSessionLiveHref } from "@/lib/quickSession/store";
import { localDateStr, logQuickSession } from "@/lib/quickSession/log";
import { groupIndexes, ungroupAt } from "@/lib/workout/buildAsYouGo";

interface SearchExercise {
  slug: string;
  name: string;
  trackingType: string;
}

interface SearchResponse {
  exercises: SearchExercise[];
}

interface CompleteSessionResponse {
  session?: {
    exercises?: DraftExercise[];
  };
  suggestions?: ComplementSuggestion[];
  error?: string;
}

export interface SessionBuilderProps {
  /** Fired right before navigating to the live session (e.g. close a modal). */
  onLaunch?: () => void;
  className?: string;
}

function authHeaders(): HeadersInit {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${typeof window !== "undefined" ? localStorage.getItem("token") ?? "" : ""}`,
  };
}

export default function SessionBuilder({ onLaunch, className }: SessionBuilderProps) {
  const router = useRouter();

  const [title, setTitle] = useState("Quick Session");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchExercise[]>([]);
  const [searching, setSearching] = useState(false);
  const [chosen, setChosen] = useState<DraftExercise[]>([]);
  // Your custom exercises — merged into search results; creatable inline below.
  const [customs, setCustoms] = useState<SearchExercise[]>([]);
  const [creating, setCreating] = useState(false);
  // Log-or-plan (no playthrough): past/today date → logged done, future → planned.
  const [logOpen, setLogOpen] = useState(false);
  const [logDate, setLogDate] = useState(localDateStr());
  const [logging, setLogging] = useState(false);
  const [logError, setLogError] = useState<string | null>(null);
  const [finishing, setFinishing] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [suggestions, setSuggestions] = useState<ComplementSuggestion[]>([]);
  const [completionError, setCompletionError] = useState<string | null>(null);
  const isFutureDate = logDate > localDateStr();

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const suggestionRequestRef = useRef<AbortController | null>(null);
  const suggestionVersionRef = useRef(0);

  // Load your custom exercises once so they show up in search too.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/exercises/custom", { headers: authHeaders() });
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as { exercises?: Array<{ slug: string; name: string; trackingType: string }> };
        if (!cancelled) setCustoms((data.exercises ?? []).map((e) => ({ slug: e.slug, name: e.name, trackingType: e.trackingType })));
      } catch { /* customs stay empty */ }
    })();
    return () => { cancelled = true };
  }, []);

  // Debounced exercise search.
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/exercises/search?q=${encodeURIComponent(q)}&limit=8`, {
          headers: authHeaders(),
        });
        if (!res.ok) {
          setResults([]);
          return;
        }
        const data = (await res.json()) as SearchResponse;
        setResults(data.exercises || []);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 250);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  // Find complementary exercises whenever the draft changes. The request is
  // deliberately kept separate from search so an empty draft never calls the
  // completion endpoint, and an older response cannot replace newer pills.
  useEffect(() => {
    suggestionRequestRef.current?.abort();
    const version = ++suggestionVersionRef.current;

    if (chosen.length === 0) {
      setSuggestions([]);
      setSuggesting(false);
      return;
    }

    const controller = new AbortController();
    suggestionRequestRef.current = controller;
    const timer = setTimeout(async () => {
      setSuggesting(true);
      try {
        const res = await fetch("/api/generate/session/complete", {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({ mode: "suggest", exercises: chosen, suggestionCount: 3 }),
          signal: controller.signal,
        });
        const data = (await res.json().catch(() => ({}))) as CompleteSessionResponse;
        if (version !== suggestionVersionRef.current) return;
        if (!res.ok) {
          setSuggestions([]);
          setCompletionError(data.error ?? "Suggestions are unavailable right now.");
          return;
        }
        const chosenSlugs = new Set(chosen.map((exercise) => exercise.exerciseSlug));
        setSuggestions(
          (data.suggestions ?? [])
            .filter(({ exercise }) => !chosenSlugs.has(exercise.exerciseSlug))
            .slice(0, 3),
        );
      } catch (error) {
        if (controller.signal.aborted || version !== suggestionVersionRef.current) return;
        setSuggestions([]);
        setCompletionError(error instanceof Error ? error.message : "Suggestions are unavailable right now.");
      } finally {
        if (version === suggestionVersionRef.current) setSuggesting(false);
      }
    }, 250);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [chosen]);

  const addExercise = useCallback((r: SearchExercise) => {
    setChosen((prev) => {
      if (prev.some((e) => e.exerciseSlug === r.slug)) return prev;
      const exercise: DraftExercise = {
        exerciseSlug: r.slug,
        name: r.name,
        trackingType: r.trackingType,
        sets: 3,
        reps: r.trackingType.startsWith("time") ? "" : "8-12",
      };
      return [...prev, exercise];
    });
    setQuery("");
    setResults([]);
  }, []);

  const removeExercise = useCallback((slug: string) => {
    setChosen((prev) => {
      const gone = prev.find((e) => e.exerciseSlug === slug);
      const next = prev.filter((e) => e.exerciseSlug !== slug);
      // A superset of one is not a superset.
      if (gone?.groupId && next.filter((e) => e.groupId === gone.groupId).length < 2) {
        return next.map((e) => {
          if (e.groupId !== gone.groupId) return e;
          const cleaned = { ...e };
          delete cleaned.groupId;
          delete cleaned.groupType;
          delete cleaned.groupLabel;
          delete cleaned.groupRest;
          delete cleaned.groupRounds;
          return cleaned;
        });
      }
      return next;
    });
  }, []);

  // Superset an exercise with the one under it, or break the group apart.
  // The same gesture exists mid-session in the live and track views.
  const toggleGroup = useCallback((slug: string) => {
    setChosen((prev) => {
      const i = prev.findIndex((e) => e.exerciseSlug === slug);
      if (i === -1) return prev;
      if (prev[i].groupId) return ungroupAt(prev, i).exercises;
      if (i + 1 >= prev.length) return prev;
      return groupIndexes(prev, [i, i + 1], "superset").exercises;
    });
  }, []);

  const setSets = useCallback((slug: string, sets: number) => {
    const clamped = Math.max(1, Math.min(8, sets));
    setChosen((prev) => prev.map((e) => (e.exerciseSlug === slug ? { ...e, sets: clamped } : e)));
  }, []);

  const finish = useCallback(async () => {
    if (chosen.length === 0 || finishing) return;
    setFinishing(true);
    setCompletionError(null);
    const draftSlugs = new Set(chosen.map((exercise) => exercise.exerciseSlug));

    try {
      const res = await fetch("/api/generate/session/complete", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ mode: "finish", exercises: chosen }),
      });
      const data = (await res.json().catch(() => ({}))) as CompleteSessionResponse;
      if (!res.ok) throw new Error(data.error ?? "Could not finish this session.");

      const appended = (data.session?.exercises ?? []).filter(
        (exercise) => !draftSlugs.has(exercise.exerciseSlug),
      );
      setChosen((current) => {
        const currentSlugs = new Set(current.map((exercise) => exercise.exerciseSlug));
        return [...current, ...appended.filter((exercise) => !currentSlugs.has(exercise.exerciseSlug))];
      });
    } catch (error) {
      setCompletionError(error instanceof Error ? error.message : "Could not finish this session.");
    } finally {
      setFinishing(false);
    }
  }, [chosen, finishing]);

  const start = useCallback(() => {
    if (chosen.length === 0) return;
    const session: DraftSession = { title: title.trim() || "Quick Session", exercises: chosen };
    const id = stashQuickSession(session);
    onLaunch?.();
    router.push(quickSessionLiveHref(id));
  }, [chosen, title, router, onLaunch]);

  // Create a custom exercise inline from the current search text and add it
  // straight to the session (sensible defaults; refine it later in the library).
  const createCustom = useCallback(async () => {
    const name = query.trim();
    if (name.length < 2 || creating) return;
    setCreating(true);
    try {
      const res = await fetch("/api/exercises/custom", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ name, trackingType: "reps_weight", muscleGroup: "other", category: "strength" }),
      });
      if (!res.ok) return;
      const data = (await res.json()) as { exercise?: { slug: string; name: string; trackingType: string } };
      if (data.exercise) {
        setCustoms((prev) => [...prev, { slug: data.exercise!.slug, name: data.exercise!.name, trackingType: data.exercise!.trackingType }]);
        addExercise({ slug: data.exercise.slug, name: data.exercise.name, trackingType: data.exercise.trackingType });
      }
    } catch { /* leave the query for retry */ } finally {
      setCreating(false);
    }
  }, [query, creating, addExercise]);

  // Log (past/today) or plan (future) the built session without playing it —
  // the backfill path for "I worked out yesterday and never logged it".
  const logOrPlan = useCallback(async () => {
    if (chosen.length === 0 || logging) return;
    setLogging(true);
    setLogError(null);
    try {
      const session: DraftSession = { title: title.trim() || "Quick Session", exercises: chosen };
      const id = stashQuickSession(session);
      const { done } = await logQuickSession({ sessionId: id, title: session.title, exercises: chosen, date: logDate });
      onLaunch?.();
      router.push(done ? "/dashboard/history" : "/dashboard/workout/hub?tab=sessions");
    } catch (e) {
      setLogError(e instanceof Error ? e.message : "Failed to save session");
      setLogging(false);
    }
  }, [chosen, title, logDate, logging, router, onLaunch]);

  // Search shows catalog matches + your matching customs (deduped by slug).
  const q = query.trim().toLowerCase();
  const customMatches = q.length >= 2 ? customs.filter((c) => c.name.toLowerCase().includes(q)) : [];
  const merged = [...results, ...customMatches.filter((c) => !results.some((r) => r.slug === c.slug))];

  return (
    <div className={className}>
      {/* Title */}
      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Session title"
        className="mb-3 w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-sm font-medium text-zinc-900 placeholder-zinc-400 focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white dark:placeholder-zinc-500"
      />

      {/* Exercise search */}
      <div className="relative mb-3">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Add an exercise…"
          className="w-full rounded-xl border border-zinc-200 bg-zinc-50 py-2.5 pl-10 pr-9 text-sm text-zinc-900 placeholder-zinc-400 focus:border-green-500 focus:outline-none focus:ring-1 focus:ring-green-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white dark:placeholder-zinc-500"
        />
        {searching && (
          <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-zinc-400" />
        )}

        {(merged.length > 0 || (q.length >= 2 && !searching)) && (
          <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-60 overflow-y-auto rounded-xl border border-zinc-200 bg-white shadow-lg dark:border-zinc-700 dark:bg-zinc-800">
            {merged.map((r) => {
              const already = chosen.some((e) => e.exerciseSlug === r.slug);
              return (
                <button
                  key={r.slug}
                  onClick={() => addExercise(r)}
                  disabled={already}
                  className="flex w-full items-center justify-between px-3 py-2.5 text-left transition-colors hover:bg-zinc-50 disabled:opacity-40 dark:hover:bg-zinc-700/50"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-zinc-900 dark:text-white">{r.name}</p>
                    <p className="text-xs text-zinc-400 dark:text-zinc-500">{r.trackingType.replace(/_/g, " ")}</p>
                  </div>
                  <Plus className="ml-2 h-4 w-4 shrink-0 text-green-600 dark:text-green-400" />
                </button>
              );
            })}
            {/* No exact match? Create it right here and keep building. */}
            {q.length >= 2 && !merged.some((r) => r.name.toLowerCase() === q) && (
              <button
                onClick={createCustom}
                disabled={creating}
                className="flex w-full items-center gap-2 border-t border-zinc-100 px-3 py-2.5 text-left transition-colors hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-700/50"
              >
                {creating ? <Loader2 className="h-4 w-4 animate-spin text-green-600" /> : <Sparkles className="h-4 w-4 text-green-600 dark:text-green-400" />}
                <span className="text-sm font-medium text-green-700 dark:text-green-400">
                  {creating ? "Creating…" : `Create "${query.trim()}" as a new exercise`}
                </span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Chosen exercises */}
      {chosen.length === 0 ? (
        <p className="rounded-xl border border-dashed border-zinc-300 px-3 py-6 text-center text-xs text-zinc-400 dark:border-zinc-700 dark:text-zinc-500">
          Search above to add exercises
        </p>
      ) : (
        <div className="space-y-1.5">
          {chosen.map((ex) => (
            <div
              key={ex.exerciseSlug}
              className="flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-zinc-900 dark:text-white">{ex.name}</p>
                <p className="text-xs text-zinc-400 dark:text-zinc-500">
                  {ex.reps ? `${ex.reps} reps` : ex.trackingType.replace(/_/g, " ")}
                  {ex.groupId && <span className="ml-1 font-semibold text-purple-500 dark:text-purple-400">· {ex.groupLabel || "Superset"}</span>}
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setSets(ex.exerciseSlug, ex.sets - 1)}
                  disabled={ex.sets <= 1}
                  aria-label="Fewer sets"
                  className="flex h-6 w-6 items-center justify-center rounded-full bg-zinc-100 text-zinc-600 transition-colors hover:bg-zinc-200 disabled:opacity-40 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
                >
                  −
                </button>
                <span className="w-10 text-center text-xs font-medium text-zinc-700 dark:text-zinc-300">
                  {ex.sets} set{ex.sets !== 1 ? "s" : ""}
                </span>
                <button
                  onClick={() => setSets(ex.exerciseSlug, ex.sets + 1)}
                  disabled={ex.sets >= 8}
                  aria-label="More sets"
                  className="flex h-6 w-6 items-center justify-center rounded-full bg-zinc-100 text-zinc-600 transition-colors hover:bg-zinc-200 disabled:opacity-40 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
                >
                  +
                </button>
              </div>
              <button
                onClick={() => toggleGroup(ex.exerciseSlug)}
                aria-label={ex.groupId ? `Break up the group containing ${ex.name}` : `Superset ${ex.name} with the next exercise`}
                data-testid={`builder-group-toggle-${ex.exerciseSlug}`}
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition-colors ${ex.groupId ? "text-purple-500 hover:bg-purple-50 dark:text-purple-400 dark:hover:bg-purple-950/30" : "text-zinc-400 hover:bg-purple-50 hover:text-purple-500 dark:hover:bg-purple-950/30 dark:hover:text-purple-400"}`}
              >
                {ex.groupId ? <Unlink className="h-4 w-4" /> : <Layers className="h-4 w-4" />}
              </button>
              <button
                onClick={() => removeExercise(ex.exerciseSlug)}
                aria-label="Remove exercise"
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-zinc-400 transition-colors hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950/30 dark:hover:text-red-400"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {chosen.length > 0 && (
        <div className="mt-3 rounded-xl border border-green-200 bg-green-50/70 p-3 dark:border-green-900/60 dark:bg-green-950/20">
          <div className="flex items-center gap-2">
            <button
              onClick={finish}
              disabled={finishing}
              className="flex items-center gap-1.5 rounded-lg bg-green-600 px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {finishing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {finishing ? "Finishing…" : "Finish this for me"}
            </button>
            {suggesting && <Loader2 className="h-4 w-4 animate-spin text-green-600 dark:text-green-400" aria-label="Loading suggestions" />}
          </div>
          {completionError && <p className="mt-2 text-xs text-red-600 dark:text-red-400">{completionError}</p>}
          {(suggesting || suggestions.length > 0) && (
            <div className="mt-3">
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-green-800 dark:text-green-300">
                Complements for this draft
              </p>
              <div className="flex gap-2 overflow-x-auto pb-0.5">
                {suggestions.map((suggestion) => (
                  <button
                    key={suggestion.exercise.exerciseSlug}
                    onClick={() => {
                      setSuggestions((current) => current.filter(({ exercise }) => exercise.exerciseSlug !== suggestion.exercise.exerciseSlug));
                      addExercise({
                        slug: suggestion.exercise.exerciseSlug,
                        name: suggestion.exercise.name,
                        trackingType: suggestion.exercise.trackingType,
                      });
                    }}
                    className="shrink-0 rounded-full border border-green-300 bg-white px-3 py-1.5 text-left text-xs font-medium text-green-800 transition-colors hover:bg-green-100 dark:border-green-800 dark:bg-zinc-900 dark:text-green-300 dark:hover:bg-green-950/40"
                    title={suggestion.reason}
                  >
                    {suggestion.exercise.name}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Start */}
      <button
        onClick={start}
        disabled={chosen.length === 0}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-green-600 to-green-500 py-3 text-sm font-semibold text-white shadow-sm transition-all hover:from-green-700 hover:to-green-600 active:from-green-800 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Dumbbell className="h-4 w-4" />
        Start session
        {chosen.length > 0 && (
          <span className="rounded-full bg-white/20 px-1.5 py-0.5 text-[11px]">{chosen.length}</span>
        )}
      </button>

      {/* Log or plan — save it WITHOUT playing: pick a past date to backfill a
          workout you already did (e.g. yesterday), or a future date to plan it. */}
      <button
        onClick={() => setLogOpen((v) => !v)}
        disabled={chosen.length === 0}
        aria-expanded={logOpen}
        className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-xl border border-zinc-200 py-2.5 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
      >
        <CalendarClock className="h-4 w-4" />
        {logOpen ? "Hide log options" : "Log it or plan it instead"}
      </button>
      {logOpen && chosen.length > 0 && (
        <div className="mt-2 rounded-xl border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-700 dark:bg-zinc-900">
          <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
            {isFutureDate ? "Plan this session for" : "When did you do this?"}
          </label>
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={logDate}
              onChange={(e) => setLogDate(e.target.value)}
              className="min-w-0 flex-1 rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-600 dark:bg-zinc-800 dark:text-white"
            />
            <button
              onClick={logOrPlan}
              disabled={logging}
              className="flex shrink-0 items-center gap-1.5 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 dark:bg-white dark:text-black"
            >
              <Check className="h-4 w-4" /> {logging ? "Saving…" : isFutureDate ? "Plan it" : "Log it"}
            </button>
          </div>
          {logError && <p className="mt-1.5 text-xs text-red-500">{logError}</p>}
        </div>
      )}
    </div>
  );
}
