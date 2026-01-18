"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Program } from "@/lib/data/programs";
import PageTransition from "@/components/PageTransition";

interface ActiveProgram {
  programId: string;
  programName: string;
  startDate: string;
  currentPhase: number;
  currentDay: string;
  completedWorkouts: number;
  totalWorkouts: number;
  progress: number;
  status: string;
  lastWorkoutDate?: string;
}

interface ProgrammingClientProps {
  programs: Program[];
}

export default function ProgrammingClient({ programs }: ProgrammingClientProps) {
  const [activePrograms, setActivePrograms] = useState<ActiveProgram[]>([]);
  const [loadingActive, setLoadingActive] = useState(true);

  useEffect(() => {
    const fetchActivePrograms = async () => {
      try {
        const token = localStorage.getItem("token");
        if (!token) {
          setLoadingActive(false);
          return;
        }

        const res = await fetch("/api/programs/active", {
          headers: { Authorization: `Bearer ${token}` }
        });

        if (res.ok) {
          const data = await res.json();
          setActivePrograms(data.activePrograms || []);
        }
      } catch (error) {
        console.error("Error fetching active programs:", error);
      } finally {
        setLoadingActive(false);
      }
    };

    fetchActivePrograms();
  }, []);

  return (
    <PageTransition className="pb-24">
      {/* Header */}
      <div className="mb-4 sm:mb-8">
        <h1 className="text-2xl font-extrabold text-zinc-900 dark:text-white sm:text-3xl">
          Programs
        </h1>
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          Choose your training path and start building.
        </p>
      </div>

      {/* Active Programs Section */}
      {!loadingActive && activePrograms.length > 0 && (
        <div className="mb-6">
          <h2 className="mb-3 text-lg font-semibold text-zinc-900 dark:text-white">
            Continue Training
          </h2>
          <div className="space-y-3">
            {activePrograms.map((program) => (
              <div
                key={program.programId}
                className="group relative rounded-xl border-2 border-green-500/30 bg-linear-to-r from-green-500/10 to-emerald-500/10 p-4 shadow-sm transition-all duration-200 hover:border-green-500/50 hover:shadow-md dark:from-green-500/5 dark:to-emerald-500/5"
              >
                {/* Card content - links to program overview */}
                <Link
                  href={`/dashboard/programming/${program.programId}`}
                  className="block"
                >
                  <div className="flex items-center justify-between">
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate text-base font-semibold text-zinc-900 dark:text-white">
                        {program.programName}
                      </h3>
                      <p className="mt-0.5 text-sm text-zinc-600 dark:text-zinc-400">
                        Phase {program.currentPhase} • Day {program.currentDay}
                      </p>
                    </div>
                    <div className="ml-4 flex items-center gap-3">
                      <div className="text-right">
                        <span className="text-sm font-semibold text-green-600 dark:text-green-400">
                          {program.progress}%
                        </span>
                        <p className="text-xs text-zinc-500 dark:text-zinc-400">
                          {program.completedWorkouts}/{program.totalWorkouts}
                        </p>
                      </div>
                      {/* Spacer for play button */}
                      <div className="w-10" />
                    </div>
                  </div>
                  {/* Progress bar */}
                  <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700">
                    <div
                      className="h-full rounded-full bg-linear-to-r from-green-500 to-emerald-500 transition-all duration-300"
                      style={{ width: `${program.progress}%` }}
                    />
                  </div>
                </Link>
                
                {/* Play button - links to workout form page */}
                <Link
                  href={`/dashboard/programming/${program.programId}/workout`}
                  className="absolute right-4 top-1/2 -translate-y-1/2 flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-green-500 text-white shadow-lg transition-transform duration-200 hover:scale-110 hover:bg-green-600 active:scale-95"
                  onClick={(e) => e.stopPropagation()}
                >
                  <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                </Link>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Loading skeleton for active programs */}
      {loadingActive && (
        <div className="mb-6">
          <div className="mb-3 h-6 w-32 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" />
          <div className="h-24 animate-pulse rounded-xl bg-zinc-100 dark:bg-zinc-900" />
        </div>
      )}

      {/* All Programs Header */}
      {!loadingActive && activePrograms.length > 0 && (
        <h2 className="mb-3 text-lg font-semibold text-zinc-900 dark:text-white">
          All Programs
        </h2>
      )}

      {/* Program List - filter out enrolled programs */}
      <div className="space-y-3">
        {programs
          .filter((program) => !activePrograms.some((ap) => ap.programId === program.program_id))
          .map((program) => (
          <Link
            key={program.program_id}
            href={`/dashboard/programming/${program.program_id}`}
            className="group flex items-center gap-3 rounded-xl border border-zinc-200 bg-white p-3 shadow-sm transition-all duration-200 hover:shadow-md hover:border-zinc-300 active:scale-[0.99] dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700 sm:gap-4 sm:p-4"
          >
            {/* Accent bar */}
            <div className="h-14 w-1 shrink-0 rounded-full bg-linear-to-b from-green-500 to-emerald-600" />

            {/* Content */}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-3">
                <h3 className="truncate text-base font-semibold text-zinc-900 dark:text-white">
                  {program.name}
                </h3>
                <div className="flex shrink-0 gap-2">
                  <span className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                    {program.duration_weeks}w
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                    {program.training_days_per_week}x/wk
                  </span>
                  <span className="hidden sm:inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                    {program.phases.length} phases
                  </span>
                </div>
              </div>
              <p className="mt-1 truncate text-sm text-zinc-500 dark:text-zinc-400">
                {program.target_user}
              </p>
            </div>

            {/* Arrow */}
            <div className="shrink-0 text-zinc-400 transition-transform duration-200 group-hover:translate-x-1 group-hover:text-zinc-600 dark:group-hover:text-zinc-300">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </div>
          </Link>
        ))}
      </div>

      {/* Empty state */}
      {programs.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 py-16 dark:border-zinc-700 dark:bg-zinc-900">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-zinc-200 dark:bg-zinc-800">
            <svg className="h-8 w-8 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
          </div>
          <h3 className="mt-4 text-lg font-semibold text-zinc-900 dark:text-white">
            No programs yet
          </h3>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Programs will appear here once they&apos;re available.
          </p>
        </div>
      )}
    </PageTransition>
  );
}
