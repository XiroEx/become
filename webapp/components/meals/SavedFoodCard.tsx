"use client"

import Link from 'next/link'
import { motion } from 'framer-motion'
import { Loader2, Bookmark, Check, Plus } from 'lucide-react'
import FoodThumbnail from '@/components/nutrition/FoodThumbnail'
import { Card } from '@/components/ui'

interface SavedFoodCardProps {
  id: string
  name: string
  brand?: string
  servingSize: number
  servingUnit: string
  displayLabel?: string
  calories: number
  protein: number
  carbs: number
  fats: number
  isVerified?: boolean
  imageUrl?: string
  category?: string
  /** Currently logging this food to today */
  logging?: boolean
  /** Just logged — show the success indicator briefly */
  logged?: boolean
  /** Currently being unsaved */
  removing?: boolean
  onLog: () => void
  onRemove: () => void
}

export default function SavedFoodCard({
  id,
  name,
  brand,
  servingSize,
  servingUnit,
  displayLabel,
  calories,
  protein,
  carbs,
  fats,
  isVerified,
  imageUrl,
  category,
  logging,
  logged,
  removing,
  onLog,
  onRemove,
}: SavedFoodCardProps) {
  const servingText = displayLabel || `${servingSize} ${servingUnit}`

  return (
    <Card as={motion.div}
      layout
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      variant="compact"
      className="group flex items-center gap-3 transition-colors hover:border-zinc-300 dark:hover:border-zinc-700"
    >
      {/* Tappable area — thumbnail + info routes to detail */}
      <Link
        href={`/dashboard/foods/${id}`}
        className="-my-3 -ml-3 flex min-w-0 flex-1 items-center gap-3 py-3 pl-3 pr-1 transition-colors active:bg-zinc-50 dark:active:bg-zinc-800"
      >
        {/* Thumbnail — actual image when available, category-tinted icon as fallback */}
        <FoodThumbnail
          name={name}
          category={category}
          imageUrl={imageUrl}
          className="h-14 w-14 rounded-lg"
          iconClassName="h-7 w-7"
        />

        {/* Info */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <p className="truncate text-sm font-semibold text-zinc-900 dark:text-white">{name}</p>
            {isVerified && (
              <span className="shrink-0 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                ✓
              </span>
            )}
          </div>
          <p className="truncate text-xs text-zinc-500 dark:text-zinc-400">
            {brand && <span>{brand} · </span>}
            <span>{servingText}</span>
            <span> · {calories} cal</span>
          </p>
          <p className="mt-0.5 truncate text-[10px] tabular-nums text-zinc-400 dark:text-zinc-500">
            P {protein}g · C {carbs}g · F {fats}g
          </p>
        </div>
      </Link>

      {/* Actions */}
      <div className="flex shrink-0 items-center gap-1.5">
        <button
          type="button"
          onClick={onLog}
          disabled={logging || logged}
          aria-label="Log to today"
          title="Log to today"
          className={`flex h-9 w-9 items-center justify-center rounded-lg text-sm font-semibold transition-colors ${
            logged
              ? 'bg-emerald-500 text-white'
              : 'bg-zinc-900 text-white hover:bg-black disabled:opacity-60 dark:bg-white dark:text-black dark:hover:bg-zinc-200'
          }`}
        >
          {logging ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : logged ? (
            <Check className="h-4 w-4" />
          ) : (
            <Plus className="h-4 w-4" />
          )}
        </button>
        <button
          type="button"
          onClick={onRemove}
          disabled={removing}
          aria-label="Remove from My Foods"
          title="Remove from My Foods"
          className="flex h-9 w-9 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600 disabled:opacity-50 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
        >
          {removing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bookmark className="h-4 w-4 fill-current text-amber-500" />}
        </button>
      </div>
    </Card>
  )
}
