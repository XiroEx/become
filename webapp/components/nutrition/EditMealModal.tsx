"use client"

import { useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, ChefHat, Clock, Tag as TagIcon } from 'lucide-react'
import { useLockScroll } from '@/lib/useLockScroll'
import { useKeyboardInset } from '@/lib/useKeyboardInset'
import { mealLogTimeInputValue, mealLogTimePatch } from '@/lib/nutrition/logTime'

interface EditMealModalProps {
  isOpen: boolean
  // The MealLog id this meal belongs to. All items in the log move together.
  logId: string | null
  mealName?: string
  // The section this meal is currently shown under, plus every tag the
  // member can move it to.
  currentTag: string
  availableTags?: { defaults: string[]; userTags: string[] }
  loggedAt?: string
  untimed?: boolean
  onClose: () => void
  onSaved: () => void   // refetch after save
}

function tagLabel(tag: string): string {
  return tag
    .split(/[-_\s]+/)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

export default function EditMealModal({
  isOpen, logId, mealName, currentTag, availableTags, loggedAt, untimed = false,
  onClose, onSaved,
}: EditMealModalProps) {
  const normalizedCurrentTag = currentTag.trim().toLowerCase().replace(/\s+/g, '-') || 'snack'
  const [selectedTag, setSelectedTag] = useState(normalizedCurrentTag)
  const [logTime, setLogTime] = useState(() => mealLogTimeInputValue(loggedAt, untimed))
  const [initialLogTime, setInitialLogTime] = useState(logTime)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useLockScroll(isOpen)
  const keyboardInset = useKeyboardInset(isOpen)

  useEffect(() => {
    if (isOpen) {
      setSelectedTag(normalizedCurrentTag)
      const t = mealLogTimeInputValue(loggedAt, untimed)
      setLogTime(t)
      setInitialLogTime(t)
      setError('')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, logId, normalizedCurrentTag, loggedAt, untimed])

  const tagOptions = useMemo(() => {
    const tags = [
      normalizedCurrentTag,
      ...(availableTags?.defaults ?? []),
      ...(availableTags?.userTags ?? []),
    ]
    return Array.from(new Set(
      tags
        .map(tag => String(tag).trim().toLowerCase().replace(/\s+/g, '-'))
        .filter(Boolean),
    ))
  }, [normalizedCurrentTag, availableTags])

  const hasChanges = selectedTag !== normalizedCurrentTag || logTime !== initialLogTime

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!logId || !hasChanges) return

    setSaving(true)
    setError('')
    try {
      const token = localStorage.getItem('token')
      const res = await fetch(`/api/meal-logs/${logId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          ...(selectedTag !== normalizedCurrentTag
            ? { tag: selectedTag, fromTag: normalizedCurrentTag }
            : {}),
          ...mealLogTimePatch(loggedAt, logTime),
        }),
      })
      if (res.ok) {
        onSaved()
        onClose()
      } else {
        const d = await res.json().catch(() => ({}))
        setError(d.error || 'Failed to save. Please try again.')
      }
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  function handleClose() {
    if (saving) return
    setError('')
    onClose()
  }

  return (
    <AnimatePresence>
      {isOpen && logId && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm touch-none transition-[padding] duration-150 ease-out sm:items-center sm:p-4"
          style={{ paddingBottom: keyboardInset || undefined }}
          onClick={handleClose}
        >
          <motion.div
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            transition={{ type: 'spring', damping: 28, stiffness: 320 }}
            className="max-h-full w-full max-w-md overflow-y-auto overscroll-contain rounded-t-2xl bg-white p-5 shadow-2xl dark:bg-zinc-900 sm:rounded-2xl sm:p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-5 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-orange-100 dark:bg-orange-900/30">
                  <ChefHat className="h-4 w-4 text-orange-600 dark:text-orange-400" />
                </div>
                <div className="min-w-0">
                  <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                    Edit meal
                  </p>
                  <h2 className="text-base font-bold text-zinc-900 dark:text-white truncate">
                    {mealName || 'Meal'}
                  </h2>
                </div>
              </div>
              <button
                onClick={handleClose}
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Moves every food in this meal together — nothing splits off.
              </p>

              <div>
                <label
                  htmlFor="edit-meal-tag"
                  className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400"
                >
                  Meal tag
                </label>
                <div className="relative">
                  <TagIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
                  <select
                    id="edit-meal-tag"
                    value={selectedTag}
                    onChange={(event) => setSelectedTag(event.target.value)}
                    className="w-full appearance-none rounded-xl border border-zinc-200 bg-white py-2.5 pl-9 pr-8 text-sm font-medium text-zinc-900 outline-none transition-colors focus:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white dark:focus:border-zinc-500"
                  >
                    {tagOptions.map(tag => (
                      <option key={tag} value={tag}>{tagLabel(tag)}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <div className="mb-1.5 flex items-center justify-between gap-3">
                  <label
                    htmlFor="edit-meal-time"
                    className="text-[11px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400"
                  >
                    Time
                  </label>
                  {logTime && (
                    <button
                      type="button"
                      onClick={() => setLogTime('')}
                      className="text-xs font-medium text-zinc-500 underline-offset-2 hover:underline dark:text-zinc-400"
                    >
                      Clear time
                    </button>
                  )}
                </div>
                <div className="relative">
                  <Clock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
                  <input
                    id="edit-meal-time"
                    type="time"
                    value={logTime}
                    onChange={(event) => setLogTime(event.target.value)}
                    className="w-full rounded-xl border border-zinc-200 bg-white py-2.5 pl-9 pr-3 text-sm font-medium text-zinc-900 outline-none transition-colors focus:border-zinc-400 dark:border-zinc-700 dark:bg-zinc-900 dark:text-white dark:focus:border-zinc-500"
                  />
                </div>
                <p className="mt-1.5 text-xs text-zinc-500 dark:text-zinc-400">
                  {logTime ? 'Change when this was logged.' : 'No time set — it stays anchored to this meal tag.'}
                </p>
              </div>

              {error && (
                <p className="text-sm font-medium text-red-600 dark:text-red-400">{error}</p>
              )}

              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={handleClose}
                  disabled={saving}
                  className="flex-1 rounded-xl border border-zinc-200 py-3 font-semibold text-zinc-700 transition-colors hover:bg-zinc-50 disabled:opacity-40 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving || !hasChanges}
                  className="flex-1 rounded-xl bg-zinc-900 py-3 font-semibold text-white transition-colors hover:bg-black disabled:opacity-40 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
                >
                  {saving ? 'Saving…' : 'Save'}
                </button>
              </div>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
