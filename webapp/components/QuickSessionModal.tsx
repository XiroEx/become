"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  Dumbbell,
  Sparkles,
  Loader2,
  History,
  ChevronRight,
  RefreshCw,
  ArrowRight,
} from "lucide-react";
import {
  FOCUS_DEFS,
  QUICK_FOCUS_ORDER,
  isFocusKey,
  type FocusKey,
  type DraftSession,
  type DraftExercise,
} from "@/lib/quickSession/types";
import { stashQuickSession, quickSessionOverviewHref } from "@/lib/quickSession/store";
import { curatedGlutesSession } from "@/lib/quickSession/curatedGlutes";
import { SESSIONS_HUB_HREF, BUILD_SESSION_HREF } from "@/lib/quickSession/hubLinks";
import { pickRecentQuickSessions } from "@/lib/quickSession/recentSessions";
import { logPlanAvailability, localDateStr } from "@/lib/quickSession/logPlanDate";
import { runAiTask } from "@/lib/ai/runClient";
import { resolveAiExercises, MIN_RESOLVED_EXERCISES } from "@/lib/ai/resolveExercises";
import ShareButton from "@/components/share/ShareButton";
import UpgradeSheet from "@/components/UpgradeSheet";
import { gateFrom, type GatePayload } from "@/lib/entitlementsClient";
import { invalidateEntitlements } from "@/hooks/useEntitlements";

// ─── Props ────────────────────────────────────────────────────────────────────

export interface QuickSessionModalProps {
  open: boolean;
  onClose: () => void;
  /** Local YYYY-MM-DD to pre-fill the resulting session's Log/Plan date with —
   *  set when opened from a specific Calendar day rather than "workout now". */
  date?: string;
}

// ─── Fetch response shapes ──────────────────────────────────────────────────────

interface GenerateSessionResponse {
  session: DraftSession;
  seed: number;
}

interface ErrorResponse {
  error?: string;
}

interface AiSessionResponse {
  ok: boolean;
  fallback?: boolean;
  session?: {
    title?: string;
    focus?: string;
    exercises?: Array<{ name?: string; sets?: number; reps?: string | number; rest?: string }>;
  };
}

interface WorkoutLog {
  kind: "program" | "quick";
  title: string;
  focus?: string;
  date: string;
  duration?: number;
  exerciseCount: number;
  sessionId?: string;
  /** Present when fetched with ?withExercises=true; absent on legacy logs. */
  exercises?: DraftExercise[];
}

