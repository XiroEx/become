"use client";

// Paste/upload import for a single quick session — the Sessions-tab analog of
// ImportProgramFlow (app/dashboard/programs/new/ImportProgramFlow.tsx). Reuses
// the SAME AI extraction task (workoutImportText via /api/ai/workout/import,
// see lib/ai/becomeGraph.ts) rather than registering a new one: a single
// pasted workout still fits that task's "program" schema as one phase/one
// workout, and lib/quickSession/importSession.ts flattens whatever comes back
// into one exercise list. Kept inline/compact (no separate "choose" screen)
// since this renders inside the Sessions tab's builder panel, not a full page.

import { useRef, useState } from "react";
import { FileText, Loader2, Upload } from "lucide-react";
import { runAiTask } from "@/lib/ai/runClient";
import {
  normalizeImportedSession,
  resolveImportedSession,
  type ResolvableExercise,
  type ResolvedImportedSession,
} from "@/lib/quickSession/importSession";

export interface ImportSessionFlowProps {
  onImported: (draft: ResolvedImportedSession) => void;
  onCancel: () => void;
}

type FlowState =
  | { step: "paste"; text: string }
  | { step: "loading"; label: string }
  | { step: "error"; message: string };

const MAX_TEXT_FILE_BYTES = 200_000;

function authHeaders(): HeadersInit {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${typeof window !== "undefined" ? localStorage.getItem("token") ?? "" : ""}`,
  };
}

// Builds a name → exercise index from the caller's own custom exercises plus
// one /api/exercises/search lookup per parsed name (small counts — a pasted
// workout is a handful of exercises, not hundreds). Exact-name matches only;
// resolveImportedSession() does the actual matching against this index.
async function buildLibraryIndex(names: string[]): Promise<Map<string, ResolvableExercise>> {
  const headers = authHeaders();
  const [customRes, ...searchResults] = await Promise.all([
    fetch("/api/exercises/custom", { headers }),
    ...names.map((name) => fetch(`/api/exercises/search?q=${encodeURIComponent(name)}&limit=5`, { headers })),
  ]);

  const known = new Map<string, ResolvableExercise>();
  if (customRes.ok) {
    const data = (await customRes.json().catch(() => ({}))) as { exercises?: ResolvableExercise[] };
    for (const e of data.exercises ?? []) known.set(e.name.trim().toLowerCase(), e);
  }
  for (const res of searchResults) {
    if (!res.ok) continue;
    const data = (await res.json().catch(() => ({}))) as { exercises?: ResolvableExercise[] };
    for (const e of data.exercises ?? []) {
      const key = e.name.trim().toLowerCase();
      if (!known.has(key)) known.set(key, e);
    }
  }
  return known;
}

export default function ImportSessionFlow({ onImported, onCancel }: ImportSessionFlowProps) {
  const [state, setState] = useState<FlowState>({ step: "paste", text: "" });
  const fileInputRef = useRef<HTMLInputElement>(null);

  const runImport = async (text: string) => {
    setState({ step: "loading", label: "Reading your session…" });
    try {
      const r = await runAiTask("/api/ai/workout/import", { text }, { label: "Reading your session…" });
      const parsed = r.ok ? normalizeImportedSession(r.result) : null;
      if (!parsed) {
        setState({
          step: "error",
          message: "Couldn't find a workout in that. Try pasting the full text instead.",
        });
        return;
      }
      const names = Array.from(new Set(parsed.exercises.map((e) => e.name)));
      const known = await buildLibraryIndex(names);
      onImported(resolveImportedSession(parsed, known));
    } catch {
      setState({ step: "error", message: "Couldn't reach the import AI. Try again in a minute." });
    }
  };

  const handleTextFile = async (file: File) => {
    if (file.size > MAX_TEXT_FILE_BYTES) {
      setState({ step: "error", message: "That file is too large. Try pasting the text instead." });
      return;
    }
    try {
      const text = await file.text();
      if (!text.trim()) {
        setState({ step: "error", message: "That file looks empty." });
        return;
      }
      await runImport(text);
    } catch {
      setState({ step: "error", message: "Could not read that file. Please try again." });
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    void handleTextFile(file);
  };

  const handlePasteSubmit = () => {
    if (state.step !== "paste") return;
    const t = state.text.trim();
    if (!t) return;
    void runImport(t);
  };

  return (
    <div>
      <input
        ref={fileInputRef}
        type="file"
        accept=".txt,.md,text/plain,text/markdown"
        className="sr-only"
        onChange={handleFileChange}
        aria-hidden="true"
      />

      {state.step === "paste" && (
        <div className="space-y-3">
          <textarea
            autoFocus
            value={state.text}
            onChange={(e) => setState({ step: "paste", text: e.target.value })}
            placeholder={"Bench Press 4x8\nOverhead Press 3x10\nLat Pulldown 3x12\n..."}
            rows={8}
            className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 font-mono text-sm text-zinc-900 placeholder-zinc-400 focus:border-green-500 focus:outline-none focus:ring-2 focus:ring-green-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
          />
          <div className="flex items-center gap-2">
            <button
              onClick={handlePasteSubmit}
              disabled={!state.text.trim()}
              className="flex-1 rounded-xl bg-green-600 px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Import session
            </button>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              title="Upload a .txt or .md file"
              aria-label="Upload a file instead"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-zinc-200 text-zinc-500 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800"
            >
              <Upload className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {state.step === "loading" && (
        <div className="flex flex-col items-center justify-center gap-3 py-10 text-center">
          <Loader2 className="h-7 w-7 animate-spin text-zinc-400" />
          <p className="text-sm text-zinc-600 dark:text-zinc-400">{state.label}</p>
        </div>
      )}

      {state.step === "error" && (
        <div className="flex flex-col items-center justify-center gap-3 py-8 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400">
            <FileText className="h-5 w-5" />
          </div>
          <p className="max-w-sm text-sm text-zinc-600 dark:text-zinc-400">{state.message}</p>
          <div className="flex gap-2">
            <button
              onClick={() => setState({ step: "paste", text: "" })}
              className="rounded-xl bg-zinc-900 px-5 py-2 text-sm font-semibold text-white hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
            >
              Try again
            </button>
            <button
              onClick={onCancel}
              className="rounded-xl border border-zinc-200 px-5 py-2 text-sm font-medium text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
