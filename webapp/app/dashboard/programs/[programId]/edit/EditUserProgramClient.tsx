"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import ProgramCreator from "@/app/dashboard/programming/create/ProgramCreator";
import PageTransition from "@/components/PageTransition";
import type { Phase, TargetUserLevel } from "@/lib/data/programs";

interface Props {
  programId: string;
}

interface ProgramShape {
  name: string;
  description?: string;
  duration_weeks: number;
  training_days_per_week: number;
  goal: string;
  target_user: TargetUserLevel;
  equipment?: string[];
  phases: Phase[];
}

export default function EditUserProgramClient({ programId }: Props) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [program, setProgram] = useState<ProgramShape | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
        if (!token) {
          if (!cancelled) {
            setError('You need to be logged in to edit programs.');
            setLoading(false);
          }
          return;
        }
        const res = await fetch(`/api/programs/custom/${programId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          if (!cancelled) {
            setError(res.status === 404 ? 'Program not found' : 'Failed to load program');
            setLoading(false);
          }
          return;
        }
        const data = await res.json();
        if (!cancelled) {
          setProgram(data as ProgramShape);
          setLoading(false);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Failed to load program');
          setLoading(false);
        }
      }
    }
    load();
    return () => { cancelled = true; };
  }, [programId]);

  if (loading) {
    return (
      <PageTransition className="pb-6">
        <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
          <div className="h-8 w-64 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" />
          <div className="mt-4 h-32 animate-pulse rounded-2xl bg-zinc-100 dark:bg-zinc-900" />
        </div>
      </PageTransition>
    );
  }

  if (error || !program) {
    return (
      <PageTransition className="pb-6">
        <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6 text-center">
          <h1 className="text-xl font-bold text-zinc-900 dark:text-white">{error || 'Program not found'}</h1>
          <Link
            href="/dashboard/programs/mine"
            className="mt-4 inline-block text-sm text-purple-600 hover:underline dark:text-purple-400"
          >
            Back to My Programs
          </Link>
        </div>
      </PageTransition>
    );
  }

  return (
    <ProgramCreator
      mode="user-edit"
      programId={programId}
      initialData={program}
    />
  );
}
