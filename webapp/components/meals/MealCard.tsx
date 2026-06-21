"use client"

import Link from 'next/link'
import { motion } from 'framer-motion'
import { Pencil, ChefHat, Loader2, Check } from 'lucide-react'
import { Card } from '@/components/ui'

interface MealCardProps {
  id: string
  name: string
  description?: string
  imageUrl?: string
  tags: string[]
  totalNutrition?: {
    calories: number
    protein: number
    carbs: number
    fats: number
  }
  itemCount: number
  isOwner: boolean
  isVerified?: boolean
  applying?: boolean
  applied?: boolean
  onApply: () => void
}

function titleCaseTag(tag: string): string {
  return tag
    .split(/[-_\s]+/)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join('-')
}

export default function MealCard({
  id,
  name,
  description,
  imageUrl,
  tags,
  totalNutrition,
  itemCount,
  isOwner,
  isVerified,
  applying,
  applied,
  onApply,
}: MealCardProps) {
  const cal = Math.round(totalNutrition?.calories ?? 0)
  const protein = Math.round(totalNutrition?.protein ?? 0)
  const carbs = Math.round(totalNutrition?.carbs ?? 0)
  const fats = Math.round(totalNutrition?.fats ?? 0)
  const totalGrams = protein + carbs + fats
  const proteinPct = totalGrams > 0 ? (protein / totalGrams) * 100 : 0
  const carbsPct = totalGrams > 0 ? (carbs / totalGrams) * 100 : 0
  const fatsPct = totalGrams > 0 ? (fats / totalGrams) * 100 : 0

  return (
    <Card as={motion.div}
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.2 }}
      className="overflow-hidden !p-0"
    >
      <div className="flex">
        {/* Thumbnail / icon */}
        <div className="relative h-24 w-24 shrink-0 sm:h-28 sm:w-28">
          {imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={imageUrl} alt={name} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-amber-100 via-orange-100 to-rose-100 text-amber-600/70 dark:from-amber-900/30 dark:via-orange-900/30 dark:to-rose-900/30 dark:text-amber-200/60">
              <ChefHat className="h-8 w-8" />
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0 p-3 sm:p-4">
          <div className="flex items-start justify-between gap-2">
            <Link href={`/dashboard/meals/${id}`} className="min-w-0 flex-1">
              <h3 className="truncate text-sm font-semibold text-zinc-900 dark:text-white sm:text-base">
                {name}
                {isVerified && (
                  <span className="ml-1.5 inline-flex items-center rounded-md bg-emerald-100 px-1 py-0.5 text-[10px] font-bold uppercase text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                    Verified
                  </span>
                )}
              </h3>
              {description && (
                <p className="mt-0.5 line-clamp-1 text-xs text-zinc-500 dark:text-zinc-400">
                  {description}
                </p>
              )}
            </Link>
            {isOwner && (
              <Link
                href={`/dashboard/meals/${id}/edit`}
                className="shrink-0 rounded-md p-1.5 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
                aria-label="Edit recipe"
              >
                <Pencil className="h-3.5 w-3.5" />
              </Link>
            )}
          </div>

          {/* Tags */}
          {tags.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {tags.slice(0, 3).map(tag => (
                <span
                  key={tag}
                  className="rounded-md bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
                >
                  {titleCaseTag(tag)}
                </span>
              ))}
              {tags.length > 3 && (
                <span className="text-[10px] text-zinc-400">+{tags.length - 3}</span>
              )}
            </div>
          )}

          {/* Calories + macro split bar */}
          <div className="mt-2 flex items-center gap-2">
            <span className="text-xs font-semibold tabular-nums text-zinc-700 dark:text-zinc-300">
              {cal} cal
            </span>
            <span className="text-[10px] text-zinc-400">
              {itemCount} {itemCount === 1 ? 'item' : 'items'}
            </span>
            {totalGrams > 0 && (
              <div className="ml-auto flex h-1.5 w-20 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
                <div className="bg-blue-500" style={{ width: `${proteinPct}%` }} />
                <div className="bg-green-500" style={{ width: `${carbsPct}%` }} />
                <div className="bg-amber-500" style={{ width: `${fatsPct}%` }} />
              </div>
            )}
          </div>

          {/* Log button. More controls (convert, delete, notes) live on the
              meal's detail page — tap the card to open it. */}
          <button
            onClick={onApply}
            disabled={applying || applied}
            className="mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-lg bg-zinc-900 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-black disabled:opacity-60 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
          >
            {applying ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Logging…
              </>
            ) : applied ? (
              <>
                <Check className="h-3.5 w-3.5" />
                Logged!
              </>
            ) : (
              'Log to today'
            )}
          </button>
        </div>
      </div>
    </Card>
  )
}
