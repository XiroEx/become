"use client"

// Day navigation for the nutrition page. Same interaction model as the
// timeline header: chevrons page by day, tapping the date label opens the
// shared DateOnlyPicker (with a Today chip) instead of silently jumping to
// today — one consistent date-picking behavior across the app.

import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ChevronLeft, ChevronRight, ChevronDown } from 'lucide-react'
import DateOnlyPicker from '@/components/ui/DateOnlyPicker'

interface DateNavProps {
  date: Date
  onDateChange: (date: Date) => void
}

function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

function formatDate(date: Date) {
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
}

function toKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export default function DateNav({ date, onDateChange }: DateNavProps) {
  const today = new Date()
  const isToday = isSameDay(date, today)
  const [pickerOpen, setPickerOpen] = useState(false)

  const shift = (delta: number) => {
    const next = new Date(date)
    next.setDate(next.getDate() + delta)
    onDateChange(next)
  }

  return (
    <div className="relative flex items-center justify-between">
      <button
        onClick={() => shift(-1)}
        className="flex h-9 w-9 items-center justify-center rounded-lg text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-white"
        aria-label="Previous day"
      >
        <ChevronLeft className="h-5 w-5" />
      </button>

      <div className="relative">
        <button
          onClick={() => setPickerOpen((o) => !o)}
          className="flex flex-col items-center gap-0.5 rounded-lg px-2 py-1 transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-800"
          aria-haspopup="dialog"
          aria-expanded={pickerOpen}
          aria-label="Pick a date"
        >
          <span className="flex items-center gap-1.5 text-sm font-semibold text-zinc-900 dark:text-white">
            {formatDate(date)}
            <ChevronDown className={`h-3.5 w-3.5 text-zinc-400 transition-transform ${pickerOpen ? 'rotate-180' : ''}`} />
          </span>
          {isToday && (
            <span className="text-[10px] font-medium uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
              Today
            </span>
          )}
        </button>

        <AnimatePresence>
          {pickerOpen && (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setPickerOpen(false)} />
              <motion.div
                initial={{ opacity: 0, y: -6, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -6, scale: 0.97 }}
                transition={{ duration: 0.12 }}
                className="absolute left-1/2 top-full z-40 mt-2 w-80 max-w-[calc(100vw-2rem)] -translate-x-1/2 rounded-xl border border-zinc-200 bg-white p-3 shadow-lg dark:border-zinc-700 dark:bg-zinc-900"
                role="dialog"
                aria-label="Pick a date"
              >
                <DateOnlyPicker
                  value={toKey(date)}
                  showTodayChip
                  onChange={(key) => {
                    if (!key) return
                    const [y, m, d] = key.split('-').map(Number)
                    onDateChange(new Date(y, m - 1, d))
                    setPickerOpen(false)
                  }}
                />
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </div>

      <button
        onClick={() => shift(1)}
        className="flex h-9 w-9 items-center justify-center rounded-lg text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-white"
        aria-label="Next day"
      >
        <ChevronRight className="h-5 w-5" />
      </button>
    </div>
  )
}
