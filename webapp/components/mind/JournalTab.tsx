'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { getToken } from '@/lib/clientAuth'
import { Card } from '@/components/ui'

// ─── Types ────────────────────────────────────────────────────────────────────

interface JournalEntry {
  _id: string
  date: string
  content: string
  mood?: 1 | 2 | 3 | 4 | 5
  prompt?: string
  createdAt: string
}

// ─── Constants ────────────────────────────────────────────────────────────────

const MOOD_LABELS: Record<number, string> = {
  1: 'Poor',
  2: 'Fair',
  3: 'Okay',
  4: 'Good',
  5: 'Great',
}

const MOOD_EMOJIS: Record<number, string> = {
  1: '😞',
  2: '😕',
  3: '😐',
  4: '🙂',
  5: '😄',
}

const WRITING_PROMPTS = [
  "What are three things you're grateful for today?",
  "How did today's workout make you feel?",
  "What's one thing you'd do differently?",
  "What are you most proud of this week?",
  "How is your body feeling today?",
  "What's one healthy habit you maintained?",
  "What challenged you today and how did you respond?",
  "What intention do you want to set for tomorrow?",
  "Describe your energy levels today.",
  "What did you learn about yourself today?",
  "What would make tomorrow even better than today?",
  "How are you taking care of your mental health?",
  "What's one small win from today?",
  "How are you feeling about your fitness progress?",
  "What's bringing you joy right now?",
  "What's one thing you want to let go of today?",
  "How would you describe your mindset going into tomorrow?",
  "What does rest and recovery look like for you right now?",
  "Who or what inspired you today?",
  "What does showing up for yourself mean to you today?",
]

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getDayOfYear(date: Date): number {
  const start = new Date(date.getFullYear(), 0, 0)
  const diff = date.getTime() - start.getTime()
  return Math.floor(diff / (1000 * 60 * 60 * 24))
}

function getTodayPrompt(): string {
  const doy = getDayOfYear(new Date())
  return WRITING_PROMPTS[doy % WRITING_PROMPTS.length]
}

function formatDateLong(dateStr: string): string {
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
}

function formatDateShort(dateStr: string): string {
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

function isSameDay(a: string | Date, b: Date): boolean {
  const da = new Date(a)
  da.setHours(0, 0, 0, 0)
  const db = new Date(b)
  db.setHours(0, 0, 0, 0)
  return da.getTime() === db.getTime()
}

function calcWritingStreak(entries: JournalEntry[]): number {
  if (entries.length === 0) return 0

  const sorted = [...entries].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  )

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  let streak = 0
  let cursor = new Date(today)

  for (const entry of sorted) {
    const d = new Date(entry.date)
    d.setHours(0, 0, 0, 0)
    if (d.getTime() === cursor.getTime()) {
      streak++
      cursor.setDate(cursor.getDate() - 1)
    } else if (d.getTime() < cursor.getTime()) {
      // gap in consecutive days — streak is broken
      break
    }
  }

  return streak
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function MoodPills({
  selected,
  onChange,
}: {
  selected: number | undefined
  onChange: (mood: 1 | 2 | 3 | 4 | 5) => void
}) {
  return (
    <div className="flex gap-2 flex-wrap">
      {([1, 2, 3, 4, 5] as const).map((m) => (
        <button
          key={m}
          type="button"
          onClick={() => onChange(m)}
          className={[
            'flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-colors',
            selected === m
              ? 'bg-violet-600 text-white'
              : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700',
          ].join(' ')}
        >
          <span>{MOOD_EMOJIS[m]}</span>
          <span>{MOOD_LABELS[m]}</span>
        </button>
      ))}
    </div>
  )
}

function AutoGrowTextarea({
  value,
  onChange,
  placeholder,
  disabled,
}: {
  value: string
  onChange: (v: string) => void
  placeholder: string
  disabled: boolean
}) {
  const ref = useRef<HTMLTextAreaElement>(null)

  // Grow on content change
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    // cap at ~8 rows (8 * 1.5rem line-height ≈ 192px), then scroll
    const maxH = 192
    el.style.height = Math.min(el.scrollHeight, maxH) + 'px'
    el.style.overflowY = el.scrollHeight > maxH ? 'auto' : 'hidden'
  }, [value])

  return (
    <textarea
      ref={ref}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      disabled={disabled}
      maxLength={5000}
      rows={3}
      className={[
        'w-full resize-none rounded-lg border bg-white px-3 py-2.5 text-sm text-zinc-900 placeholder-zinc-400',
        'dark:bg-zinc-800 dark:text-white dark:placeholder-zinc-500',
        'focus:outline-none focus:ring-2 focus:ring-violet-500',
        'disabled:opacity-60',
        'border-zinc-200 dark:border-zinc-700',
        'transition-colors',
      ].join(' ')}
    />
  )
}

