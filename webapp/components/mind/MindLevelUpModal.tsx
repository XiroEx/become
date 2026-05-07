'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, ChevronRight, Sparkles, Lock } from 'lucide-react'
import { getToken } from '@/lib/clientAuth'
import { CHAPTERS, SYSTEM_INFO } from '@/lib/mindXP'

interface Props {
  currentChapter: number
  xp: number
  readyToLevelUp: boolean
  canSelfDeclare: boolean
  onLevelUp: (newChapter: number) => void
  onClose: () => void
}

export default function MindLevelUpModal({ currentChapter, xp, readyToLevelUp, canSelfDeclare, onLevelUp, onClose }: Props) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const nextChapter = CHAPTERS[currentChapter] // CHAPTERS is 0-indexed, so index = currentChapter

  async function handleLevelUp() {
    setLoading(true)
    setError(null)
    try {
      const token = getToken()
      const res = await fetch('/api/mind/progress/levelup', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      })
      if (res.ok) {
        const data = await res.json()
        onLevelUp(data.chapter)
      } else {
        const data = await res.json()
        if (data.error === 'self_declare_used') {
          setError('You already claimed early readiness. Earn the XP to advance.')
        } else {
          setError('Something went wrong. Try again.')
        }
      }
    } finally {
      setLoading(false)
    }
  }

  if (!nextChapter) return null

  const blocked = !readyToLevelUp && !canSelfDeclare

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-end" onClick={onClose}>
        <motion.div
          initial={{ y: '100%' }}
          animate={{ y: 0 }}
          exit={{ y: '100%' }}
          transition={{ type: 'spring', damping: 28, stiffness: 280 }}
          onClick={(e) => e.stopPropagation()}
          className="w-full rounded-t-2xl bg-white dark:bg-zinc-900 border-t border-zinc-200 dark:border-zinc-800 px-5 pt-5 pb-10"
        >
          {/* Handle */}
          <div className="mx-auto mb-5 h-1 w-10 rounded-full bg-zinc-300 dark:bg-zinc-700" />

          {/* Close */}
          <button
            onClick={onClose}
            className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-400"
          >
            <X className="h-4 w-4" />
          </button>

          {/* Header */}
          <div className={`mb-1 flex items-center gap-2 ${nextChapter.color}`}>
            <Sparkles className="h-4 w-4" />
            <p className="text-xs font-bold uppercase tracking-widest">Next Chapter Unlocks</p>
          </div>
          <h2 className="mb-1 text-2xl font-bold text-zinc-900 dark:text-white">
            Chapter {nextChapter.id}: {nextChapter.name}
          </h2>
          <p className="mb-5 text-sm text-zinc-500 dark:text-zinc-400 leading-relaxed">
            {nextChapter.description}
          </p>

          {/* What unlocks */}
          <div className={`relative mb-6 overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800 p-3 sm:p-4`}>
            <div className={`pointer-events-none absolute inset-0 ${nextChapter.bg}`} />
            <div className="relative">
              <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-zinc-500">
                New Systems
              </p>
              <div className="space-y-2">
                {nextChapter.systems.map((sysId) => {
                  const info = SYSTEM_INFO[sysId]
                  return (
                    <div key={sysId} className="flex items-center gap-3">
                      <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${info.iconBg}`}>
                        <ChevronRight className={`h-4 w-4 ${info.color}`} />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-zinc-900 dark:text-white">{info.label}</p>
                        <p className="text-xs text-zinc-500">{info.hook}</p>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          {/* Status messages */}
          {error && (
            <p className="mb-4 text-center text-xs font-semibold text-red-500">{error}</p>
          )}
          {!error && !readyToLevelUp && canSelfDeclare && (
            <p className="mb-4 text-center text-xs text-zinc-400">
              You&apos;re declaring readiness before hitting the XP threshold. You can only do this once per chapter — own it.
            </p>
          )}
          {!error && blocked && (
            <p className="mb-4 text-center text-xs text-zinc-400">
              You already claimed early readiness for this chapter. Keep going — earn the XP.
            </p>
          )}

          <button
            onClick={blocked ? onClose : handleLevelUp}
            disabled={loading}
            className={`flex w-full items-center justify-center gap-2 rounded-xl py-3.5 text-sm font-bold disabled:opacity-50 transition-opacity ${
              blocked
                ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-400'
                : 'bg-zinc-900 dark:bg-white text-white dark:text-zinc-900'
            }`}
          >
            {blocked ? (
              <><Lock className="h-4 w-4" /> Keep Earning</>
            ) : loading ? (
              'Advancing...'
            ) : (
              <>{`Enter ${nextChapter.name}`}<ChevronRight className="h-4 w-4" /></>
            )}
          </button>
        </motion.div>
      </div>
    </AnimatePresence>
  )
}
