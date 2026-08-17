'use client'

// The dashboard's Mindset card.
//
// This used to be a static blurb ("Track your mental wellness journey") with a
// mood row that claimed "110 mood entries · Last 7 days" — 110 was all-time,
// the week's number was 4. Now it shows what is actually true today: your
// level and chapter, whether today's session is done, this week's check-ins,
// and a CTA that reads the mood you set on the tile above it.

import Link from 'next/link'
import { ArrowRight, Brain, Check, Sparkles } from 'lucide-react'
import { Card } from '@/components/ui'
import { moodGateway, isMoodLevel } from '@/lib/mind/moodBridge'
import type { MoodLevel } from '@/components/MoodCard'

export interface MindSummary {
  level: number
  levelPct: number
  chapter: number
  chapterName: string | null
  sessionsIntoChapter: number
  sessionsPerChapter: number
  sessionDoneToday: boolean
  mainSessionAvailable: boolean
  sessionsLast7Days: number
  moodCheckinsLast7Days: number
  todayMood: number | null
  lastState: { state: string; feeling: string | null; at: number } | null
}

const STATE_WORD: Record<string, string> = {
  stressed: 'stressed',
  distracted: 'distracted',
  low_energy: 'low energy',
  locked_in: 'locked in',
}

function hoursAgo(ms: number): number {
  return Math.max(0, Math.round((Date.now() - ms) / 3_600_000))
}

export default function MindsetCard({ summary, todaysMood }: { summary: MindSummary | null; todaysMood: MoodLevel | null }) {
  const mood = todaysMood ?? (summary && isMoodLevel(summary.todayMood) ? summary.todayMood : null)
  const gateway = mood ? moodGateway(mood) : null

  // What the button says. A low mood gets the gentle invitation; otherwise
  // it is about today's session.
  const cta = (() => {
    if (!summary) return 'Open Mindset'
    if (summary.sessionDoneToday) return 'Training Grounds'
    if (mood && mood <= 2 && gateway) return gateway.cta
    return summary.mainSessionAvailable ? "Start today's session" : 'Training Grounds'
  })()

  const status = (() => {
    if (!summary) return null
    if (summary.sessionDoneToday) return { done: true, text: "Today's session done" }
    if (summary.mainSessionAvailable) return { done: false, text: "Today's session is ready" }
    return { done: false, text: 'Session done · Training Grounds open' }
  })()

  const lastState = summary?.lastState && hoursAgo(summary.lastState.at) <= 24 ? summary.lastState : null

  return (
    <Card data-testid="mindset-card">
      <div className="mb-3 flex items-center justify-between sm:mb-4">
        <h2 className="text-base font-semibold text-zinc-900 dark:text-white sm:text-lg">Mindset</h2>
        <Link
          href="/dashboard/mind"
          className="text-sm font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400"
        >
          View
        </Link>
      </div>

      {summary ? (
        <>
          {/* Level · chapter */}
          <div className="mb-3 flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-purple-100 dark:bg-purple-900/30">
              <Brain className="h-5 w-5 text-purple-600 dark:text-purple-400" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium text-zinc-900 dark:text-white">
                Level {summary.level}
                <span className="text-zinc-400 dark:text-zinc-500"> · </span>
                Chapter {summary.chapter}{summary.chapterName ? `: ${summary.chapterName}` : ''}
              </p>
              <div className="mt-1 flex items-center gap-2">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
                  <div
                    className="h-full rounded-full bg-purple-500 transition-all"
                    style={{ width: `${summary.sessionsPerChapter > 0 ? Math.round((summary.sessionsIntoChapter / summary.sessionsPerChapter) * 100) : 0}%` }}
                  />
                </div>
                <span className="shrink-0 text-[11px] tabular-nums text-zinc-500 dark:text-zinc-400">
                  {summary.sessionsIntoChapter}/{summary.sessionsPerChapter} sessions
                </span>
              </div>
            </div>
          </div>

          {/* Today + this week — flat tinted block, matches the old mood row's footprint */}
          <div className="mb-3 rounded-lg bg-zinc-50 p-2.5 dark:bg-zinc-800/50 sm:mb-4">
            {status && (
              <p className={`flex items-center gap-1.5 text-sm font-medium ${status.done ? 'text-green-700 dark:text-green-400' : 'text-zinc-700 dark:text-zinc-300'}`}>
                {status.done ? <Check className="h-4 w-4" /> : <Sparkles className="h-4 w-4 text-purple-500" />}
                {status.text}
              </p>
            )}
            <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
              This week: {summary.moodCheckinsLast7Days} mood check-in{summary.moodCheckinsLast7Days === 1 ? '' : 's'}
              {' · '}
              {summary.sessionsLast7Days} session{summary.sessionsLast7Days === 1 ? '' : 's'}
              {lastState && (
                <>
                  {' · '}last check-in <span className="font-medium text-zinc-700 dark:text-zinc-200">{lastState.feeling?.toLowerCase() || STATE_WORD[lastState.state] || lastState.state}</span>
                </>
              )}
            </p>
            {gateway && !summary.sessionDoneToday && (
              <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-300">
                <span className="font-semibold">{gateway.headline}</span> {gateway.body}
              </p>
            )}
          </div>
        </>
      ) : (
        <div className="mb-3 space-y-2 sm:mb-4" aria-hidden="true">
          <div className="h-10 w-2/3 animate-pulse rounded bg-zinc-100 dark:bg-zinc-800" />
          <div className="h-14 w-full animate-pulse rounded-lg bg-zinc-100 dark:bg-zinc-800" />
        </div>
      )}

      <Link
        href="/dashboard/mind"
        data-testid="mindset-cta"
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-zinc-900 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-black dark:bg-white dark:text-black dark:hover:bg-zinc-200 sm:py-3"
      >
        <span>{cta}</span>
        <ArrowRight className="h-4 w-4" />
      </Link>
    </Card>
  )
}