function PastEntryCard({ entry }: { entry: JournalEntry }) {
  const [expanded, setExpanded] = useState(false)
  const isLong = entry.content.length > 120
  const preview = isLong && !expanded ? entry.content.slice(0, 120).trimEnd() + '...' : entry.content

  return (
    <Card>
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
          {formatDateShort(entry.date)}
        </span>
        {entry.mood && (
          <span className="text-base" title={MOOD_LABELS[entry.mood]}>
            {MOOD_EMOJIS[entry.mood]}
          </span>
        )}
      </div>
      <p className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-400 whitespace-pre-wrap break-words">
        {preview}
      </p>
      {isLong && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-2 text-xs font-medium text-violet-600 hover:text-violet-700 dark:text-violet-400 dark:hover:text-violet-300"
        >
          {expanded ? 'Show less' : 'Read more'}
        </button>
      )}
    </Card>
  )
}

// ─── Draft autosave ───────────────────────────────────────────────────────────

const DRAFT_KEY = 'become_journal_draft'

function todayDateStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

interface JournalDraft {
  date: string
  content: string
  mood?: 1 | 2 | 3 | 4 | 5
}

function loadDraft(): JournalDraft | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY)
    if (!raw) return null
    const draft: JournalDraft = JSON.parse(raw)
    // Only valid if it's from today
    return draft.date === todayDateStr() ? draft : null
  } catch {
    return null
  }
}

function saveDraft(content: string, mood?: 1 | 2 | 3 | 4 | 5) {
  try {
    const draft: JournalDraft = { date: todayDateStr(), content, mood }
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft))
  } catch {}
}

