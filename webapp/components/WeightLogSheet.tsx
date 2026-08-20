"use client"

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Scale, Loader2, Check } from 'lucide-react'
import { useLockScroll } from '@/lib/useLockScroll'
import { useKeyboardInset } from '@/lib/useKeyboardInset'
import { getToken } from '@/lib/clientAuth'

interface WeightLogSheetProps {
  isOpen: boolean
  onClose: () => void
  onLogged: (weight: number) => void
  /** Prefills the input so logging today's weight is a one-tap confirm. */
  lastWeight?: number
  targetWeight?: number | null
}

export default function WeightLogSheet({ isOpen, onClose, onLogged, lastWeight, targetWeight }: WeightLogSheetProps) {
  const [value, setValue] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useLockScroll(isOpen)
  // Lift the sheet above the software keyboard so the Log button isn't hidden
  // behind the keypad while typing the weight (see useKeyboardInset).
  const keyboardInset = useKeyboardInset(isOpen)

  useEffect(() => {
    if (isOpen) {
      setValue(lastWeight ? lastWeight.toString() : '')
      setError(null)
    }
  }, [isOpen, lastWeight])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const w = parseFloat(value)
    if (!w || w <= 0 || saving) return
    setSaving(true)
    setError(null)
    try {
      const token = getToken()
      const headers: HeadersInit = { 'Content-Type': 'application/json' }
      if (token) headers['Authorization'] = `Bearer ${token}`
      const res = await fetch('/api/weight', {
        method: 'POST',
        headers,
        body: JSON.stringify({ weight: w, tz: new Date().getTimezoneOffset() }),
      })
      if (res.ok) {
        onLogged(w)
        onClose()
      } else {
        const data = await res.json().catch(() => ({}))
        setError(data?.error || 'Failed to log weight.')
      }
    } catch {
      setError('Network error.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 transition-[padding] duration-150 ease-out sm:items-center sm:p-4"
          style={{ paddingBottom: keyboardInset || undefined }}
          onClick={() => !saving && onClose()}
        >
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            onClick={(e) => e.stopPropagation()}
            className="relative w-full overflow-hidden rounded-t-2xl bg-white shadow-2xl dark:bg-zinc-900 sm:max-w-sm sm:rounded-2xl"
            style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
          >
            {/* Header */}
            <div className="flex items-center gap-3 border-b border-zinc-200 px-5 py-4 dark:border-zinc-800 sm:px-6">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-zinc-100 dark:bg-zinc-800">
                <Scale className="h-5 w-5 text-zinc-500 dark:text-zinc-400" />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-base font-bold text-zinc-900 dark:text-white">Log Weight</h3>
                {targetWeight ? (
                  <p className="truncate text-[11px] text-zinc-500 dark:text-zinc-400">Goal: {targetWeight} lbs</p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={onClose}
                disabled={saving}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700 disabled:opacity-40 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-3 p-5 sm:p-6">
              <div>
                <label htmlFor="weight-sheet-input" className="mb-1.5 block text-sm font-medium text-zinc-700 dark:text-zinc-300">
                  Weight (lbs)
                </label>
                <input
                  id="weight-sheet-input"
                  type="number"
                  inputMode="decimal"
                  step="0.1"
                  min="50"
                  max="700"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  placeholder="e.g., 185.5"
                  autoFocus
                  className="w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-center text-lg font-semibold text-zinc-900 placeholder-zinc-400 focus:border-zinc-400 focus:outline-none focus:ring-2 focus:ring-zinc-400/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white dark:placeholder-zinc-500"
                />
              </div>

              {error && (
                <div className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-900/20 dark:text-red-300">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={saving || !value || parseFloat(value) <= 0}
                className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-zinc-900 py-3 text-sm font-semibold text-white transition-colors hover:bg-black disabled:opacity-40 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                {saving ? 'Logging…' : 'Log Weight'}
              </button>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