interface WorkoutLogsResponse {
  logs: WorkoutLog[];
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

// ─── AI name → slug resolution ───────────────────────────────────────────────

async function resolveAiSession(
  aiSession: NonNullable<AiSessionResponse["session"]>,
  focus: FocusKey,
  headers: HeadersInit,
): Promise<DraftSession | null> {
  const aiExercises = aiSession.exercises ?? [];
  if (aiExercises.length === 0) return null;

  // Resolve to REAL library exercises; unmatched names are dropped (no synthetic
  // slugs → no janky no-video tiles). Require enough to be worth showing.
  const { exercises, matched } = await resolveAiExercises(aiExercises, headers);
  if (matched < MIN_RESOLVED_EXERCISES) return null;

  return {
    title: aiSession.title || `${FOCUS_DEFS[focus].label} Session`,
    focus,
    exercises,
  };
}

// ─── Component ──────────────────────────────────────────────────────────────────

export default function QuickSessionModal({ open, onClose, date }: QuickSessionModalProps) {
  const router = useRouter();

  const [error, setError] = useState<string | null>(null);
  // A tier/allowance refusal, kept as the whole payload so the upgrade sheet
  // can name the real limit rather than a hand-written string.
  const [gate, setGate] = useState<GatePayload | null>(null);
  // An AI refusal the member walked away from WITH a session: the unmetered
  // deterministic builder ran instead. Shown inline, never as the upgrade
  // sheet — there is a preview underneath it.
  const [fallbackNote, setFallbackNote] = useState<string | null>(null);

  // My Sessions (recent quick logs)
  const [recentQuick, setRecentQuick] = useState<WorkoutLog[]>([]);
  const [loadingRecent, setLoadingRecent] = useState(false);

  // Focus → preview → start
  const [selectedFocus, setSelectedFocus] = useState<FocusKey | null>(null);
  const [preview, setPreview] = useState<DraftSession | null>(null);
  const [generating, setGenerating] = useState(false);
  // Re-launch state for a "repeat" tap on a recent session.
  const [repeating, setRepeating] = useState(false);
  // AI state
  const [useAi, setUseAi] = useState(false);
  const [aiUsed, setAiUsed] = useState(false);
  // Prevent concurrent AI + deterministic fetches when switching focus mid-flight
  const activeGenRef = useRef(0);

  // ── Reset transient state when the sheet toggles ──
  useEffect(() => {
    if (!open) {
      setError(null);
      setFallbackNote(null);
      setRecentQuick([]);
      setSelectedFocus(null);
      setPreview(null);
      setGenerating(false);
      setRepeating(false);
      setAiUsed(false);
      activeGenRef.current += 1; // cancel any in-flight generation
    }
  }, [open]);

  // ── Load recent quick sessions when opened (top 5) ──
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoadingRecent(true);
    (async () => {
      try {
        const res = await fetch("/api/workouts/logs?withExercises=true", { headers: authHeaders() });
        if (!res.ok) return;
        const data = (await res.json()) as WorkoutLogsResponse;
        if (cancelled) return;
        setRecentQuick(pickRecentQuickSessions(data.logs || []));
      } catch {
        /* best-effort */
      } finally {
        if (!cancelled) setLoadingRecent(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  // Raise the upgrade sheet for a refusal money fixes. It drops the fallback
  // note first, and that is the point: the note says a session IS on screen,
  // so a modal sheet over one would read as a failure. Every caller reaches
  // here only after failing to produce a session, which makes the two states
  // mutually exclusive rather than merely unlikely to coincide.
  const raiseGate = useCallback((g: GatePayload) => {
    setFallbackNote(null);
    setGate(g);
  }, []);

  // ── Generate a preview for a focus (does NOT start it) ──
  const generateFor = useCallback(
    async (focus: FocusKey) => {
      setError(null);
      // A sheet left over from the last attempt must not survive into this one.
      setGate(null);
      setFallbackNote(null);
      setSelectedFocus(focus);
      setPreview(null);
      setAiUsed(false);
      setGenerating(true);
      const genId = ++activeGenRef.current;
      const headers = authHeaders();

      // ── Coach-curated fixed session (bypasses AI + the algorithmic generator) ──
      if (focus === "glutes") {
        setPreview(curatedGlutesSession());
        setGenerating(false);
        return;
      }

      // ── AI path ────────────────────────────────────────────────────────────
      if (useAi) {
        try {
          // Async run: POST returns a runId, runAiTask polls until the session lands.
          const r = await runAiTask("/api/ai/workout/session", { focus: FOCUS_DEFS[focus].label });
          if (genId !== activeGenRef.current) return; // stale
          // Out of AI generations for the week. Fall THROUGH to the
          // deterministic route: /api/generate/session is unmetered by design
          // (it is the fallback every AI route degrades to), so the member
          // still gets a session and the refusal is a note rather than a dead
          // end. Refetching is left to the next entitlements reader.
          if (r.gate) {
            setFallbackNote(
              `${r.gate.error} Built you a standard session instead — switch AI off to keep generating without using one.`,
            );
            invalidateEntitlements();
          }
          const aiSession = r.result as AiSessionResponse["session"] | undefined;
          if (r.ok && aiSession) {
            const resolved = await resolveAiSession(aiSession, focus, headers);
            if (genId !== activeGenRef.current) return;
            if (resolved) {
              setPreview(resolved);
              setAiUsed(true);
              setGenerating(false);
              return;
            }
          }
        } catch {
          /* fall through to deterministic */
        }
        if (genId !== activeGenRef.current) return;
      }

      // ── Deterministic fallback ─────────────────────────────────────────────
      try {
        const res = await fetch("/api/generate/session", {
          method: "POST",
          headers,
          body: JSON.stringify({ focus }),
        });
        if (genId !== activeGenRef.current) return;
        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as ErrorResponse;
          // The note was written a moment ago, on the assumption that this call
          // always works. It didn't, so retract it rather than leave an amber
          // "built you a standard session instead" above a red error and an
          // empty preview.
          setFallbackNote(null);
          const g = gateFrom(res.status, data);
          if (g) {
            raiseGate(g);
            return;
          }
          setError(data.error || "Couldn't build that session. Try again.");
          return;
        }
        const data = (await res.json()) as GenerateSessionResponse;
        if (genId !== activeGenRef.current) return;
        if (!data?.session) {
          setFallbackNote(null);
          setError("Couldn't build that session. Try again.");
          return;
        }
        setPreview(data.session);
      } catch {
        if (genId !== activeGenRef.current) return;
        setFallbackNote(null);
        setError("Network error. Try again.");
      } finally {
        if (genId === activeGenRef.current) setGenerating(false);
      }
    },
    [useAi, raiseGate],
  );

  // ── Start the previewed session ──
  const startPreview = useCallback(() => {
    if (!preview) return;
    const id = stashQuickSession(preview, { needsName: true });
    router.push(quickSessionOverviewHref(id, { date }));
    onClose();
  }, [preview, router, onClose, date]);

  // ── Repeat a recent session ──
  // Genuinely repeats it: same title, same exercises. It used to re-GENERATE
  // from the log's focus, which meant "Repeat" on "Sunday Back & Shoulders"
  // handed back a different full-body session every time.
  const repeatRecent = useCallback(
    async (log: WorkoutLog) => {
      const focus: FocusKey = isFocusKey(log.focus) ? log.focus : "full_body";
      setError(null);

      if (log.exercises?.length) {
        const id = stashQuickSession(
          {
            title: log.title,
            focus,
            exercises: log.exercises,
            source: "saved",
          },
          { needsName: false, ...(log.sessionId ? { sourceSessionId: log.sessionId } : {}) },
        );
        router.push(quickSessionOverviewHref(id, { date }));
        onClose();
        return;
      }

      // Legacy log with no stored exercises — nothing to repeat, so rebuild one
      // from its focus (the old behaviour).
      setRepeating(true);
      try {
        const res = await fetch("/api/generate/session", {
          method: "POST",
          headers: authHeaders(),
          body: JSON.stringify({ focus }),
        });
        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as ErrorResponse;
          const g = gateFrom(res.status, data);
          if (g) {
            raiseGate(g);
            return;
          }
          setError(data.error || "Couldn't rebuild that session. Try again.");
          return;
        }
        const data = (await res.json()) as GenerateSessionResponse;
        const id = stashQuickSession(data.session, { needsName: true });
        router.push(quickSessionOverviewHref(id, { date }));
        onClose();
      } catch {
        setError("Network error. Try again.");
      } finally {
        setRepeating(false);
      }
    },
    [router, onClose, date, raiseGate],
  );

  const busy = generating || repeating;

  // Heading reflects the target day when opened from a specific Calendar date
  // rather than the default "right now" flow.
  const modalTitle = (() => {
    if (!date || date === localDateStr()) return "Workout Now";
    const { canLog, canPlan } = logPlanAvailability(date, localDateStr());
    return canPlan && !canLog ? "Schedule a Workout" : "Log a Workout";
  })();

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
            {/* Grab handle + header */}
            <div className="sticky top-0 z-10 bg-white/95 backdrop-blur dark:bg-zinc-900/95">
              <div className="flex justify-center pt-3">
                <div className="h-1 w-10 rounded-full bg-zinc-300 dark:bg-zinc-700" />
              </div>
              <div className="flex items-center justify-between px-5 pb-3 pt-3">
                <div className="flex items-center gap-2">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-green-500 to-purple-500 text-white">
                    <Sparkles className="h-4 w-4" />
                  </span>
                  <h2 className="text-lg font-bold text-zinc-900 dark:text-white">{modalTitle}</h2>
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
              {error && <p className="text-sm text-red-500 dark:text-red-400">{error}</p>}

              {/* AI allowance spent, session built anyway. Non-blocking on
                  purpose: a modal over a working preview reads as a failure. */}
              {fallbackNote && (
                <div className="flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2.5 text-sm text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300">
                  <Sparkles className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{fallbackNote}</span>
                </div>
              )}

              {/* ── 1. My Sessions ── */}
              <section>
                <div className="mb-2 flex items-center justify-between">
                  <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
                    <History className="h-3.5 w-3.5" />
                    My Sessions
                  </p>
                  {recentQuick.length > 0 && (
                    <Link
                      href={SESSIONS_HUB_HREF}
                      onClick={onClose}
                      className="flex items-center gap-0.5 text-xs font-semibold text-green-600 dark:text-green-400"
                    >
                      See all
                      <ChevronRight className="h-3.5 w-3.5" />
                    </Link>
                  )}
                </div>

                {loadingRecent ? (
                  <div className="space-y-1.5">
                    {[0, 1, 2].map((i) => (
                      <div key={i} className="h-14 animate-pulse rounded-xl bg-zinc-100 dark:bg-zinc-800" />
                    ))}
                  </div>
                ) : recentQuick.length === 0 ? (
                  <Link
                    href={SESSIONS_HUB_HREF}
                    onClick={onClose}
                    className="flex items-center justify-between rounded-xl border border-dashed border-zinc-300 px-4 py-4 text-left transition-colors hover:border-green-400 dark:border-zinc-700 dark:hover:border-green-600"
                  >
                    <div>
                      <p className="text-sm font-semibold text-zinc-900 dark:text-white">No sessions yet</p>
                      <p className="text-xs text-zinc-400 dark:text-zinc-500">Build your first session</p>
                    </div>
                    <ArrowRight className="h-4 w-4 shrink-0 text-green-600 dark:text-green-400" />
                  </Link>
                ) : (
                  <div className="space-y-1.5">
                    {recentQuick.map((log, i) => (
                      <button
                        key={`${log.title}-${log.date}-${i}`}
                        onClick={() => repeatRecent(log)}
                        disabled={busy}
                        className="flex w-full items-center justify-between rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-left transition-colors hover:border-green-400 disabled:opacity-50 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-green-600"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-zinc-900 dark:text-white">{log.title}</p>
                          <p className="text-xs text-zinc-400 dark:text-zinc-500">
                            {shortDate(log.date)} · {log.exerciseCount} exercise{log.exerciseCount !== 1 ? "s" : ""}
                          </p>
                        </div>
                        <span className="ml-3 shrink-0 text-xs font-semibold text-green-600 dark:text-green-400">
                          Repeat
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </section>

              {/* ── 2. Build your own → hub, builder already open ── */}
              <Link
                href={BUILD_SESSION_HREF}
                onClick={onClose}
                className="flex items-center justify-center gap-1.5 rounded-xl border border-zinc-200 py-3 text-sm font-semibold text-zinc-600 transition-colors hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                Build a custom session
                <ArrowRight className="h-4 w-4" />
              </Link>

              {/* ── 3. Quick start by focus (select → preview → start) ── */}
              <section>
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
                    Quick start by focus
                  </p>
                  {/* AI toggle */}
                  <button
                    type="button"
                    onClick={() => {
                      setUseAi((v) => !v);
                      // Reset the preview so the user re-taps a chip with the new setting
                      setPreview(null);
                      setSelectedFocus(null);
                      setAiUsed(false);
                    }}
                    disabled={busy}
                    className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                      useAi
                        ? "bg-purple-600 text-white"
                        : "border border-zinc-300 text-zinc-500 hover:border-purple-400 hover:text-purple-600 dark:border-zinc-700 dark:text-zinc-400 dark:hover:border-purple-600 dark:hover:text-purple-400"
                    }`}
                  >
                    <Sparkles className="h-3 w-3" />
                    {useAi ? "AI on" : "AI"}
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {QUICK_FOCUS_ORDER.map((k) => FOCUS_DEFS[k]).map((def) => {
                    const active = selectedFocus === def.key;
                    return (
                      <button
                        key={def.key}
                        onClick={() => generateFor(def.key)}
                        disabled={busy}
                        className={`flex items-center gap-1.5 rounded-2xl border px-3.5 py-2 text-left transition-colors disabled:opacity-50 ${
                          active
                            ? "border-green-500 bg-green-50 dark:border-green-600 dark:bg-green-950/30"
                            : "border-zinc-200 bg-zinc-50 hover:border-green-400 hover:bg-green-50/50 dark:border-zinc-700 dark:bg-zinc-800 dark:hover:border-green-600 dark:hover:bg-green-950/20"
                        }`}
                      >
                        {active && generating ? (
                          <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-green-600 dark:text-green-400" />
                        ) : (
                          <Dumbbell className="h-3.5 w-3.5 shrink-0 text-purple-500 dark:text-purple-400" />
                        )}
                        <span className="flex flex-col">
                          <span className="text-sm font-semibold text-zinc-900 dark:text-white">{def.label}</span>
                          <span className="text-[10px] text-zinc-400 dark:text-zinc-500">{def.blurb}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* Preview of the selected focus */}
                {selectedFocus && (
                  <div className="mt-3 rounded-2xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-800/50">
                    {generating ? (
                      <div className="flex items-center justify-center gap-2 py-6 text-sm text-zinc-500 dark:text-zinc-400">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        {useAi
                          ? `Generating your ${FOCUS_DEFS[selectedFocus].label.toLowerCase()} session with AI…`
                          : `Building your ${FOCUS_DEFS[selectedFocus].label.toLowerCase()} session…`}
                      </div>
                    ) : preview ? (
                      <>
                        <div className="mb-2 flex items-center justify-between">
                          <div className="flex items-center gap-1.5">
                            <p className="text-sm font-semibold text-zinc-900 dark:text-white">{preview.title}</p>
                            {aiUsed && (
                              <span className="inline-flex items-center gap-0.5 rounded-full bg-purple-100 px-1.5 py-0.5 text-[9px] font-semibold text-purple-700 dark:bg-purple-900/40 dark:text-purple-300">
                                <Sparkles className="h-2 w-2" />
                                AI
                              </span>
                            )}
                          </div>
                          <span className="text-xs text-zinc-400 dark:text-zinc-500">
                            {preview.exercises.length} exercises
                          </span>
                        </div>
                        <ul className="mb-3 space-y-1">
                          {preview.exercises.map((ex, idx) => (
                            <li
                              key={`${ex.exerciseSlug}-${idx}`}
                              className="flex items-center justify-between text-sm text-zinc-700 dark:text-zinc-300"
                            >
                              <span className="truncate">{ex.name}</span>
                              <span className="ml-3 shrink-0 text-xs text-zinc-400 dark:text-zinc-500">
                                {ex.sets} × {ex.reps || ex.duration || "—"}
                              </span>
                            </li>
                          ))}
                        </ul>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => generateFor(selectedFocus)}
                            disabled={busy}
                            className="flex items-center justify-center gap-1.5 rounded-xl border border-zinc-300 px-3 py-2.5 text-sm font-semibold text-zinc-700 transition-colors hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800"
                          >
                            <RefreshCw className="h-4 w-4" />
                            Regenerate
                          </button>
                          <ShareButton
                            kind="session"
                            session={{ title: preview.title, focus: preview.focus, exercises: preview.exercises }}
                            label=""
                            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-zinc-300 text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800"
                          />
                          <button
                            onClick={startPreview}
                            disabled={busy}
                            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-green-600 to-green-500 py-2.5 text-sm font-semibold text-white shadow-sm transition-all hover:from-green-700 hover:to-green-600 disabled:opacity-50"
                          >
                            <Dumbbell className="h-4 w-4" />
                            Start session
                          </button>
                        </div>
                      </>
                    ) : null}
                  </div>
                )}
              </section>
            </div>
          </motion.div>

          <UpgradeSheet open={!!gate} gate={gate} onClose={() => setGate(null)} />
        </>
      )}
    </AnimatePresence>
  );
}