function clearDraft() {
  try { localStorage.removeItem(DRAFT_KEY) } catch {}
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function JournalTab() {
  const [entries, setEntries] = useState<JournalEntry[]>([])
  const [todayEntry, setTodayEntry] = useState<JournalEntry | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [draftRestored, setDraftRestored] = useState(false)

  // Form state
  const [content, setContent] = useState('')
  const [selectedMood, setSelectedMood] = useState<1 | 2 | 3 | 4 | 5 | undefined>(undefined)

  // Pagination
  const [showAll, setShowAll] = useState(false)

  // Autosave timer ref
  const autosaveRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const todayPrompt = getTodayPrompt()
  const today = new Date()

  // ── Fetch ────────────────────────────────────────────────────────────────────

  const fetchEntries = useCallback(async () => {
    const token = getToken()
    if (!token) {
      setLoading(false)
      return
    }
    try {
      const res = await fetch(`/api/journal?tz=${new Date().getTimezoneOffset()}`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error('Failed to load entries')
      const data = await res.json()
      setEntries(data.entries ?? [])
      if (data.todayEntry) {
        setTodayEntry(data.todayEntry)
        setContent(data.todayEntry.content)
        setSelectedMood(data.todayEntry.mood)
        // Entry already saved — clear any stale draft
        clearDraft()
      } else {
        // No saved entry yet — check for a draft from today
        const draft = loadDraft()
        if (draft && draft.content.trim()) {
          setContent(draft.content)
          if (draft.mood) setSelectedMood(draft.mood)
          setDraftRestored(true)
        }
      }
    } catch {
      setError('Could not load journal entries.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchEntries()
  }, [fetchEntries])

  // ── Autosave draft to localStorage (debounced 1.5s) ──────────────────────────

  useEffect(() => {
    // Don't autosave if entry is already persisted to DB
    if (todayEntry) return
    if (autosaveRef.current) clearTimeout(autosaveRef.current)
    autosaveRef.current = setTimeout(() => {
      if (content.trim()) saveDraft(content, selectedMood)
    }, 1500)
    return () => {
      if (autosaveRef.current) clearTimeout(autosaveRef.current)
    }
  }, [content, selectedMood, todayEntry])

  // ── Save ─────────────────────────────────────────────────────────────────────

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!content.trim()) return

    const token = getToken()
    if (!token) return

    setSaving(true)
    setError(null)
    setSaveSuccess(false)

    try {
      const res = await fetch('/api/journal', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          content: content.trim(),
          mood: selectedMood,
          prompt: todayPrompt,
          tz: new Date().getTimezoneOffset(),
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error ?? 'Failed to save')
      }

      const data = await res.json()
      setTodayEntry(data.entry)
      clearDraft()
      setDraftRestored(false)

      // Refresh the entry list, re-inserting today's entry if it's new
      setEntries((prev) => {
        const without = prev.filter((e) => !isSameDay(e.date, today))
        return [data.entry, ...without]
      })

      setSaveSuccess(true)
      setTimeout(() => setSaveSuccess(false), 3000)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to save entry.')
    } finally {
      setSaving(false)
    }
  }

  // ── Derived data ─────────────────────────────────────────────────────────────

  // Past entries = all entries except today's
  const pastEntries = entries.filter((e) => !isSameDay(e.date, today))
  const visiblePastEntries = showAll ? pastEntries : pastEntries.slice(0, 7)
  const writingStreak = calcWritingStreak(entries)
  const charCount = content.length
  const isUpdate = !!todayEntry

  // ── Render ───────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-violet-500 border-t-transparent" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Draft restored banner */}
      {draftRestored && (
        <Card
          accent="warning"
          className="!border-amber-200 !bg-amber-50 dark:!border-amber-900/40 dark:!bg-amber-950/20"
        >
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium text-amber-800 dark:text-amber-400">
              Draft restored — you were writing earlier
            </p>
            <button
              type="button"
              onClick={() => { setContent(''); setSelectedMood(undefined); clearDraft(); setDraftRestored(false) }}
              className="shrink-0 text-xs font-medium text-amber-600 hover:text-amber-800 dark:text-amber-400 dark:hover:text-amber-300"
            >
              Discard
            </button>
          </div>
        </Card>
      )}

      {/* Writing streak pill */}
      {writingStreak > 0 && (
        <div className="flex">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-sm font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
            🔥 {writingStreak}-day writing streak
          </span>
        </div>
      )}

      {/* Today's Entry card */}
      <Card>
        <div className="mb-4 flex items-start justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold text-zinc-900 dark:text-white sm:text-lg">
              {formatDateLong(today.toISOString())}
            </h2>
            <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400 italic">
              "{todayPrompt}"
            </p>
          </div>
          {isUpdate && (
            <span className="shrink-0 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">
              Saved
            </span>
          )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <AutoGrowTextarea
            value={content}
            onChange={setContent}
            placeholder={todayPrompt}
            disabled={saving}
          />

          <div className="flex items-center justify-between gap-2">
            <span className={['text-xs tabular-nums', charCount > 4800 ? 'text-amber-500' : 'text-zinc-400 dark:text-zinc-600'].join(' ')}>
              {charCount}/5000
            </span>
          </div>

          <div>
            <p className="mb-2 text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wide">
              Mood (optional)
            </p>
            <MoodPills selected={selectedMood} onChange={setSelectedMood} />
          </div>

          {error && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">
              {error}
            </p>
          )}

          {saveSuccess && (
            <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700 dark:bg-green-900/20 dark:text-green-400">
              Entry saved successfully.
            </p>
          )}

          <button
            type="submit"
            disabled={saving || !content.trim()}
            className={[
              'w-full rounded-lg px-4 py-2.5 text-sm font-semibold text-white transition-colors',
              'bg-violet-600 hover:bg-violet-700 active:bg-violet-800',
              'disabled:opacity-50 disabled:cursor-not-allowed',
            ].join(' ')}
          >
            {saving ? 'Saving...' : isUpdate ? 'Update Entry' : 'Save Entry'}
          </button>
        </form>
      </Card>

      {/* Past Entries */}
      {pastEntries.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Previous Entries
          </h3>
          <div className="space-y-3">
            {visiblePastEntries.map((entry) => (
              <PastEntryCard key={entry._id} entry={entry} />
            ))}
          </div>
          {pastEntries.length > 7 && (
            <button
              type="button"
              onClick={() => setShowAll((v) => !v)}
              className="w-full rounded-lg border border-zinc-200 bg-white py-2 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800"
            >
              {showAll ? 'Show less' : `Load more (${pastEntries.length - 7} more)`}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
