'use client'

// "Something look wrong?" — report bad catalogue data.
//
// This does NOT edit the food. The user's report is evidence handed to the
// verification agent, which is the only writer of the shared catalogue. Fixing
// their OWN log is a separate action on the edit modal behind this sheet, and
// that is deliberate: it unblocks them in seconds without letting one person's
// misreading of a label change what everybody else sees.

import { useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { AlertTriangle, Check, X, Loader2, Pencil, Camera, ImagePlus, Trash2 } from 'lucide-react'
import { getToken } from '@/lib/clientAuth'
import { resizeImageToBlob } from '@/lib/imageResize'

type Kind = 'calories' | 'macros' | 'serving' | 'other'

const KINDS: { id: Kind; label: string }[] = [
  { id: 'calories', label: 'Calories look wrong' },
  { id: 'macros', label: 'Macros look wrong' },
  { id: 'serving', label: 'Serving size is wrong' },
  { id: 'other', label: 'Something else' },
]

/** Per-serving values the user can correct for their own entry. */
export interface LogCorrection {
  calories: number
  protein: number
  carbs: number
  fats: number
}

export interface FlagFoodSheetProps {
  isOpen: boolean
  foodId: string
  foodName: string
  onClose: () => void
  /** Current per-serving values, prefilled into the correction fields. */
  currentNutrition?: LogCorrection
  /**
   * When provided, the sheet offers "just fix it for my entry" ALONGSIDE
   * reporting. Offered BEFORE logging on purpose: making someone log a number
   * they can see is wrong, and only then discover an edit screen, is a bad
   * trade — most people would never find the edit at all.
   *
   * This only ever touches their own log. The shared catalogue is written by
   * the verification agent, never by a user.
   */
  onApplyToLog?: (values: LogCorrection) => void
}

export default function FlagFoodSheet({
  isOpen, foodId, foodName, onClose, currentNutrition, onApplyToLog,
}: FlagFoodSheetProps) {
  // Multi-select: "the calories AND the macros are both off" is an ordinary
  // report, and forcing one radio button made people file the half of it they
  // thought we were more likely to believe.
  const [kinds, setKinds] = useState<Kind[]>(['calories'])
  const toggleKind = (id: Kind) =>
    setKinds((prev) =>
      prev.includes(id)
        // Never let them submit nothing: the last one stays selected.
        ? (prev.length === 1 ? prev : prev.filter((k) => k !== id))
        : [...prev, id],
    )
  const [note, setNote] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [fixing, setFixing] = useState(false)
  const [draft, setDraft] = useState<LogCorrection | null>(null)
  // The panel photo: the strongest evidence available, because the reporter is
  // holding the package and a database can only ever report what someone typed.
  // Server side it also overrides the recently-verified cooldown for that
  // reason. Uploaded ahead of the report so the flag carries a durable URL
  // rather than an object URL that dies with the tab.
  const [photoUrl, setPhotoUrl] = useState<string | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement | null>(null)
  const galleryRef = useRef<HTMLInputElement | null>(null)

  const clearPhoto = () => {
    // Release the object URL rather than leaking it for the tab's lifetime.
    setPhotoPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return null
    })
    setPhotoUrl(null)
  }

  const pickPhoto = async (file: File | undefined) => {
    // The button is disabled mid-upload, but the input can still be driven
    // directly, and a second pass would upload twice and strand the first blob.
    if (!file || uploading) return
    setUploading(true)
    setError(null)
    try {
      const small = await resizeImageToBlob(file, { maxDim: 1024, quality: 0.6 })
      const form = new FormData()
      form.append('file', new File([small], 'label.jpg', { type: 'image/jpeg' }))
      const token = getToken()
      const res = await fetch('/api/nutrition/flags/image', {
        method: 'POST',
        headers: { ...(token && { Authorization: `Bearer ${token}` }) },
        body: form,
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data?.imageUrl) {
        setError(data?.error || 'Could not upload that photo.')
        return
      }
      setPhotoUrl(data.imageUrl)
      setPhotoPreview((prev) => {
        if (prev) URL.revokeObjectURL(prev)
        return URL.createObjectURL(small)
      })
    } catch {
      setError('Could not read that photo.')
    } finally {
      setUploading(false)
    }
  }

  const startFixing = () => {
    setDraft(currentNutrition ?? { calories: 0, protein: 0, carbs: 0, fats: 0 })
    setFixing(true)
  }

  const applyFix = () => {
    if (!draft || !onApplyToLog) return
    onApplyToLog(draft)
    close()
  }

  const submit = async () => {
    setSubmitting(true)
    setError(null)
    try {
      const token = getToken()
      const res = await fetch(`/api/nutrition/foods/${foodId}/flag`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) },
        body: JSON.stringify({
          // `kind` stays for compatibility with the stored shape; `kinds`
          // carries the full selection.
          kind: kinds[0],
          kinds,
          note: note.trim() || undefined,
          photoUrl: photoUrl || undefined,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        // 429 covers both "already reported" and the daily cap. Both are
        // legitimate answers to show the user, not failures to hide.
        setError(data?.error || 'Could not send that report.')
        return
      }
      setResult(data?.message || 'Thanks — we will check this.')
    } catch {
      setError('Network error. Try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const close = () => {
    setResult(null)
    setError(null)
    setNote('')
    setFixing(false)
    setDraft(null)
    setKinds(['calories'])
    clearPhoto()
    onClose()
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[80] flex items-end justify-center bg-black/50 sm:items-center"
          onClick={close}
        >
          <motion.div
            initial={{ y: 32, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 32, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-t-2xl bg-white p-5 pb-8 dark:bg-zinc-900 sm:rounded-2xl sm:pb-5"
          >
            {fixing && draft ? (
              <>
                <div className="mb-3 flex items-start justify-between gap-3">
                  <p className="text-sm font-semibold text-zinc-900 dark:text-white">Fix it for this entry</p>
                  <button onClick={close} aria-label="Close" className="text-zinc-400 hover:text-zinc-600">
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <p className="mb-4 text-xs text-zinc-500 dark:text-zinc-400">
                  Per serving, for your log only. The shared food isn&rsquo;t changed — report it below and we&rsquo;ll
                  check it against the label.
                </p>
                <div className="mb-4 grid grid-cols-2 gap-2">
                  {([
                    ['calories', 'Calories'],
                    ['protein', 'Protein (g)'],
                    ['carbs', 'Carbs (g)'],
                    ['fats', 'Fats (g)'],
                  ] as const).map(([key, label]) => (
                    <label key={key} className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                      {label}
                      <input
                        type="number"
                        inputMode="decimal"
                        min={0}
                        value={String(draft[key])}
                        onChange={(e) =>
                          setDraft({ ...draft, [key]: Math.max(0, Number(e.target.value) || 0) })
                        }
                        aria-label={label}
                        className="mt-1 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm font-medium text-zinc-900 dark:border-zinc-600 dark:bg-zinc-800 dark:text-white"
                      />
                    </label>
                  ))}
                </div>
                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => setFixing(false)}
                    className="flex-1 rounded-xl border border-zinc-200 py-2.5 text-sm font-semibold text-zinc-700 dark:border-zinc-700 dark:text-zinc-300"
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    onClick={applyFix}
                    className="flex-1 rounded-xl bg-zinc-900 py-2.5 text-sm font-semibold text-white dark:bg-white dark:text-black"
                  >
                    Use these values
                  </button>
                </div>
              </>
            ) : result ? (
              <div className="flex flex-col items-center gap-3 py-4 text-center">
                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-emerald-600">
                  <Check className="h-5 w-5 text-white" />
                </div>
                <p className="text-sm font-semibold text-zinc-900 dark:text-white">Report sent</p>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">{result}</p>
                <p className="text-xs text-zinc-400 dark:text-zinc-500">
                  Your own entry is unchanged — edit it behind this sheet if the numbers are off for you.
                </p>
                <button
                  onClick={close}
                  className="mt-1 rounded-xl bg-zinc-900 px-5 py-2 text-sm font-semibold text-white dark:bg-white dark:text-black"
                >
                  Done
                </button>
              </div>
            ) : (
              <>
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" />
                    <p className="text-sm font-semibold text-zinc-900 dark:text-white">
                      Something look wrong?
                    </p>
                  </div>
                  <button onClick={close} aria-label="Close" className="text-zinc-400 hover:text-zinc-600">
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <p className="mb-4 text-xs text-zinc-500 dark:text-zinc-400">
                  Tell us what looks off about <span className="font-medium">{foodName}</span>{' '}
                  and we&rsquo;ll check it against the label. This reports the food for everyone; it
                  doesn&rsquo;t change your entry.
                </p>

                {onApplyToLog && (
                  <button
                    type="button"
                    onClick={startFixing}
                    className="mb-4 flex w-full items-center justify-center gap-1.5 rounded-xl border border-zinc-300 py-2.5 text-sm font-semibold text-zinc-800 transition-colors hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-100 dark:hover:bg-zinc-800"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    Fix it for this entry
                  </button>
                )}

                <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                  What&rsquo;s off? Pick all that apply
                </p>
                <div className="mb-4 space-y-1.5">
                  {KINDS.map((k) => (
                    <button
                      key={k.id}
                      type="button"
                      onClick={() => toggleKind(k.id)}
                      aria-pressed={kinds.includes(k.id)}
                      className={`flex w-full items-center gap-2 rounded-xl border px-3 py-2.5 text-left text-sm transition-colors ${
                        kinds.includes(k.id)
                          ? 'border-zinc-900 bg-zinc-900 text-white dark:border-white dark:bg-white dark:text-black'
                          : 'border-zinc-200 text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800'
                      }`}
                    >
                      {k.label}
                    </button>
                  ))}
                </div>

                {/* Panel photo — the strongest evidence we can collect, since the
                    reporter is holding the package.
                    TWO inputs, same as the plate-scan flow. `capture` does NOT
                    degrade to a file pick on iOS: it removes the photo-library
                    option entirely and hard-locks the control to the camera, so
                    anyone who already shot the label cannot send it. The gallery
                    input has no `capture` for exactly that reason. */}
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  data-testid="flag-photo-input"
                  onChange={(e) => {
                    void pickPhoto(e.target.files?.[0])
                    // Reset so re-picking the SAME file still fires a change.
                    e.target.value = ''
                  }}
                />
                <input
                  ref={galleryRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  data-testid="flag-photo-gallery-input"
                  onChange={(e) => {
                    void pickPhoto(e.target.files?.[0])
                    e.target.value = ''
                  }}
                />
                {photoPreview ? (
                  <div className="mb-4 flex items-center gap-3 rounded-xl border border-zinc-200 p-2 dark:border-zinc-700">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={photoPreview} alt="Nutrition label" className="h-14 w-14 rounded-lg object-cover" />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold text-zinc-900 dark:text-white">Label attached</p>
                      <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                        We&rsquo;ll read it against this food.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={clearPhoto}
                      aria-label="Remove photo"
                      className="shrink-0 rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-red-600 dark:hover:bg-zinc-800"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ) : uploading ? (
                  <div className="mb-4 flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-zinc-300 py-2.5 text-sm font-medium text-zinc-600 dark:border-zinc-600 dark:text-zinc-300">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Uploading&hellip;
                  </div>
                ) : (
                  <div className="mb-4 grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => fileRef.current?.click()}
                      className="flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-zinc-300 py-2.5 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
                    >
                      <Camera className="h-3.5 w-3.5 shrink-0" />
                      Take photo
                    </button>
                    <button
                      type="button"
                      onClick={() => galleryRef.current?.click()}
                      className="flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-zinc-300 py-2.5 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
                    >
                      <ImagePlus className="h-3.5 w-3.5 shrink-0" />
                      Upload photo
                    </button>
                  </div>
                )}

                <label htmlFor="flag-note" className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                  Anything else? (optional)
                </label>
                <textarea
                  id="flag-note"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={2}
                  maxLength={1000}
                  placeholder="e.g. my label says 45 cal per container"
                  className="mb-4 w-full resize-none rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 dark:border-zinc-600 dark:bg-zinc-800 dark:text-white"
                />

                {error && <p className="mb-3 text-xs font-medium text-red-600 dark:text-red-400">{error}</p>}

                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={close}
                    className="flex-1 rounded-xl border border-zinc-200 py-2.5 text-sm font-semibold text-zinc-700 dark:border-zinc-700 dark:text-zinc-300"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={submit}
                    disabled={submitting}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-amber-600 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    {submitting ? 'Sending…' : 'Report it'}
                  </button>
                </div>
              </>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
