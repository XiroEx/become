"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Trash2, Play, ArrowLeft } from "lucide-react";
import PageTransition from "@/components/PageTransition";

interface CustomProgramSummary {
  program_id: string;
  name: string;
  description?: string;
  duration_weeks: number;
  training_days_per_week: number;
  goal: string;
  target_user: string;
  tags?: string[];
}

export default function MyProgramsClient() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [programs, setPrograms] = useState<CustomProgramSummary[]>([]);
  const [enrollingId, setEnrollingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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
      router.push(`/dashboard/programming/${programId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to enroll');
    } finally {
      setEnrollingId(null);
    }
  };

  return (
    <PageTransition className="pb-6">
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
        <Link
          href="/dashboard/programs/new"
          className="flex h-9 items-center gap-1.5 rounded-full bg-green-600 px-4 text-sm font-semibold text-white shadow-sm hover:bg-green-700 active:bg-green-800 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Add
        </Link>
      </div>

      {error && (
        <div className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-700 dark:bg-red-900/20 dark:text-red-400">
          {error}
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-xl bg-zinc-100 dark:bg-zinc-900" />
          ))}
        </div>
      ) : programs.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 py-16 px-4 text-center dark:border-zinc-700 dark:bg-zinc-900">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-purple-500 to-indigo-500 text-white">
            <Plus className="h-8 w-8" />
          </div>
          <h3 className="mt-4 text-lg font-semibold text-zinc-900 dark:text-white">
            You haven&apos;t created any custom programs yet
          </h3>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Build your own training program tailored to your goals.
          </p>
          <Link
            href="/dashboard/programs/new"
            className="mt-6 inline-flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow hover:from-purple-700 hover:to-indigo-700"
          >
            <Plus className="h-4 w-4" />
            Create Your First Program
          </Link>
        </div>
      ) : (
        <div className="space-y-3">
          {programs.map((p) => (
            <div
              key={p.program_id}
              className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
            >
              <div className="flex items-start justify-between gap-3">
                <Link
                  href={`/dashboard/programming/${p.program_id}`}
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
                    <span className="inline-flex items-center rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-700 dark:bg-purple-900/30 dark:text-purple-400">
                      Custom
                    </span>
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
                <Link
                  href={`/dashboard/programs/${p.program_id}/edit`}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-100 px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
                >
                  <Pencil className="h-3.5 w-3.5" />
                  Edit
                </Link>
                <button
                  onClick={() => handleDelete(p.program_id)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-100 dark:bg-red-900/20 dark:text-red-400 dark:hover:bg-red-900/30"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </PageTransition>
  );
}
