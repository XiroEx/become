"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { X, Plus, Search, Dumbbell, Sparkles, Loader2, Trash2, History } from "lucide-react";
import {
  FOCUS_DEFS,
  QUICK_FOCUS_ORDER,
  isFocusKey,
  type FocusKey,
  type DraftSession,
  type DraftExercise,
} from "@/lib/quickSession/types";
import { stashQuickSession, quickSessionLiveHref } from "@/lib/quickSession/store";

// ─── Props ────────────────────────────────────────────────────────────────────

export interface QuickSessionModalProps {
  open: boolean;
  onClose: () => void;
}

// ─── Fetch response shapes ──────────────────────────────────────────────────────

interface GenerateSessionResponse {
  session: DraftSession;
  seed: number;
}

interface ErrorResponse {
  error?: string;
}

interface WorkoutLog {
  kind: "program" | "quick";
  title: string;
  focus?: string;
  date: string;
  duration?: number;
  exerciseCount: number;
}

interface WorkoutLogsResponse {
  logs: WorkoutLog[];
}

interface SearchExercise {
  slug: string;
  name: string;
  trackingType: string;
}

interface SearchResponse {
  exercises: SearchExercise[];
}

// ─── Helpers ────────────────────────────────────────────────────────────────────

function authHeaders(): HeadersInit {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${typeof window !== "undefined" ? localStorage.getItem("token") ?? "" : ""}`,
  };
}

function shortDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / 86_400_000);
  if (diffDays <= 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// ─── Component ──────────────────────────────────────────────────────────────────

export default function QuickSessionModal({ open, onClose }: QuickSessionModalProps) {
  const router = useRouter();

  // Focus-chip generation
  const [loadingFocus, setLoadingFocus] = useState<FocusKey | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Recent sessions
  const [recentQuick, setRecentQuick] = useState<WorkoutLog[]>([]);

  // Builder
  const [title, setTitle] = useState("Quick Session");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchExercise[]>([]);
  const [searching, setSearching] = useState(false);
  const [chosen, setChosen] = useState<DraftExercise[]>([]);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Reset transient state when the sheet toggles ──
  useEffect(() => {
    if (open) {
      setError(null);
      setLoadingFocus(null);
      setQuery("");
      setResults([]);
      setSearching(false);
    } else {
      // full reset on close
      setError(null);
      setLoadingFocus(null);
      setQuery("");
      setResults([]);
      setSearching(false);
      setTitle("Quick Session");
      setChosen([]);
      setRecentQuick([]);
    }
  }, [open]);

  // ── Launch a generated session for a focus ──
  const launchFocus = useCallback(
    async (focus: FocusKey) => {
      setError(null);
      setLoadingFocus(focus);
      try {
        const res = await fetch("/api/generate/session", {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({ focus }),
        });
        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as ErrorResponse;
          setError(data.error || "Couldn't build that session. Try again.");
          setLoadingFocus(null);
          return;
        }
        const data = (await res.json()) as GenerateSessionResponse;
        const sessionId = stashQuickSession(data.session);
        router.push(quickSessionLiveHref(sessionId));
        onClose();
      } catch {
        setError("Network error. Try again.");
        setLoadingFocus(null);
      }
    },
    [router, onClose],
  );

  // ── Load recent quick sessions when opened ──
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/workouts/logs", { headers: authHeaders() });
        if (!res.ok) return;
        const data = (await res.json()) as WorkoutLogsResponse;
        if (cancelled) return;
        const quick = (data.logs || []).filter((l) => l.kind === "quick").slice(0, 3);
        setRecentQuick(quick);
      } catch {
        /* best-effort — hide the section on failure */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  // ── Debounced exercise search ──
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
        const res = await fetch(
          `/api/exercises/search?q=${encodeURIComponent(q)}&limit=8`,
          { headers: authHeaders() },
        );
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

  // ── Re-launch a recent session by its focus ──
  const launchRecent = useCallback(
    (log: WorkoutLog) => {
      const focus: FocusKey = isFocusKey(log.focus) ? log.focus : "full_body";
      launchFocus(focus);
    },
    [launchFocus],
  );

  // ── Builder actions ──
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
    setChosen((prev) =>
      prev.map((e) => (e.exerciseSlug === slug ? { ...e, sets: clamped } : e)),
    );
  }, []);

  const startBuilt = useCallback(() => {
    if (chosen.length === 0) return;
    const session: DraftSession = {
      title: title.trim() || "Quick Session",
      exercises: chosen,
    };
    const id = stashQuickSession(session);
    router.push(quickSessionLiveHref(id));
    onClose();
  }, [chosen, title, router, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] bg-black/50 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* Sheet */}
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 28, stiffness: 320 }}
            onClick={(e) => e.stopPropagation()}
            className="fixed inset-x-0 bottom-0 z-[201] max-h-[88vh] overflow-y-auto overscroll-contain rounded-t-2xl bg-white shadow-2xl dark:bg-zinc-900"
            style={{ paddingBottom: "calc(env(safe-area-inset-bottom,0px) + 1rem)" }}
          >
            {/* Grab handle */}
            <div className="sticky top-0 z-10 bg-white/95 backdrop-blur dark:bg-zinc-900/95">
              <div className="flex justify-center pt-3">
                <div className="h-1 w-10 rounded-full bg-zinc-300 dark:bg-zinc-700" />
              </div>
              {/* Header */}
              <div className="flex items-center justify-between px-5 pb-3 pt-3">
                <div className="flex items-center gap-2">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-green-500 to-purple-500 text-white">
                    <Sparkles className="h-4 w-4" />
                  </span>
                  <h2 className="text-lg font-bold text-zinc-900 dark:text-white">
                    Quick Session
                  </h2>
                </div>
                <button
                  onClick={onClose}
                  aria-label="Close"
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-100 text-zinc-500 transition-colors hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="space-y-6 px-5 pt-2">
              {/* Inline error */}
              {error && (
                <p className="text-sm text-red-500 dark:text-red-400">{error}</p>
              )}

              {/* ── 1. Focus chips ── */}
              <section>
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
                  Quick start by focus
                </p>
                <div className="flex flex-wrap gap-2">
                  {QUICK_FOCUS_ORDER.map((k) => FOCUS_DEFS[k]).map((def) => {
                    const isLoading = loadingFocus === def.key;
                    const disabled = loadingFocus !== null;
                    return (
                      <button
                        key={def.key}
                        onClick={() => launchFocus(def.key)}
                        disabled={disabled}
                        className={`flex items-center gap-1.5 rounded-2xl border px-3.5 py-2 text-left transition-colors disabled:opacity-50 ${
                          isLoading
                            ? "border-green-500 bg-green-50 dark:border-green-600 dark:bg-green-950/30"
                            : "border-zinc-200 bg-zinc-50 hover:border-green-400 hover:bg-green-50/50 dark:border-zinc-700 dark:bg-zinc-800 dark:hover:border-green-600 dark:hover:bg-green-950/20"
                        }`}
                      >
                        {isLoading ? (
                          <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-green-600 dark:text-green-400" />
                        ) : (
                          <Dumbbell className="h-3.5 w-3.5 shrink-0 text-purple-500 dark:text-purple-400" />
                        )}
                        <span className="flex flex-col">
                          <span className="text-sm font-semibold text-zinc-900 dark:text-white">
                            {def.label}
                          </span>
                          <span className="text-[10px] text-zinc-400 dark:text-zinc-500">
                            {def.blurb}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>

              {/* ── 2. Recent sessions ── */}
              {recentQuick.length > 0 && (
                <section>
                  <p className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
                    <History className="h-3.5 w-3.5" />
                    Your recent sessions
                  </p>
                  <div className="space-y-1.5">
                    {recentQuick.map((log, i) => (
                      <button
                        key={`${log.title}-${log.date}-${i}`}
                        onClick={() => launchRecent(log)}
                        disabled={loadingFocus !== null}
                        className="flex w-full items-center justify-between rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-left transition-colors hover:border-green-400 disabled:opacity-50 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-green-600"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-zinc-900 dark:text-white">
                            {log.title}
                          </p>
                          <p className="text-xs text-zinc-400 dark:text-zinc-500">
                            {shortDate(log.date)} · {log.exerciseCount} exercise
                            {log.exerciseCount !== 1 ? "s" : ""}
                          </p>
                        </div>
                        <span className="ml-3 shrink-0 text-xs font-semibold text-green-600 dark:text-green-400">
                          Repeat
                        </span>
                      </button>
                    ))}
                  </div>
                </section>
              )}

              {/* ── 3. Builder ── */}
              <section>
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
                  Build your own
                </p>

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

                  {/* Results dropdown */}
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
                              <p className="truncate text-sm font-medium text-zinc-900 dark:text-white">
                                {r.name}
                              </p>
                              <p className="text-xs text-zinc-400 dark:text-zinc-500">
                                {r.trackingType.replace(/_/g, " ")}
                              </p>
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
                          <p className="truncate text-sm font-medium text-zinc-900 dark:text-white">
                            {ex.name}
                          </p>
                          <p className="text-xs text-zinc-400 dark:text-zinc-500">
                            {ex.reps ? `${ex.reps} reps` : ex.trackingType.replace(/_/g, " ")}
                          </p>
                        </div>
                        {/* Sets stepper */}
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

                {/* Start button */}
                <button
                  onClick={startBuilt}
                  disabled={chosen.length === 0}
                  className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-green-600 to-green-500 py-3 text-sm font-semibold text-white shadow-sm transition-all hover:from-green-700 hover:to-green-600 active:from-green-800 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Dumbbell className="h-4 w-4" />
                  Start session
                  {chosen.length > 0 && (
                    <span className="rounded-full bg-white/20 px-1.5 py-0.5 text-[11px]">
                      {chosen.length}
                    </span>
                  )}
                </button>
              </section>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
