"use client"

// LabelPhotoPanel — a small "Scan label" camera affordance that sits inside
// FoodSearchModal, beside the barcode button in the header.
//
// Flow: user taps the camera icon → picks a label photo → resized + base64'd
// → productFinder.find({ imageBase64 }) → maps ProductMatch[] into the same
// FoodResult shape the barcode path uses and calls onResults so the parent
// can setSelectedFood / setResults on them.
//
// Errors surface inline (gentle one-liner, no hard modal). Never imports any
// server-only module.

import { useRef, useCallback } from 'react'
import { Loader2, ScanLine } from 'lucide-react'
import { resizeImageToBlob } from '@/lib/imageResize'
import { blobToDataUrl } from '@/lib/blobToBase64'
import {
  productFinder,
  ProductUnavailableError,
} from '@/lib/nutrition/aiEngine'
import type { ProductMatch } from '@/lib/nutrition/aiSeams'

// ── Types the panel receives from FoodSearchModal ─────────────────────────────

// We only need the minimal shape of a FoodResult to feed the modal. Using an
// explicit local type keeps us decoupled from the modal's internal interface.
export interface LabelFoodResult {
  _id: string
  name: string
  brand?: string
  servingSize: number
  servingUnit: string
  nutrition: {
    calories: number
    protein: number
    carbs: number
    fats: number
  }
  source: 'ai'
}

export interface LabelPhotoPanelProps {
  /** Whether the AI lookup is in flight */
  loading: boolean
  /** Inline error message (null = clear) */
  error: string | null
  /** Called when loading starts (true) or ends (false) */
  onLoadingChange: (v: boolean) => void
  /** Called with an inline error message or null to clear */
  onError: (msg: string | null) => void
  /** Called with the mapped results — parent feeds them to setResults + setSelectedFood */
  onResults: (foods: LabelFoodResult[]) => void
}

// ── Mapping ───────────────────────────────────────────────────────────────────

function mapMatchToFood(m: ProductMatch, idx: number): LabelFoodResult {
  return {
    // Synthetic id — no Food doc exists yet; the modal's import-on-pick path
    // will persist it just like any other external result. Using a timestamp +
    // index avoids collisions across multiple scans in one session.
    _id: `ai-label-${Date.now()}-${idx}`,
    name: m.name,
    brand: m.brand,
    servingSize: m.servingSize ?? 100,
    servingUnit: m.servingUnit ?? 'g',
    nutrition: {
      calories: Math.round(m.nutrition.calories ?? 0),
      protein: Math.round((m.nutrition.protein ?? 0) * 10) / 10,
      carbs: Math.round((m.nutrition.carbs ?? 0) * 10) / 10,
      fats: Math.round((m.nutrition.fats ?? 0) * 10) / 10,
    },
    source: 'ai' as const,
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function LabelPhotoPanel({
  loading,
  error,
  onLoadingChange,
  onError,
  onResults,
}: LabelPhotoPanelProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return

    onError(null)
    onLoadingChange(true)

    try {
      const resized = await resizeImageToBlob(file, { maxDim: 1024, quality: 0.6 })
      const dataUrl = await blobToDataUrl(resized)

      const matches = await productFinder.find({ imageBase64: dataUrl }, { userId: '' })

      if (!matches || matches.length === 0) {
        onError("Couldn't read that label. Try a clearer photo or search by name.")
        return
      }

      const foods = matches.map((m, i) => mapMatchToFood(m, i))
      onResults(foods)
    } catch (err) {
      if (err instanceof ProductUnavailableError) {
        onError("Couldn't read that label. Try searching by name instead.")
      } else {
        console.error('[LabelPhotoPanel] productFinder error', err)
        onError("Couldn't read that label. Try a clearer photo.")
      }
    } finally {
      onLoadingChange(false)
    }
  }, [onError, onLoadingChange, onResults])

  return (
    <>
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        onChange={handleFileChange}
        aria-hidden="true"
      />

      {/* Camera button — styled to match the barcode button beside it */}
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        disabled={loading}
        aria-label="Scan label photo"
        title="Scan a nutrition label"
        className="flex h-8 w-8 items-center justify-center rounded-full text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700 disabled:opacity-50 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
      >
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <ScanLine className="h-5 w-5" />
        )}
      </button>

      {/* Inline error — rendered just below the file input trigger, in the
          header area. The parent decides where to visually mount this panel. */}
      {error && (
        <div className="mt-1 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:bg-amber-900/20 dark:text-amber-300">
          {error}
        </div>
      )}
    </>
  )
}
