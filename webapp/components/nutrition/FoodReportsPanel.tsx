'use client'

/**
 * The member's food reports, and the second chance when one comes back with no
 * change.
 *
 * Until this existed, a report that we disagreed with ended silently on our
 * side: the member said the numbers were wrong, the reviewer confirmed the
 * record, and nobody told them. That is the worst outcome of the three, because
 * they are the only party actually holding the packet — our record and every
 * source we consulted can be copies of the same stale figure.
 */

import { useCallback, useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, AlertTriangle, CheckCircle2, Clock, Loader2, Send } from 'lucide-react'
import { getToken } from '@/lib/clientAuth'
import EvidencePhotoPicker from './EvidencePhotoPicker'

export interface FoodReport {
  id: string
  foodId: string
  food: { name: string; brand?: string; barcode?: string; servingLabel?: string }
  status: string
  kinds: string[]
  note?: string
  resolution?: string
  resolvedAt?: string
  createdAt?: string
  photoCount: number
  rounds: number
  escalated: boolean
  unread: boolean
  canAddEvidence: boolean
}

function authHeaders(): HeadersInit {
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken() ?? ''}` }
}

const STATUS: Record<string, { label: string; tone: string; Icon: typeof Clock }> = {
  open: { label: 'Being checked', tone: 'text-blue-600 dark:text-blue-400', Icon: Clock },
  attached: { label: 'Being checked', tone: 'text-blue-600 dark:text-blue-400', Icon: Clock },
  corrected: { label: 'Fixed — thank you', tone: 'text-emerald-600 dark:text-emerald-400', Icon: CheckCircle2 },
  confirmed: { label: 'No change made', tone: 'text-amber-600 dark:text-amber-400', Icon: AlertTriangle },
  insufficient: { label: 'Not enough to go on', tone: 'text-amber-600 dark:text-amber-400', Icon: AlertTriangle },
}

export default function FoodReportsPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [items, setItems] = useState<FoodReport[]>([])
  const [loading, setLoading] = useState(true)
  const [active, setActive] = useState<FoodReport | null>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/nutrition/flags/mine', { headers: authHeaders() })
      if (res.ok) {
        const data = await res.json()
        setItems(data.items ?? [])
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!open) return
    setLoading(true)
    load()
    // Opening the panel IS reading it. Marking on open rather than per-item
    // keeps the badge honest: it means "there is something here you have not
    // looked at", not "you have unfinished work".
    fetch('/api/nutrition/flags/mine', { method: 'POST', headers: authHeaders(), body: '{}' })
      .then(() => window.dispatchEvent(new CustomEvent('become:reports-read')))
      .catch(() => {})
  }, [open, load])

  if (!open) return null

  return (
    <>
      <div className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="fixed inset-x-3 top-14 z-[61] mx-auto max-w-md overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xl dark:border-zinc-700 dark:bg-zinc-900 sm:inset-x-auto sm:right-6"
        style={{ maxHeight: 'min(70vh, 520px)' }}
      >
        <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
          <h2 className="text-sm font-bold text-zinc-900 dark:text-white">Your food reports</h2>
          <button onClick={onClose} aria-label="Close" className="rounded-lg p-1 text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="overflow-y-auto" style={{ maxHeight: 'calc(min(70vh, 520px) - 49px)' }}>
          {loading ? (
            <div className="flex items-center justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-zinc-400" /></div>
          ) : items.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-zinc-500 dark:text-zinc-400">
              Nothing reported yet. Tap &ldquo;Something look wrong?&rdquo; on any food and we will check it.
            </p>
          ) : (
            <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {items.map(r => {
                const s = STATUS[r.status] ?? STATUS.open
                return (
                  <li key={r.id} className="px-4 py-3">
                    <div className="flex items-start gap-2">
                      <s.Icon className={`mt-0.5 h-4 w-4 shrink-0 ${s.tone}`} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-zinc-900 dark:text-white">
                          {r.food.name}
                          {r.unread && <span className="ml-2 inline-block h-1.5 w-1.5 rounded-full bg-red-500 align-middle" />}
                        </p>
                        <p className={`text-xs font-medium ${s.tone}`}>{s.label}</p>
                        {r.resolution && (
                          <p className="mt-1 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">{r.resolution}</p>
                        )}
                        {r.escalated && (
                          <p className="mt-1 text-[11px] font-medium text-violet-600 dark:text-violet-400">
                            Sent to a human to check by hand
                          </p>
                        )}
                        {r.canAddEvidence && (
                          <button
                            onClick={() => setActive(r)}
                            data-testid={`add-evidence-${r.id}`}
                            className="mt-2 rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-white dark:bg-white dark:text-black"
                          >
                            Still wrong? Send better photos
                          </button>
                        )}
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </motion.div>

      <AnimatePresence>
        {active && (
          <EvidenceModal
            report={active}
            onClose={() => setActive(null)}
            onDone={() => { setActive(null); setLoading(true); load() }}
          />
        )}
      </AnimatePresence>
    </>
  )
}

/** The second-chance modal: better photos, then run it again. */
function EvidenceModal({
  report, onClose, onDone,
}: { report: FoodReport; onClose: () => void; onDone: () => void }) {
  const [photos, setPhotos] = useState<string[]>([])
  const [note, setNote] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)

  const submit = async () => {
    if (photos.length === 0 || sending) return
    setSending(true)
    setError(null)
    try {
      const res = await fetch(`/api/nutrition/flags/${report.id}/evidence`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ photoUrls: photos, note: note.trim() || undefined }),
      })
      if (!res.ok) {
        const d = await res.json().catch(() => null)
        setError(d?.error || 'Could not send that. Try again.')
        return
      }
      onDone()
    } catch {
      setError('Could not send that. Try again.')
    } finally {
      setSending(false)
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-[70] bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 20 }}
        className="fixed inset-x-3 bottom-3 z-[71] mx-auto max-w-md overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xl dark:border-zinc-700 dark:bg-zinc-900 sm:inset-x-auto sm:right-6 sm:bottom-6"
        style={{ maxHeight: '85vh' }}
      >
        <div className="flex items-center justify-between border-b border-zinc-200 px-4 py-3 dark:border-zinc-800">
          <h2 className="text-sm font-bold text-zinc-900 dark:text-white">Send better evidence</h2>
          <button onClick={onClose} aria-label="Close" className="rounded-lg p-1 text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3 overflow-y-auto px-4 py-3" style={{ maxHeight: 'calc(85vh - 110px)' }}>
          <div>
            <p className="text-sm font-semibold text-zinc-900 dark:text-white">{report.food.name}</p>
            {report.food.brand && <p className="text-xs text-zinc-500">{report.food.brand}</p>}
          </div>

          <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-700 dark:bg-zinc-800/50">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">What we found</p>
            <p className="mt-1 text-xs leading-relaxed text-zinc-600 dark:text-zinc-300">
              {report.resolution || 'We checked and did not change the record.'}
            </p>
            <p className="mt-2 text-xs leading-relaxed text-zinc-600 dark:text-zinc-300">
              Websites and databases can all be copying the same out-of-date figure. Your packet is the
              newest source there is &mdash; send it and a person will check it by hand.
            </p>
          </div>

          <EvidencePhotoPicker photos={photos} onChange={setPhotos} onError={setError} emphatic disabled={sending} />

          <textarea
            value={note}
            onChange={e => setNote(e.target.value)}
            rows={2}
            placeholder="Anything else we should know? (optional)"
            data-testid="evidence-note"
            className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 placeholder-zinc-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white"
          />

          {error && <p className="text-xs font-medium text-red-600 dark:text-red-400">{error}</p>}
        </div>

        <div className="border-t border-zinc-200 px-4 py-3 dark:border-zinc-800">
          <button
            onClick={submit}
            disabled={photos.length === 0 || sending}
            data-testid="submit-evidence"
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-zinc-900 py-3 text-sm font-bold text-white disabled:opacity-40 dark:bg-white dark:text-black"
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {sending ? 'Sending…' : 'Send and re-check'}
          </button>
        </div>
      </motion.div>
    </>
  )
}
