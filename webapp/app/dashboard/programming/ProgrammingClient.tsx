"use client";

import Link from "next/link";
import { Program } from "@/lib/data/programs";
import PageTransition from "@/components/PageTransition";

interface ProgrammingClientProps {
  programs: Program[];
}

export default function ProgrammingClient({ programs }: ProgrammingClientProps) {
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

      {/* Program List */}
      <div className="space-y-3">
        {programs.map((program) => (
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
