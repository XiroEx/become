"use client";

import { useRef, useState } from "react";
import { ArrowLeft, FileText, Loader2, PencilLine, Upload } from "lucide-react";
import { runAiTask } from "@/lib/ai/runClient";
import { normalizeImportedProgram, flagImportedProgram, type ImportedProgram } from "@/lib/workout/importProgram";

export interface ImportProgramFlowProps {
  onImported: (program: ImportedProgram) => void;
  onCancel: () => void;
}

type FlowState =
  | { step: "choose" }
  | { step: "paste"; text: string }
  | { step: "loading"; label: string }
  | { step: "error"; message: string };

const MAX_TEXT_FILE_BYTES = 200_000;

// Flags each exercise as new/broken/possibly-grouped for the review step
// (see lib/workout/importProgram.ts). Best-effort: if the lookup fails, the
// import still proceeds unflagged rather than blocking on it.
async function flagAgainstLibrary(program: ImportedProgram): Promise<ImportedProgram> {
  const names = Array.from(
    new Set(
      program.phases.flatMap((p) =>
        p.workouts.flatMap((w) => w.exercises.map((e) => e.name))
      )
    )
  );
  if (names.length === 0) return program;
  try {
    const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    const res = await fetch("/api/exercises/match", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ names }),
    });
    if (!res.ok) return program;
    const data = await res.json();
    const known = new Set<string>(Array.isArray(data.known) ? data.known : []);
    return flagImportedProgram(program, known);
  } catch {
    return program;
  }
}

export default function ImportProgramFlow({ onImported, onCancel }: ImportProgramFlowProps) {
  const [state, setState] = useState<FlowState>({ step: "choose" });
  const fileInputRef = useRef<HTMLInputElement>(null);

  const runImport = async (text: string) => {
    setState({ step: "loading", label: "Reading your program…" });
    try {
      const r = await runAiTask("/api/ai/workout/import", { text });
      const normalized = r.ok ? normalizeImportedProgram(r.result) : null;
      if (!normalized) {
        setState({
          step: "error",
          message: "Couldn't find a program in that. Try pasting the full text instead.",
        });
        return;
      }
      onImported(await flagAgainstLibrary(normalized));
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
    <div className="mx-auto max-w-2xl px-0 py-8 sm:px-6">
      <input
        ref={fileInputRef}
        type="file"
        accept=".txt,.md,text/plain,text/markdown"
        className="sr-only"
        onChange={handleFileChange}
        aria-hidden="true"
      />

      <button
        onClick={() => (state.step === "choose" ? onCancel() : setState({ step: "choose" }))}
        className="mb-6 flex items-center gap-2 text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-white"
      >
        <ArrowLeft className="h-4 w-4" />
        Back
      </button>

      {state.step === "choose" && (
        <div className="space-y-4">
          <div>
            <h1 className="text-2xl font-extrabold text-zinc-900 dark:text-white">
              Import your program
            </h1>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
              Already wrote your program somewhere else — Notes, a text file? Paste it in or
              upload it and we&apos;ll turn it into a program you can actually run in the app.
              You&apos;ll get a chance to review and edit before saving.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <button
              onClick={() => setState({ step: "paste", text: "" })}
              className="flex flex-col items-center gap-3 rounded-2xl border border-zinc-200 bg-white p-6 text-center transition-colors hover:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-600"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400">
                <PencilLine className="h-6 w-6" />
              </div>
              <div>
                <p className="text-sm font-semibold text-zinc-900 dark:text-white">Paste text</p>
                <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                  Copy from Notes and paste it in
                </p>
              </div>
            </button>

            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex flex-col items-center gap-3 rounded-2xl border border-zinc-200 bg-white p-6 text-center transition-colors hover:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-600"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400">
                <Upload className="h-6 w-6" />
              </div>
              <div>
                <p className="text-sm font-semibold text-zinc-900 dark:text-white">Upload a file</p>
                <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                  A .txt or .md file
                </p>
              </div>
            </button>
          </div>
        </div>
      )}

      {state.step === "paste" && (
        <div className="space-y-4">
          <div>
            <h1 className="text-2xl font-extrabold text-zinc-900 dark:text-white">Paste your program</h1>
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
              Paste it in as written — days, exercises, sets/reps, whatever you have. We&apos;ll
              keep it exactly as written.
            </p>
          </div>
          <textarea
            autoFocus
            value={state.text}
            onChange={(e) => setState({ step: "paste", text: e.target.value })}
            placeholder={"Day 1 - Push\nBench Press 4x8\nOverhead Press 3x10\n...\n\nDay 2 - Pull\n..."}
            rows={12}
            className="w-full rounded-xl border border-zinc-300 bg-white px-4 py-3 font-mono text-sm text-zinc-900 placeholder-zinc-400 focus:border-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
          />
          <button
            onClick={handlePasteSubmit}
            disabled={!state.text.trim()}
            className="w-full rounded-xl bg-zinc-900 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
          >
            Import program
          </button>
        </div>
      )}

      {state.step === "loading" && (
        <div className="flex flex-col items-center justify-center gap-4 py-20 text-center">
          <Loader2 className="h-8 w-8 animate-spin text-zinc-400" />
          <p className="text-sm text-zinc-600 dark:text-zinc-400">{state.label}</p>
        </div>
      )}

      {state.step === "error" && (
        <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400">
            <FileText className="h-6 w-6" />
          </div>
          <p className="max-w-sm text-sm text-zinc-600 dark:text-zinc-400">{state.message}</p>
          <button
            onClick={() => setState({ step: "choose" })}
            className="rounded-xl bg-zinc-900 px-6 py-2.5 text-sm font-semibold text-white hover:bg-zinc-800 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
          >
            Try again
          </button>
        </div>
      )}
    </div>
  );
}
