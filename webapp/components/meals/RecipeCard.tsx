"use client"

import Link from 'next/link'
import { motion } from 'framer-motion'
import { ScrollText, Loader2, Check, BookmarkPlus } from 'lucide-react'
import { Card } from '@/components/ui'

interface RecipeCardProps {
  id: string
  name: string
  description?: string
  imageUrl?: string
  tags: string[]
  perServing?: { calories: number; protein: number; carbs: number; fats: number }
  ingredientCount: number
  /** True once the recipe has been saved as a Food (recipe.savedFoodId set). */
  saved: boolean
  busy?: boolean
  /** Save-or-Log: first tap saves the recipe as a Food; once saved, logs it. */
  onSaveOrLog: () => void
}

function titleCaseTag(tag: string): string {
  return tag.split(/[-_\s]+/).map(p => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()).join('-')
}

export default function RecipeCard({
  id, name, description, imageUrl, tags, perServing, ingredientCount,
  saved, busy, onSaveOrLog,
}: RecipeCardProps) {
  const cal = Math.round(perServing?.calories ?? 0)
  const protein = Math.round(perServing?.protein ?? 0)
  const carbs = Math.round(perServing?.carbs ?? 0)
  const fats = Math.round(perServing?.fats ?? 0)
  const totalGrams = protein + carbs + fats
  const pPct = totalGrams > 0 ? (protein / totalGrams) * 100 : 0
  const cPct = totalGrams > 0 ? (carbs / totalGrams) * 100 : 0
  const fPct = totalGrams > 0 ? (fats / totalGrams) * 100 : 0

  return (
    <Card as={motion.div} layout
      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.2 }} className="overflow-hidden !p-0"
    >
      <div className="flex">
        <Link href={`/dashboard/recipes/${id}`} className="relative h-24 w-24 shrink-0 sm:h-28 sm:w-28">
          {imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={imageUrl} alt={name} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-violet-100 via-purple-100 to-fuchsia-100 text-violet-600/70 dark:from-violet-900/30 dark:via-purple-900/30 dark:to-fuchsia-900/30 dark:text-violet-200/60">
              <ScrollText className="h-8 w-8" />
            </div>
          )}
        </Link>

        <div className="flex-1 min-w-0 p-3 sm:p-4">
          <Link href={`/dashboard/recipes/${id}`} className="block min-w-0">
            <h3 className="truncate text-sm font-semibold text-zinc-900 dark:text-white sm:text-base">{name}</h3>
            {description && <p className="mt-0.5 line-clamp-1 text-xs text-zinc-500 dark:text-zinc-400">{description}</p>}
          </Link>

          {tags.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {tags.slice(0, 3).map(t => (
                <span key={t} className="rounded-md bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">{titleCaseTag(t)}</span>
              ))}
            </div>
          )}

          <div className="mt-2 flex items-center gap-2">
            <span className="text-xs font-semibold tabular-nums text-zinc-700 dark:text-zinc-300">{cal} cal/serving</span>
            <span className="text-[10px] text-zinc-400">{ingredientCount} {ingredientCount === 1 ? 'ingredient' : 'ingredients'}</span>
            {totalGrams > 0 && (
              <div className="ml-auto flex h-1.5 w-20 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
                <div className="bg-blue-500" style={{ width: `${pPct}%` }} />
                <div className="bg-green-500" style={{ width: `${cPct}%` }} />
                <div className="bg-amber-500" style={{ width: `${fPct}%` }} />
              </div>
            )}
          </div>

          {/* Save-or-Log: recipes are never logged directly — first tap saves the
              recipe as a Food, then logs that Food. More controls (convert,
              delete) live on the recipe's detail page. */}
          <button
            onClick={onSaveOrLog}
            disabled={busy}
            className="mt-2.5 flex w-full items-center justify-center gap-1.5 rounded-lg bg-zinc-900 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-black disabled:opacity-60 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : saved ? <><Check className="h-3.5 w-3.5" /> Log</>
              : <><BookmarkPlus className="h-3.5 w-3.5" /> Save as food</>}
          </button>
        </div>
      </div>
    </Card>
  )
}
