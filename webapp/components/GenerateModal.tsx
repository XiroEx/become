"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { X, Wand2, Loader2, RefreshCw, Dumbbell, Calendar, Sparkles } from "lucide-react";
import {
  FOCUS_DEFS,
  QUICK_FOCUS_ORDER,
  type FocusKey,
  type DraftSession,
  type DraftProgram,
  type DraftProgramDay,
} from "@/lib/quickSession/types";
import { stashQuickSession, quickSessionLiveHref } from "@/lib/quickSession/store";
import { draftProgramToProgramBody } from "@/lib/quickSession/generate";
import { runAiTask } from "@/lib/ai/runClient";
import { resolveAiExercises, MIN_RESOLVED_EXERCISES, type AiExerciseIn } from "@/lib/ai/resolveExercises";

// ─── Props ───────────────────────────────────────────────────────────────────

export interface GenerateModalProps {
  open: boolean;
  onClose: () => void;
}

// ─── Local config ─────────────────────────────────────────────────────────────

type Difficulty = "beginner" | "intermediate" | "advanced";
type Tab = "session" | "program";

const DIFFICULTIES: Difficulty[] = ["beginner", "intermediate", "advanced"];

// Curated equipment list (value → label).
const EQUIPMENT_OPTIONS: { value: string; label: string }[] = [
  { value: "barbell", label: "Barbell" },
  { value: "dumbbell", label: "Dumbbell" },
  { value: "kettlebell", label: "Kettlebell" },
  { value: "cable", label: "Cable" },
  { value: "smith_machine", label: "Smith" },
  { value: "leg_press", label: "Machines" },
  { value: "pull_up_bar", label: "Pull-up bar" },
  { value: "resistance_band", label: "Bands" },
  { value: "bodyweight", label: "Bodyweight" },
];

// ─── API response shapes ──────────────────────────────────────────────────────

interface SessionResponse {
  session: DraftSession;
  seed: number;
}

interface ProgramResponse {
  program: DraftProgram;
  seed: number;
}

interface CreatedProgram {
  program_id: string;
}

interface ErrorResponse {
  error?: string;
}

// AI session route response
interface AiSessionResponse {
  ok: boolean;
  fallback?: boolean;
  session?: {
    title?: string;
    focus?: string;
    exercises?: Array<{ name?: string; sets?: number; reps?: string | number; rest?: string }>;
  };
}

