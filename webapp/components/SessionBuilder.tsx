"use client";

// Build-your-own session surface: name it, search the exercise catalog, add
// exercises with a sets stepper, then launch it into the live engine as a quick
// (program-less) session. Extracted from QuickSessionModal so the Workout hub's
// Sessions tab and any other entry point can reuse the exact same builder.

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Plus, Trash2, Dumbbell, Loader2 } from "lucide-react";
import type { DraftExercise, DraftSession } from "@/lib/quickSession/types";
import { stashQuickSession, quickSessionLiveHref } from "@/lib/quickSession/store";

interface SearchExercise {
  slug: string;
  name: string;
  trackingType: string;
}

interface SearchResponse {
  exercises: SearchExercise[];
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

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    setChosen((prev) => prev.filter((e) => e.exerciseSlug !== slug));
  }, []);

  const setSets = useCallback((slug: string, sets: number) => {
    const clamped = Math.max(1, Math.min(8, sets));
    setChosen((prev) => prev.map((e) => (e.exerciseSlug === slug ? { ...e, sets: clamped } : e)));
  }, []);

  const start = useCallback(() => {
    if (chosen.length === 0) return;
    const session: DraftSession = { title: title.trim() || "Quick Session", exercises: chosen };
    const id = stashQuickSession(session);
    onLaunch?.();
    router.push(quickSessionLiveHref(id));
  }, [chosen, title, router, onLaunch]);

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

        {results.length > 0 && (
          <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-60 overflow-y-auto rounded-xl border border-zinc-200 bg-white shadow-lg dark:border-zinc-700 dark:bg-zinc-800">
            {results.map((r) => {
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
    </div>
  );
}
