"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Sparkles, Lock } from "lucide-react";
import ProgramCreator from "@/app/dashboard/admin/programs/_editors/ProgramCreator";
import PageTransition from "@/components/PageTransition";

interface EntitlementResponse {
  role: string;
  tier: string;
  features: Record<string, { allowed: boolean; requiresTier: string }>;
}

export default function NewProgramClient() {
  const [loading, setLoading] = useState(true);
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [requiresTier, setRequiresTier] = useState<string>('premium');

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
        if (!token) {
          if (!cancelled) {
            setAllowed(false);
            setLoading(false);
          }
          return;
        }
        const res = await fetch('/api/me/entitlements', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          if (!cancelled) {
            setAllowed(false);
            setLoading(false);
          }
          return;
        }
        const data: EntitlementResponse = await res.json();
        const feature = data.features?.['custom-programs'];
        if (!cancelled) {
          setAllowed(!!feature?.allowed);
          if (feature?.requiresTier) setRequiresTier(feature.requiresTier);
          setLoading(false);
        }
      } catch {
        if (!cancelled) {
          setAllowed(false);
          setLoading(false);
        }
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <PageTransition className="pb-6">
        <div className="mx-auto max-w-3xl px-0 py-12 sm:px-6">
          <div className="h-8 w-64 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" />
          <div className="mt-4 h-32 animate-pulse rounded-2xl bg-zinc-100 dark:bg-zinc-900" />
        </div>
      </PageTransition>
    );
  }

  if (!allowed) {
    return (
      <PageTransition className="pb-6">
        <div className="mx-auto max-w-2xl px-0 py-12 sm:px-6">
          <div className="text-center sm:rounded-2xl sm:border sm:border-zinc-200 sm:bg-white sm:p-8 sm:shadow-sm dark:sm:border-zinc-800 dark:sm:bg-zinc-900">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-purple-500 to-indigo-500 text-white">
              <Sparkles className="h-8 w-8" />
            </div>
            <h1 className="mt-6 text-2xl font-extrabold text-zinc-900 dark:text-white">
              Custom Programs are a {requiresTier.charAt(0).toUpperCase() + requiresTier.slice(1)} feature
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
              onClick={() => alert('Billing coming soon. We’ll email you when upgrades are live.')}
              className="mt-8 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 px-6 py-3 text-sm font-semibold text-white shadow-md transition-all hover:from-purple-700 hover:to-indigo-700"
            >
              <Lock className="h-4 w-4" />
              Upgrade to {requiresTier.charAt(0).toUpperCase() + requiresTier.slice(1)}
            </button>

            <div className="mt-4">
              <Link
                href="/dashboard/programming"
                className="text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
              >
                Back to Programs
              </Link>
            </div>
          </div>
        </div>
      </PageTransition>
    );
  }

  return <ProgramCreator mode="user-create" />;
}