// AI program route response
interface AiProgramResponse {
  ok: boolean;
  fallback?: boolean;
  program?: {
    name?: string;
    description?: string;
    focus?: string;
    daysPerWeek?: number;
    weeks?: number;
    days?: Array<{
      day?: number;
      title?: string;
      focus?: string;
      exercises?: Array<{ name?: string; sets?: number; reps?: string | number; rest?: string }>;
    }>;
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function authHeaders(): HeadersInit {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${typeof window !== "undefined" ? localStorage.getItem("token") : ""}`,
  };
}

// ─── AI helpers ───────────────────────────────────────────────────────────────

// ─── Component ─────────────────────────────────────────────────────────────────

export default function GenerateModal({ open, onClose }: GenerateModalProps) {
  const router = useRouter();

  // Tabs
  const [activeTab, setActiveTab] = useState<Tab>("session");

  // Shared controls
  const [focus, setFocus] = useState<FocusKey>("full_body");
  const [difficulty, setDifficulty] = useState<Difficulty>("intermediate");
  const [equipment, setEquipment] = useState<string[]>([]);

  // Session controls
  const [exerciseCount, setExerciseCount] = useState<number>(5);
  const [includeCardio, setIncludeCardio] = useState<boolean>(false);

  // Program controls
  const [daysPerWeek, setDaysPerWeek] = useState<number>(3);
  const [weeks, setWeeks] = useState<number>(4);
  const [exercisesPerDay, setExercisesPerDay] = useState<number>(5);

  // Generated previews
  const [session, setSession] = useState<DraftSession | null>(null);
  const [program, setProgram] = useState<DraftProgram | null>(null);
  const [expandedDay, setExpandedDay] = useState<number | null>(0);

  // AI controls
  const [useAi, setUseAi] = useState<boolean>(false);
  const [aiPrompt, setAiPrompt] = useState<string>("");
  const [aiUsed, setAiUsed] = useState<boolean>(false); // was last generation AI-powered?

  // Async state
  const [loading, setLoading] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [upgradeNotice, setUpgradeNotice] = useState<string | null>(null);
  const [saved, setSaved] = useState<boolean>(false);

  // Reset preview/error state when the sheet opens/closes.
  useEffect(() => {
    if (!open) return;
    setSession(null);
    setProgram(null);
    setError(null);
    setUpgradeNotice(null);
    setSaved(false);
    setLoading(false);
    setSaving(false);
    setAiUsed(false);
  }, [open]);

  // Reset preview/error state when switching tabs.
  const switchTab = useCallback((tab: Tab) => {
    setActiveTab(tab);
    setSession(null);
    setProgram(null);
    setError(null);
    setUpgradeNotice(null);
    setSaved(false);
    setAiUsed(false);
  }, []);

  const toggleEquipment = useCallback((value: string) => {
    setEquipment((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value],
    );
  }, []);

  // ─── Generate session ──────────────────────────────────────────────────────

  const generateSession = useCallback(async () => {
    setLoading(true);
    setError(null);
    setAiUsed(false);
    const headers = authHeaders();

    // ── AI path (when toggled) ────────────────────────────────────────────────
    if (useAi) {
      try {
        const equipmentStr = equipment.length ? equipment.join(", ") : undefined;
        const focusDef = FOCUS_DEFS[focus];
        // Async run: POST returns a runId, runAiTask polls until the session lands.
        const r = await runAiTask("/api/ai/workout/session", {
          prompt: aiPrompt.trim() || undefined,
          focus: focusDef.label,
          equipment: equipmentStr,
          level: difficulty,
        });
        const aiSession = r.result as AiSessionResponse["session"] | undefined;
        if (r.ok && aiSession?.exercises?.length) {
          const { exercises, matched } = await resolveAiExercises(aiSession.exercises, headers);
          // Only use the AI session if enough exercises resolved to REAL library
          // entries; otherwise fall through so the user never sees a thin / janky set.
          if (matched >= MIN_RESOLVED_EXERCISES) {
            setSession({
              title: aiSession.title || `${focusDef.label} Session`,
              focus,
              exercises,
            });
            setAiUsed(true);
            setLoading(false);
            return;
          }
        }
        // AI returned ok:false, empty, or too few real exercises — fall through to deterministic
      } catch {
        // Network / parse error — fall through to deterministic
      }
    }

    // ── Deterministic fallback (always works) ─────────────────────────────────
    try {
      const res = await fetch("/api/generate/session", {
        method: "POST",
        headers,
        body: JSON.stringify({
          focus,
          difficulty,
          equipment: equipment.length ? equipment : undefined,
          exerciseCount,
          includeCardio,
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as ErrorResponse;
        setError(data.error || "Could not generate a session. Try again.");
        return;
      }
      const data = (await res.json()) as SessionResponse;
      setSession(data.session);
    } catch {
      setError("Network error. Try again.");
    } finally {
      setLoading(false);
    }
  }, [focus, difficulty, equipment, exerciseCount, includeCardio, useAi, aiPrompt]);

  const startSession = useCallback(() => {
    if (!session) return;
    const id = stashQuickSession(session);
    router.push(quickSessionLiveHref(id));
    onClose();
  }, [session, router, onClose]);

  // ─── Generate program ──────────────────────────────────────────────────────

  const generateProgram = useCallback(async () => {
    setLoading(true);
    setError(null);
    setUpgradeNotice(null);
    setSaved(false);
    setAiUsed(false);
    const headers = authHeaders();

    // ── AI path (when toggled) ────────────────────────────────────────────────
    if (useAi) {
      try {
        const focusDef = FOCUS_DEFS[focus];
        const equipmentStr = equipment.length ? equipment.join(", ") : undefined;
        const goal = aiPrompt.trim() || `${focusDef.label} training`;
        // Async run: POST returns a runId, runAiTask polls until the program lands.
        const r = await runAiTask("/api/ai/workout/program", {
          goal,
          daysPerWeek,
          weeks,
          level: difficulty,
          equipment: equipmentStr,
        });
        {
          const p = r.result as AiProgramResponse["program"] | undefined;
          if (r.ok && p?.days?.length) {
            // Resolve all exercises across all days in parallel (unmatched dropped).
            const resolvedDays = await Promise.all(
              (p.days ?? []).map(async (d, i): Promise<DraftProgramDay> => {
                const { exercises } = await resolveAiExercises(
                  (d.exercises ?? []) as AiExerciseIn[],
                  headers,
                );
                return {
                  day: `Day ${typeof d.day === "number" ? d.day : i + 1}`,
                  title: d.title ?? `Day ${i + 1}`,
                  focus: focus, // keep the user's chosen focus as the DraftProgramDay focus
                  exercises,
                };
              }),
            );

            // Drop days left empty after dropping unmatched exercises, and only
            // accept the AI program if it's substantial enough to not look broken.
            const days = resolvedDays.filter((d) => d.exercises.length > 0);
            const totalExercises = days.reduce((n, d) => n + d.exercises.length, 0);
            if (days.length >= 2 && totalExercises >= MIN_RESOLVED_EXERCISES) {
              const draftProgram: DraftProgram = {
                name: p.name || `${FOCUS_DEFS[focus].label} ${daysPerWeek}-Day Program`,
                description:
                  p.description ||
                  `An AI-generated ${weeks}-week, ${daysPerWeek}-day program.`,
                focus,
                daysPerWeek: p.daysPerWeek ?? days.length,
                weeks: p.weeks ?? weeks,
                days,
              };
              setProgram(draftProgram);
              setExpandedDay(0);
              setAiUsed(true);
              setLoading(false);
              return;
            }
          }
        }
        // AI returned ok:false, empty, or too thin — fall through to deterministic
      } catch {
        // Network / parse error — fall through to deterministic
      }
    }

    // ── Deterministic fallback (always works) ─────────────────────────────────
    try {
      const res = await fetch("/api/generate/program", {
        method: "POST",
        headers,
        body: JSON.stringify({
          focus,
          difficulty,
          equipment: equipment.length ? equipment : undefined,
          daysPerWeek,
          weeks,
          exercisesPerDay,
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as ErrorResponse;
        setError(data.error || "Could not generate a program. Try again.");
        return;
      }
      const data = (await res.json()) as ProgramResponse;
      setProgram(data.program);
      setExpandedDay(0);
    } catch {
      setError("Network error. Try again.");
    } finally {
      setLoading(false);
    }
  }, [focus, difficulty, equipment, daysPerWeek, weeks, exercisesPerDay, useAi, aiPrompt]);

  const saveProgram = useCallback(async () => {
    if (!program) return;
    setSaving(true);
    setError(null);
    setUpgradeNotice(null);
    try {
      const body = draftProgramToProgramBody(program, difficulty);
      const res = await fetch("/api/programs/custom", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify(body),
      });
      if (res.status === 201) {
        const created = (await res.json()) as CreatedProgram;
        setSaved(true);
        router.push(`/dashboard/workout/${created.program_id}`);
        onClose();
        return;
      }
      const data = (await res.json().catch(() => ({}))) as ErrorResponse;
      if (res.status === 402 || res.status === 403) {
        setUpgradeNotice(
          data.error || "Saving generated programs requires a premium plan.",
        );
      } else {
        setError(data.error || "Could not save the program. Try again.");
      }
    } catch {
      setError("Network error. Try again.");
    } finally {
      setSaving(false);
    }
  }, [program, difficulty, router, onClose]);

  // ─── Render ──────────────────────────────────────────────────────────────────

  const chipBase =
    "rounded-full px-3 py-1.5 text-sm font-medium transition-colors border";

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            key="generate-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-[200] bg-black/50 backdrop-blur-sm"
          />

          {/* Sheet */}
          <motion.div
            key="generate-sheet"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
            onClick={(e) => e.stopPropagation()}
            className="fixed inset-x-0 bottom-0 z-[201] max-h-[90vh] overflow-y-auto rounded-t-2xl bg-white dark:bg-zinc-900"
          >
            {/* Grab handle */}
            <div className="sticky top-0 z-10 bg-white dark:bg-zinc-900 pt-2">
              <div className="mx-auto h-1.5 w-10 rounded-full bg-zinc-300 dark:bg-zinc-700" />

              {/* Header */}
              <div className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-purple-600/10 text-purple-600 dark:text-purple-400">
                    <Wand2 className="h-4.5 w-4.5" />
                  </span>
                  <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-50">
                    Generate
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close"
                  className="flex h-9 w-9 items-center justify-center rounded-full text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            <div className="px-4 pb-[calc(env(safe-area-inset-bottom)+1.5rem)]">
              {/* Tab control */}
              <div className="mb-5 grid grid-cols-2 gap-1 rounded-2xl bg-zinc-100 p-1 dark:bg-zinc-800">
                <button
                  type="button"
                  onClick={() => switchTab("session")}
                  className={`flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold transition-colors ${
                    activeTab === "session"
                      ? "bg-white text-purple-600 shadow-sm dark:bg-zinc-900 dark:text-purple-400"
                      : "text-zinc-500 dark:text-zinc-400"
                  }`}
                >
                  <Dumbbell className="h-4 w-4" />
                  Session
                </button>
                <button
                  type="button"
                  onClick={() => switchTab("program")}
                  className={`flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold transition-colors ${
                    activeTab === "program"
                      ? "bg-white text-purple-600 shadow-sm dark:bg-zinc-900 dark:text-purple-400"
                      : "text-zinc-500 dark:text-zinc-400"
                  }`}
                >
                  <Calendar className="h-4 w-4" />
                  Program
                </button>
              </div>

              {/* ── Shared controls ── */}

              {/* Focus */}
              <div className="mb-5">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                  Focus
                </p>
                <div className="flex flex-wrap gap-2">
                  {QUICK_FOCUS_ORDER.map((k) => FOCUS_DEFS[k]).map((def) => {
                    const selected = focus === def.key;
                    return (
                      <button
                        key={def.key}
                        type="button"
                        onClick={() => setFocus(def.key)}
                        className={`${chipBase} ${
                          selected
                            ? "border-purple-600 bg-purple-600 text-white"
                            : "border-zinc-200 bg-zinc-50 text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                        }`}
                      >
                        {def.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Difficulty */}
              <div className="mb-5">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                  Difficulty
                </p>
                <div className="grid grid-cols-3 gap-1 rounded-2xl bg-zinc-100 p-1 dark:bg-zinc-800">
                  {DIFFICULTIES.map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => setDifficulty(d)}
                      className={`rounded-xl px-2 py-2 text-sm font-medium capitalize transition-colors ${
                        difficulty === d
                          ? "bg-white text-purple-600 shadow-sm dark:bg-zinc-900 dark:text-purple-400"
                          : "text-zinc-500 dark:text-zinc-400"
                      }`}
                    >
                      {d}
                    </button>
                  ))}
                </div>
              </div>

