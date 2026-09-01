"use client";

import { useState } from "react";
import Link from "next/link";
import { Sparkles, Lock, PencilLine, Upload } from "lucide-react";
import ProgramCreator from "@/app/dashboard/admin/programs/_editors/ProgramCreator";
import PageTransition from "@/components/PageTransition";
import ImportProgramFlow from "./ImportProgramFlow";
import type { ImportedProgram } from "@/lib/workout/importProgram";
import { useEntitlements } from "@/hooks/useEntitlements";
import UpgradeSheet from "@/components/UpgradeSheet";
import { syntheticGate, tierLabel, type GatePayload, type Tier } from "@/lib/entitlementsClient";

const USER_CREATE_DRAFT_KEY = "become_user_program_creator_draft";

type EntryMode = "choose" | "scratch" | "import";

export default function NewProgramClient() {
  const { data, loading, feature } = useEntitlements();
  const [entryMode, setEntryMode] = useState<EntryMode>("choose");
  const [imported, setImported] = useState<ImportedProgram | null>(null);
  const [gate, setGate] = useState<GatePayload | null>(null);

  const ent = feature('custom-programs');
  const requiresTier: Tier = ent?.requiresTier ?? 'plus';
  // canCreate, NOT allowed: a free member IS allowed to touch custom programs
  // (they can edit and delete the ones they have) — the question this page asks
  // is whether they may build ANOTHER one.
  const canCreate = !data || data.enforced === false || ent?.canCreate !== false;

  if (loading && !data) {
    return (
      <PageTransition className="pb-6">
        <div className="mx-auto max-w-3xl px-0 py-12 sm:px-6">
          <div className="h-8 w-64 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" />
          <div className="mt-4 h-32 animate-pulse rounded-2xl bg-zinc-100 dark:bg-zinc-900" />
        </div>
      </PageTransition>
    );
  }

  if (!canCreate) {
    return (
      <PageTransition className="pb-6">
        <div className="mx-auto max-w-2xl px-0 py-12 sm:px-6">
          <div className="text-center sm:rounded-xl sm:border sm:border-zinc-200 sm:bg-white sm:p-8 dark:sm:border-zinc-800 dark:sm:bg-zinc-900">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-purple-500 to-indigo-500 text-white">
              <Sparkles className="h-8 w-8" />
            </div>
            <h1 className="mt-6 text-2xl font-extrabold text-zinc-900 dark:text-white">
              Custom Programs are a {tierLabel(requiresTier)} feature
            </h1>
            <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
              Build your own multi-phase training program — pick the exercises, prescribe the
              sets and reps, and follow it just like a coach-built program.
            </p>

            <div className="mt-8 grid gap-3 text-left">
              <div className="flex items-start gap-3 rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400">✓</span>
                <div>
                  <p className="text-sm font-semibold text-zinc-900 dark:text-white">Multi-phase periodization</p>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">Design progression across weeks</p>
                </div>
              </div>
              <div className="flex items-start gap-3 rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400">✓</span>
                <div>
                  <p className="text-sm font-semibold text-zinc-900 dark:text-white">Pull from the full exercise library</p>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">Or use your own custom exercises</p>
                </div>
              </div>
              <div className="flex items-start gap-3 rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400">✓</span>
                <div>
                  <p className="text-sm font-semibold text-zinc-900 dark:text-white">Track every set with the live workout view</p>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">Same engine as our coach-built programs</p>
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setGate(syntheticGate('custom-programs', requiresTier))}
              className="mt-8 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition-all hover:from-purple-700 hover:to-indigo-700"
            >
              <Lock className="h-4 w-4" />
              Upgrade to {tierLabel(requiresTier)}
            </button>

            <div className="mt-4">
              <Link
                href="/dashboard/workout"
                className="text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
              >
                Back to Programs
              </Link>
            </div>
          </div>
        </div>

        <UpgradeSheet open={!!gate} gate={gate} onClose={() => setGate(null)} />
      </PageTransition>
    );
  }

  if (entryMode === "import" && !imported) {
    return (
      <PageTransition className="pb-6">
        <ImportProgramFlow
          onImported={(program) => {
            // A stale scratch draft in localStorage would otherwise overwrite
            // this imported program the moment ProgramCreator mounts (its
            // create-mode effect restores any saved draft on mount).
            try {
              localStorage.removeItem(USER_CREATE_DRAFT_KEY);
            } catch {
              // ignore storage errors (e.g. private browsing)
            }
            setImported(program);
          }}
          onCancel={() => setEntryMode("choose")}
        />
      </PageTransition>
    );
  }

  if (entryMode === "scratch" || (entryMode === "import" && imported)) {
    return <ProgramCreator mode="user-create" initialProgram={imported ?? undefined} />;
  }

  return (
    <PageTransition className="pb-6">
      <div className="mx-auto max-w-2xl px-0 py-12 sm:px-6">
        <h1 className="text-2xl font-extrabold text-zinc-900 dark:text-white sm:text-3xl">
          Create a program
        </h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Start from a blank program, or import one you already wrote.
        </p>

        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          <button
            onClick={() => setEntryMode("scratch")}
            className="flex flex-col items-start gap-3 rounded-2xl border border-zinc-200 bg-white p-6 text-left transition-colors hover:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-600"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
              <PencilLine className="h-6 w-6" />
            </div>
            <div>
              <p className="text-base font-semibold text-zinc-900 dark:text-white">Start from scratch</p>
              <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                Build it step by step in the editor
              </p>
            </div>
          </button>

          <button
            onClick={() => setEntryMode("import")}
            className="flex flex-col items-start gap-3 rounded-2xl border border-zinc-200 bg-white p-6 text-left transition-colors hover:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-600"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400">
              <Upload className="h-6 w-6" />
            </div>
            <div>
              <p className="text-base font-semibold text-zinc-900 dark:text-white">Import a program</p>
              <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                Paste text, or upload a file
              </p>
            </div>
          </button>
        </div>
      </div>
    </PageTransition>
  );
}
