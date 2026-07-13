"use client"

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { Trophy, Dumbbell, Calendar, TrendingUp, TrendingDown, Minus, ArrowLeft, Flame } from 'lucide-react'
import PageTransition from '@/components/PageTransition'

interface JourneyData {
  programName: string
  durationWeeks: number
  goal: string | null
  totalSessions: number
  totalVolumeLbs: number
  weightChange: { startLbs: number; endLbs: number; change: number } | null
  topPRs: { name: string; weight: number; reps: number; date: string }[]
  startDate: string | null
  endDate: string | null
}

function StatCard({
  label,
  value,
  sub,
  color = 'text-white',
  delay = 0,
}: {
  label: string
  value: string
  sub?: string
  color?: string
  delay?: number
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, type: 'spring', stiffness: 240, damping: 22 }}
      className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4 text-center"
    >
      <p className={`text-2xl font-black tabular-nums ${color}`}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-zinc-500">{sub}</p>}
      <p className="mt-1 text-xs font-medium uppercase tracking-wide text-zinc-500">{label}</p>
    </motion.div>
  )
}

export default function JourneyPage() {
  const params = useParams()
  const router = useRouter()
  const programId = params.programId as string

  const [data, setData] = useState<JourneyData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    const token = localStorage.getItem('token')
    if (!token) { router.push('/login'); return }

    fetch(`/api/programs/${programId}/journey`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.ok ? r.json() : Promise.reject())
      .then((d: JourneyData) => { setData(d); setLoading(false) })
      .catch(() => { setError(true); setLoading(false) })
  }, [programId, router])

  if (loading) {
    return (
      <PageTransition className="pb-8">
        <div className="space-y-4 animate-pulse">
          <div className="h-8 w-48 rounded-lg bg-zinc-800" />
          <div className="h-32 rounded-2xl bg-zinc-900" />
          <div className="grid grid-cols-2 gap-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-24 rounded-2xl bg-zinc-900" />
            ))}
          </div>
        </div>
      </PageTransition>
    )
  }

  if (error || !data) {
    return (
      <PageTransition className="pb-8">
        <p className="text-center text-zinc-500 mt-16">Could not load journey data.</p>
      </PageTransition>
    )
  }

  const weightIcon =
    !data.weightChange || data.weightChange.change === 0 ? Minus
    : data.weightChange.change < 0 ? TrendingDown
    : TrendingUp

  const weightColor =
    !data.weightChange || data.weightChange.change === 0 ? 'text-zinc-400'
    : data.weightChange.change < 0 ? 'text-emerald-400'
    : 'text-amber-400'

  const WeightIcon = weightIcon

  return (
    <PageTransition className="pb-8">
      {/* Header */}
      <div className="mb-6 flex items-center gap-3">
        <button
          onClick={() => router.push('/dashboard/workout')}
          className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg border border-zinc-200 bg-white transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:bg-zinc-800"
        >
          <ArrowLeft className="h-4 w-4 text-zinc-600 dark:text-zinc-400" />
        </button>
        <div>
          <h1 className="text-xl font-black leading-tight">Your Journey</h1>
          <p className="text-sm text-zinc-500">{data.programName}</p>
        </div>
      </div>

      {/* Hero banner */}
      <motion.div
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.4, type: 'spring', stiffness: 220, damping: 22 }}
        data-tour="journey-hero"
        className="mb-6 rounded-2xl bg-gradient-to-br from-yellow-500/20 to-amber-600/10 border border-yellow-500/30 p-4 sm:p-5 text-center"
      >
        <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-yellow-500/20 ring-4 ring-yellow-500/30">
          <Trophy className="h-8 w-8 text-yellow-400" strokeWidth={1.5} />
        </div>
        <h2 className="text-2xl font-black text-yellow-400">PROGRAM COMPLETE</h2>
        <p className="mt-1 text-sm text-zinc-400">
          {data.startDate && data.endDate
            ? `${data.startDate} — ${data.endDate}`
            : data.durationWeeks > 0 ? `${data.durationWeeks} weeks` : null}
        </p>
        <p className="mt-2 text-zinc-500 text-xs">You showed up and did the work. That&apos;s everything.</p>
      </motion.div>

      {/* Key stats grid */}
      <div data-tour="journey-stats" className="mb-6 grid grid-cols-2 gap-3">
        <StatCard
          label="Sessions Completed"
          value={String(data.totalSessions)}
          color="text-emerald-400"
          delay={0.1}
        />
        <StatCard
          label="Total Volume"
          value={data.totalVolumeLbs > 0 ? `${(data.totalVolumeLbs / 1000).toFixed(1)}k` : '—'}
          sub={data.totalVolumeLbs > 0 ? 'lbs lifted' : undefined}
          color="text-blue-400"
          delay={0.15}
        />
        {data.durationWeeks > 0 && (
          <StatCard
            label="Program Length"
            value={`${data.durationWeeks}w`}
            color="text-violet-400"
            delay={0.2}
          />
        )}
        {data.weightChange ? (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25, type: 'spring', stiffness: 240, damping: 22 }}
            className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4 text-center"
          >
            <div className={`flex items-center justify-center gap-1 ${weightColor}`}>
              <WeightIcon className="h-5 w-5" />
              <p className="text-2xl font-black tabular-nums">
                {data.weightChange.change > 0 ? '+' : ''}{data.weightChange.change} lbs
              </p>
            </div>
            <p className="mt-0.5 text-xs text-zinc-500">
              {data.weightChange.startLbs} → {data.weightChange.endLbs} lbs
            </p>
            <p className="mt-1 text-xs font-medium uppercase tracking-wide text-zinc-500">Weight Change</p>
          </motion.div>
        ) : data.durationWeeks === 0 ? null : (
          <StatCard label="Weight Change" value="—" sub="no data" delay={0.25} />
        )}
      </div>

      {/* Top PRs */}
      {data.topPRs.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          data-tour="journey-prs"
          className="mb-6"
        >
          <div className="mb-3 flex items-center gap-2">
            <Flame className="h-4 w-4 text-orange-400" />
            <h2 className="font-bold text-zinc-100">Top Personal Records</h2>
          </div>
          <div className="space-y-2">
            {data.topPRs.map((pr, i) => (
              <motion.div
                key={pr.name}
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.32 + i * 0.05 }}
                className="flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3"
              >
                <div className="flex items-center gap-3">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-zinc-800 text-xs font-bold text-zinc-400">
                    {i + 1}
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-zinc-100">{pr.name}</p>
                    <p className="text-xs text-zinc-500">{pr.date}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-black text-amber-400">{pr.weight} lbs</p>
                  <p className="text-xs text-zinc-500">× {pr.reps} reps</p>
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>
      )}

      {/* Footer CTAs */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.55 }}
        data-tour="journey-next"
        className="space-y-2"
      >
        <button
          onClick={() => router.push('/dashboard/workout')}
          className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-2xl bg-white py-4 text-sm font-bold text-zinc-950 transition-all hover:bg-zinc-100 active:scale-95 dark:bg-zinc-100"
        >
          <Dumbbell className="h-4 w-4" /> Find My Next Challenge
        </button>
        <button
          onClick={() => router.push('/dashboard/progress#workouts')}
          className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-2xl border border-zinc-700 py-3.5 text-sm font-semibold text-zinc-400 transition-all hover:border-zinc-500 hover:text-zinc-200"
        >
          <Calendar className="h-4 w-4" /> View Full Training Log
        </button>
      </motion.div>
    </PageTransition>
  )
}
