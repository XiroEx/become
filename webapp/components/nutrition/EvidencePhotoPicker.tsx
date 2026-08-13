'use client'

/**
 * Multi-photo capture for a food report.
 *
 * One frame rarely carries both the barcode and the nutrition panel, and the
 * reviewer needs both: the barcode says WHICH product, the panel says what is
 * actually printed on it. Given only a panel, the reviewer has no way to tie
 * the numbers to the thing that was scanned — which is exactly how it talked
 * itself into "that photo must be a different variant" and confirmed a record
 * the member's own packet contradicted.
 */

import { useRef, useState } from 'react'
import { Camera, Loader2, X, ImagePlus } from 'lucide-react'
import { getToken } from '@/lib/clientAuth'
import { resizeImageToBlob } from '@/lib/imageResize'

export const MAX_EVIDENCE_PHOTOS = 6

interface Props {
  photos: string[]
  onChange: (next: string[]) => void
  onError?: (message: string) => void
  /** Emphasise the barcode+panel ask. Used on the second-chance flow. */
  emphatic?: boolean
  disabled?: boolean
}

export default function EvidencePhotoPicker({ photos, onChange, onError, emphatic, disabled }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const atLimit = photos.length >= MAX_EVIDENCE_PHOTOS

  const upload = async (files: FileList | null) => {
    // The button disables mid-upload, but the input can still be driven
    // directly; a second pass would upload twice and strand the first blob.
    if (!files?.length || uploading || disabled) return
    setUploading(true)
    try {
      const room = MAX_EVIDENCE_PHOTOS - photos.length
      const picked = Array.from(files).slice(0, room)
      const added: string[] = []

      for (const file of picked) {
        // Resize before upload: a modern phone photo is several MB and the
        // reviewer only ever reads it at panel-legible size.
        const small = await resizeImageToBlob(file, { maxDim: 1024, quality: 0.6 })
        const form = new FormData()
        form.append('file', new File([small], 'label.jpg', { type: 'image/jpeg' }))
        const res = await fetch('/api/nutrition/flags/image', {
          method: 'POST',
          headers: { Authorization: `Bearer ${getToken() ?? ''}` },
          body: form,
        })
        // The route returns `imageUrl`, not `url`.
        const data = await res.json().catch(() => null)
        if (!res.ok || !data?.imageUrl) {
          onError?.(data?.error || 'Could not upload that photo.')
          continue
        }
        added.push(data.imageUrl as string)
      }

      if (added.length) onChange([...photos, ...added])
    } catch {
      onError?.('Could not upload that photo.')
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  return (
    <div>
      <div
        className={`rounded-xl border p-3 ${
          emphatic
            ? 'border-amber-300 bg-amber-50 dark:border-amber-900/50 dark:bg-amber-950/20'
            : 'border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800/50'
        }`}
      >
        <p className={`text-xs font-semibold ${emphatic ? 'text-amber-900 dark:text-amber-200' : 'text-zinc-700 dark:text-zinc-200'}`}>
          {emphatic ? 'One photo with the barcode AND the panel is worth ten without' : 'Add photos of the package'}
        </p>
        <p className={`mt-1 text-[11px] leading-relaxed ${emphatic ? 'text-amber-800 dark:text-amber-300' : 'text-zinc-500 dark:text-zinc-400'}`}>
          The barcode proves which product it is. The nutrition panel proves what is printed on it.
          {' '}Without both in evidence we cannot tell a wrong number from a different product.
        </p>

        {photos.length > 0 && (
          <div className="mt-3 grid grid-cols-3 gap-2">
            {photos.map((url, i) => (
              <div key={url} className="relative overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-700">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt={`Evidence ${i + 1}`} className="h-20 w-full object-cover" />
                <button
                  type="button"
                  onClick={() => onChange(photos.filter(p => p !== url))}
                  disabled={disabled}
                  aria-label={`Remove photo ${i + 1}`}
                  className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white transition-colors hover:bg-black/80"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* No `capture` attribute on purpose: forcing the camera would remove
            the library, and the panel shot people already took is often there. */}
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          onChange={e => upload(e.target.files)}
          className="hidden"
          data-testid="evidence-file-input"
        />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading || atLimit || disabled}
          data-testid="add-evidence-photo"
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg border border-zinc-300 bg-white py-2 text-xs font-semibold text-zinc-700 transition-colors hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-200"
        >
          {uploading ? (
            <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Uploading…</>
          ) : atLimit ? (
            <>Maximum {MAX_EVIDENCE_PHOTOS} photos</>
          ) : photos.length === 0 ? (
            <><Camera className="h-3.5 w-3.5" /> Add a photo</>
          ) : (
            <><ImagePlus className="h-3.5 w-3.5" /> Add another ({photos.length}/{MAX_EVIDENCE_PHOTOS})</>
          )}
        </button>
      </div>
    </div>
  )
}
