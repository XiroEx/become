"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2, Play, ArrowLeft, Share2, Lock } from "lucide-react";
import PageTransition from "@/components/PageTransition";
import { Card, EmptyState } from "@/components/ui";
import NewProgramClient from "@/app/dashboard/programs/new/NewProgramClient";
import ShareProgramModal from "./ShareProgramModal";
import { useEntitlements } from "@/hooks/useEntitlements";
import UpgradeSheet from "@/components/UpgradeSheet";
import { syntheticGate, type GatePayload } from "@/lib/entitlementsClient";

interface CustomProgramSummary {
  program_id: string;
  name: string;
  description?: string;
  duration_weeks: number;
  training_days_per_week: number;
  goal: string;
  target_user: string;
  tags?: string[];
  // Set server-side (see GET /api/programs/custom): false when this program
  // was shared with the viewer by a trainer/admin rather than owned by them.
  isOwner?: boolean;
  sharedByName?: string;
}

interface MyProgramsClientProps {
  /** Embedded inside the Workout hub — drop the page chrome (wrapper + header). */
  embedded?: boolean;
}

export default function MyProgramsClient({ embedded }: MyProgramsClientProps = {}) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [programs, setPrograms] = useState<CustomProgramSummary[]>([]);
  const [enrollingId, setEnrollingId] = useState<string | null>(null);
  // Embedded (hub) only: reveal the program creator inline instead of navigating.
  const [showCreate, setShowCreate] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shareTarget, setShareTarget] = useState<CustomProgramSummary | null>(null);
  const [gate, setGate] = useState<GatePayload | null>(null);

  // One shared entitlements snapshot (this used to be a bespoke fetch of the
  // same endpoint). Sharing is still a ROLE question, not a tier one.
  const { data: entitlements, feature, refresh: refreshEntitlements } = useEntitlements();
  const canShare = entitlements?.role === "trainer" || entitlements?.role === "admin";
  const canCreate =
    !entitlements ||
    entitlements.enforced === false ||
    feature("custom-programs")?.canCreate !== false;

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
      if (!token) {
        setPrograms([]);
        return;
      }
      const res = await fetch('/api/programs/custom', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        setPrograms([]);
        return;
      }
      const data = await res.json();
      setPrograms(Array.isArray(data?.programs) ? data.programs : []);
    } catch (e) {
      console.error('Failed to load custom programs', e);
      setPrograms([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleDelete = async (programId: string) => {
    if (!confirm('Delete this program? This cannot be undone.')) return;
    setError(null);
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
      const res = await fetch(`/api/programs/custom/${programId}`, {
        method: 'DELETE',
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to delete');
      }
      setPrograms(prev => prev.filter(p => p.program_id !== programId));
      // The slot is free the moment the row is gone. Re-read now, or the 60s
      // snapshot keeps the Create button locked at a cap the member just
      // cleared — and deleting is the only way back under an inventory limit.
      void refreshEntitlements();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete');
    }
  };

  const handleEnroll = async (programId: string) => {
    setEnrollingId(programId);
    setError(null);
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
      const res = await fetch('/api/programs/enroll', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ programId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to enroll');
      }
      router.push(`/dashboard/workout/${programId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to enroll');
    } finally {
      setEnrollingId(null);
    }
  };

  const content = (
    <>
      {embedded ? (
        <div className="mb-4 flex justify-end">
          <button
            onClick={() =>
              canCreate
                ? setShowCreate(true)
                : setGate(syntheticGate("custom-programs", "plus", feature("custom-programs")))
            }
            data-tour="programs-create"
            className="flex h-9 items-center gap-1.5 rounded-full bg-green-600 px-4 text-sm font-semibold text-white shadow-sm hover:bg-green-700 active:bg-green-800 transition-colors"
          >
            {canCreate ? <Plus className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
            Create
          </button>
        </div>
      ) : (
        <div className="mb-6 flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="flex-1">
            <h1 className="text-2xl font-extrabold text-zinc-900 dark:text-white">
              My Programs
            </h1>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Programs you’ve built yourself.
            </p>
          </div>
          {canCreate ? (
            <Link
              href="/dashboard/programs/new"
              data-tour="programs-create"
              className="flex h-9 items-center gap-1.5 rounded-full bg-green-600 px-4 text-sm font-semibold text-white shadow-sm hover:bg-green-700 active:bg-green-800 transition-colors"
            >
              <Plus className="h-4 w-4" />
              Add
            </Link>
          ) : (
            <button
              onClick={() => setGate(syntheticGate("custom-programs", "plus", feature("custom-programs")))}
              data-tour="programs-create"
              className="flex h-9 items-center gap-1.5 rounded-full bg-green-600 px-4 text-sm font-semibold text-white shadow-sm hover:bg-green-700 active:bg-green-800 transition-colors"
            >
              <Lock className="h-4 w-4" />
              Add
            </button>
          )}
        </div>
      )}

      {error && (
        <div className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
          {error}
        </div>
      )}

      {/* data-tour anchors the onboarding tour to the list area (all states) */}
      <div data-tour="programs-list">
      {loading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl bg-zinc-100 dark:bg-zinc-900" />
          ))}
        </div>
      ) : programs.length === 0 ? (
        <EmptyState
          icon={<Plus className="h-7 w-7" />}
          title="You haven't created any custom programs yet"
          description="Build your own training program tailored to your goals."
          action={
            <Link
              href="/dashboard/programs/new"
              className="inline-flex items-center gap-1.5 rounded-xl bg-green-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-green-700"
            >
              <Plus className="h-4 w-4" />
              Create Your First Program
            </Link>
          }
        />
      ) : (
        <div className="space-y-3">
          {programs.map((p) => (
            <Card key={p.program_id}>
              <div className="flex items-start justify-between gap-3">
                <Link
                  href={`/dashboard/workout/${p.program_id}`}
                  className="min-w-0 flex-1"
                >
                  <h3 className="truncate text-base font-semibold text-zinc-900 dark:text-white">
                    {p.name || 'Untitled Program'}
                  </h3>
                  {p.description && (
                    <p className="mt-1 line-clamp-2 text-sm text-zinc-500 dark:text-zinc-400">
                      {p.description}
                    </p>
                  )}
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <span className="inline-flex items-center rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                      {p.duration_weeks}w
                    </span>
                    <span className="inline-flex items-center rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                      {p.training_days_per_week}x/wk
                    </span>
                    {p.isOwner === false ? (
                      <span className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                        Shared{p.sharedByName ? ` by ${p.sharedByName}` : ''}
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-700 dark:bg-purple-900/30 dark:text-purple-400">
                        Custom
                      </span>
                    )}
                  </div>
                </Link>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  onClick={() => handleEnroll(p.program_id)}
                  disabled={enrollingId === p.program_id}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-green-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-700 disabled:opacity-50"
                >
                  <Play className="h-3.5 w-3.5" />
                  {enrollingId === p.program_id ? 'Enrolling…' : 'Enroll'}
                </button>
                {p.isOwner !== false && (
                  <>
                    <Link
                      href={`/dashboard/programs/${p.program_id}/edit`}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-100 px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      Edit
                    </Link>
                    {canShare && (
                      <button
                        onClick={() => setShareTarget(p)}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-100 px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
                      >
                        <Share2 className="h-3.5 w-3.5" />
                        Share
                      </button>
                    )}
                    <button
                      onClick={() => handleDelete(p.program_id)}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-100 dark:bg-red-900/20 dark:text-red-400 dark:hover:bg-red-900/30"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Delete
                    </button>
                  </>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}
      </div>

      {shareTarget && (
        <ShareProgramModal
          programId={shareTarget.program_id}
          programName={shareTarget.name}
          onClose={() => setShareTarget(null)}
        />
      )}

      <UpgradeSheet open={!!gate} gate={gate} onClose={() => setGate(null)} />
    </>
  );

  if (embedded) {
    // Inline program creator (reveals NewProgramClient, which self-gates on the
    // custom-programs entitlement) — keeps "create" built into the tab rather
    // than navigating away, consistent with the Exercises + Sessions tabs.
    if (showCreate) {
      return (
        <div className="pb-6">
          <button
            onClick={() => setShowCreate(false)}
            className="mb-2 flex items-center gap-1.5 text-sm font-medium text-zinc-500 transition-colors hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to my programs
          </button>
          <NewProgramClient />
        </div>
      );
    }
    return <div className="pb-6">{content}</div>;
  }
  return <PageTransition className="pb-6">{content}</PageTransition>;
}