              {/* Equipment */}
              <div className="mb-6">
                <div className="mb-2 flex items-baseline justify-between">
                  <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                    Equipment
                  </p>
                  {equipment.length === 0 && (
                    <span className="text-xs text-zinc-400 dark:text-zinc-500">
                      Any equipment
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  {EQUIPMENT_OPTIONS.map((opt) => {
                    const selected = equipment.includes(opt.value);
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => toggleEquipment(opt.value)}
                        className={`${chipBase} ${
                          selected
                            ? "border-purple-600 bg-purple-600 text-white"
                            : "border-zinc-200 bg-zinc-50 text-zinc-700 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                        }`}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* ── Tab-specific controls ── */}

              {activeTab === "session" ? (
                <div className="space-y-5">
                  {/* Exercise count */}
                  <div>
                    <div className="mb-2 flex items-center justify-between">
                      <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                        Exercises
                      </p>
                      <span className="text-sm font-bold text-purple-600 dark:text-purple-400">
                        {exerciseCount}
                      </span>
                    </div>
                    <input
                      type="range"
                      min={3}
                      max={10}
                      step={1}
                      value={exerciseCount}
                      onChange={(e) => setExerciseCount(Number(e.target.value))}
                      className="w-full accent-purple-600"
                    />
                  </div>

                  {/* Cardio finisher */}
                  <button
                    type="button"
                    onClick={() => setIncludeCardio((v) => !v)}
                    className="flex w-full items-center justify-between rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 text-left dark:border-zinc-700 dark:bg-zinc-800"
                  >
                    <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">
                      Cardio finisher
                    </span>
                    <span
                      className={`relative h-6 w-11 rounded-full transition-colors ${
                        includeCardio
                          ? "bg-purple-600"
                          : "bg-zinc-300 dark:bg-zinc-600"
                      }`}
                    >
                      <span
                        className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                          includeCardio ? "translate-x-5" : "translate-x-0.5"
                        }`}
                      />
                    </span>
                  </button>

                  {/* Generate button */}
                  <button
                    type="button"
                    onClick={generateSession}
                    disabled={loading}
                    className="flex w-full items-center justify-center gap-2 rounded-2xl bg-purple-600 px-4 py-3.5 text-sm font-semibold text-white transition-colors hover:bg-purple-700 disabled:opacity-60"
                  >
                    {loading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : useAi ? (
                      <Sparkles className="h-4 w-4" />
                    ) : (
                      <Wand2 className="h-4 w-4" />
                    )}
                    {loading
                      ? useAi
                        ? "Generating your session…"
                        : "Generating…"
                      : useAi
                      ? "✨ Generate with AI"
                      : "Generate session"}
                  </button>

                  {/* Session preview */}
                  {session && (
                    <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-800/50">
                      <div className="mb-1 flex items-center gap-2">
                        <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-50">
                          {session.title}
                        </h3>
                        {aiUsed && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-semibold text-purple-700 dark:bg-purple-900/40 dark:text-purple-300">
                            <Sparkles className="h-2.5 w-2.5" />
                            AI
                          </span>
                        )}
                      </div>
                      <ul className="space-y-2">
                        {session.exercises.map((ex, i) => (
                          <li
                            key={`${ex.exerciseSlug}-${i}`}
                            className="flex items-center justify-between gap-3 text-sm"
                          >
                            <span className="text-zinc-800 dark:text-zinc-200">
                              {ex.name}
                            </span>
                            <span className="shrink-0 text-zinc-500 dark:text-zinc-400">
                              {ex.sets} × {ex.reps || ex.duration || "—"}
                            </span>
                          </li>
                        ))}
                      </ul>

                      <div className="mt-4 flex gap-2">
                        <button
                          type="button"
                          onClick={generateSession}
                          disabled={loading}
                          className="flex items-center justify-center gap-2 rounded-2xl border border-zinc-300 px-4 py-3 text-sm font-semibold text-zinc-700 transition-colors hover:bg-zinc-100 disabled:opacity-60 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800"
                        >
                          {loading ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <RefreshCw className="h-4 w-4" />
                          )}
                          Regenerate
                        </button>
                        <button
                          type="button"
                          onClick={startSession}
                          className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-purple-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-purple-700"
                        >
                          Start session
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-5">
                  {/* Days per week */}
                  <div>
                    <div className="mb-2 flex items-center justify-between">
                      <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                        Days per week
                      </p>
                      <span className="text-sm font-bold text-purple-600 dark:text-purple-400">
                        {daysPerWeek}
                      </span>
                    </div>
                    <input
                      type="range"
                      min={2}
                      max={6}
                      step={1}
                      value={daysPerWeek}
                      onChange={(e) => setDaysPerWeek(Number(e.target.value))}
                      className="w-full accent-purple-600"
                    />
                  </div>

                  {/* Weeks */}
                  <div>
                    <div className="mb-2 flex items-center justify-between">
                      <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                        Weeks
                      </p>
                      <span className="text-sm font-bold text-purple-600 dark:text-purple-400">
                        {weeks}
                      </span>
                    </div>
                    <input
                      type="range"
                      min={2}
                      max={12}
                      step={1}
                      value={weeks}
                      onChange={(e) => setWeeks(Number(e.target.value))}
                      className="w-full accent-purple-600"
                    />
                  </div>

                  {/* Exercises per day */}
                  <div>
                    <div className="mb-2 flex items-center justify-between">
                      <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                        Exercises per day
                      </p>
                      <span className="text-sm font-bold text-purple-600 dark:text-purple-400">
                        {exercisesPerDay}
                      </span>
                    </div>
                    <input
                      type="range"
                      min={3}
                      max={8}
                      step={1}
                      value={exercisesPerDay}
                      onChange={(e) => setExercisesPerDay(Number(e.target.value))}
                      className="w-full accent-purple-600"
                    />
                  </div>

                  {/* Generate button */}
                  <button
                    type="button"
                    onClick={generateProgram}
                    disabled={loading}
                    className="flex w-full items-center justify-center gap-2 rounded-2xl bg-purple-600 px-4 py-3.5 text-sm font-semibold text-white transition-colors hover:bg-purple-700 disabled:opacity-60"
                  >
                    {loading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : useAi ? (
                      <Sparkles className="h-4 w-4" />
                    ) : (
                      <Wand2 className="h-4 w-4" />
                    )}
                    {loading
                      ? useAi
                        ? "Generating your program…"
                        : "Generating…"
                      : useAi
                      ? "✨ Generate with AI"
                      : "Generate program"}
                  </button>

                  {/* Program preview */}
                  {program && (
                    <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-800/50">
                      <div className="mb-0.5 flex items-center gap-2">
                        <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-50">
                          {program.name}
                        </h3>
                        {aiUsed && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-purple-100 px-2 py-0.5 text-[10px] font-semibold text-purple-700 dark:bg-purple-900/40 dark:text-purple-300">
                            <Sparkles className="h-2.5 w-2.5" />
                            AI
                          </span>
                        )}
                      </div>
                      <p className="mb-3 mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
                        {program.weeks} weeks · {program.daysPerWeek} days/week
                      </p>

                      <div className="space-y-2">
                        {program.days.map((day, i) => {
                          const isOpen = expandedDay === i;
                          return (
                            <div
                              key={`${day.day}-${i}`}
                              className="overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-700"
                            >
                              <button
                                type="button"
                                onClick={() =>
                                  setExpandedDay(isOpen ? null : i)
                                }
                                className="flex w-full items-center justify-between gap-2 bg-white px-3 py-2.5 text-left dark:bg-zinc-900"
                              >
                                <span className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">
                                  {day.day}
                                  <span className="ml-2 font-normal text-zinc-500 dark:text-zinc-400">
                                    {day.title}
                                  </span>
                                </span>
                                <span className="text-xs text-zinc-400 dark:text-zinc-500">
                                  {day.exercises.length} ex
                                </span>
                              </button>
                              {isOpen && (
                                <ul className="space-y-1.5 bg-zinc-50 px-3 py-2.5 dark:bg-zinc-800/50">
                                  {day.exercises.map((ex, j) => (
                                    <li
                                      key={`${ex.exerciseSlug}-${j}`}
                                      className="flex items-center justify-between gap-3 text-sm"
                                    >
                                      <span className="text-zinc-700 dark:text-zinc-300">
                                        {ex.name}
                                      </span>
                                      <span className="shrink-0 text-zinc-500 dark:text-zinc-400">
                                        {ex.sets} × {ex.reps || ex.duration || "—"}
                                      </span>
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </div>
                          );
                        })}
                      </div>

                      {upgradeNotice && (
                        <div className="mt-3 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2.5 text-sm text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300">
                          {upgradeNotice}
                        </div>
                      )}

                      {saved && (
                        <div className="mt-3 rounded-xl border border-green-300 bg-green-50 px-3 py-2.5 text-sm text-green-800 dark:border-green-500/40 dark:bg-green-500/10 dark:text-green-300">
                          Program saved! Opening…
                        </div>
                      )}

                      <div className="mt-4 flex gap-2">
                        <button
                          type="button"
                          onClick={generateProgram}
                          disabled={loading || saving}
                          className="flex items-center justify-center gap-2 rounded-2xl border border-zinc-300 px-4 py-3 text-sm font-semibold text-zinc-700 transition-colors hover:bg-zinc-100 disabled:opacity-60 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-800"
                        >
                          {loading ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <RefreshCw className="h-4 w-4" />
                          )}
                          Regenerate
                        </button>
                        <button
                          type="button"
                          onClick={saveProgram}
                          disabled={saving || saved}
                          className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-purple-600 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-purple-700 disabled:opacity-60"
                        >
                          {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                          {saving ? "Saving…" : "Save program"}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Error (non-upgrade) */}
              {error && (
                <div className="mt-4 rounded-xl border border-red-300 bg-red-50 px-3 py-2.5 text-sm text-red-700 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-300">
                  {error}
                </div>
              )}

              {/* ── AI toggle + prompt ── */}
              <div className="mt-7 rounded-2xl border border-purple-200 bg-purple-50/60 p-4 dark:border-purple-800/50 dark:bg-purple-950/20">
                <div className="mb-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                    <span className="text-sm font-semibold text-purple-700 dark:text-purple-300">
                      Generate with AI
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setUseAi((v) => !v)}
                    aria-label={useAi ? "Disable AI generation" : "Enable AI generation"}
                    className={`relative h-6 w-11 rounded-full transition-colors ${
                      useAi ? "bg-purple-600" : "bg-zinc-300 dark:bg-zinc-600"
                    }`}
                  >
                    <span
                      className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                        useAi ? "translate-x-5" : "translate-x-0.5"
                      }`}
                    />
                  </button>
                </div>
                <textarea
                  rows={2}
                  disabled={!useAi || loading}
                  value={aiPrompt}
                  onChange={(e) => setAiPrompt(e.target.value)}
                  placeholder={
                    activeTab === "session"
                      ? "Describe your ideal session… e.g. “a 30-min chest + shoulders burnout”"
                      : "Describe your goal… e.g. “build strength for a first powerlifting meet”"
                  }
                  className={`w-full resize-none rounded-xl border px-3 py-2.5 text-sm transition-colors ${
                    useAi
                      ? "border-purple-300 bg-white text-zinc-900 placeholder:text-zinc-400 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-500 dark:border-purple-700 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-500"
                      : "cursor-not-allowed border-zinc-200 bg-zinc-100 text-zinc-400 placeholder:text-zinc-400 dark:border-zinc-700 dark:bg-zinc-800/50 dark:text-zinc-500"
                  }`}
                />
                {useAi && (
                  <p className="mt-1.5 text-[11px] text-purple-500 dark:text-purple-400">
                    AI generates first (~30-40 s); falls back to the standard builder automatically.
                  </p>
                )}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
