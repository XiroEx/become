"use client"

import {
  Apple,
  Beef,
  Carrot,
  Cherry,
  Coffee,
  Cookie,
  Croissant,
  CupSoda,
  Drumstick,
  Egg,
  Fish,
  GlassWater,
  Grape,
  IceCreamCone,
  Milk,
  Pizza,
  Salad,
  Sandwich,
  Soup,
  Wheat,
  Wine,
  Lollipop,
  Banana,
  Utensils,
  Droplet,
} from 'lucide-react'

// ---------------------------------------------------------------------------
// Category-based fallback thumbnail for foods without an imageUrl. Renders a
// gradient block + a category-appropriate lucide icon. Variant within the
// category is chosen by hashing the food name so the same food always shows
// the same thumbnail (stable across renders + sessions).
// ---------------------------------------------------------------------------

type Variant = {
  // Tailwind gradient classes — light + dark already handled together
  gradient: string
  Icon: React.ComponentType<{ className?: string }>
  iconColor: string
}

// 5+ variants per category. Mix gradients with category-appropriate icons so
// foods within the same category still feel visually distinct.
const PALETTE: Record<string, Variant[]> = {
  Protein: [
    { gradient: 'from-rose-200 to-red-300 dark:from-rose-900/50 dark:to-red-900/40',     Icon: Beef,      iconColor: 'text-rose-700 dark:text-rose-300' },
    { gradient: 'from-orange-200 to-amber-300 dark:from-orange-900/50 dark:to-amber-900/40', Icon: Drumstick, iconColor: 'text-orange-700 dark:text-orange-300' },
    { gradient: 'from-amber-200 to-yellow-300 dark:from-amber-900/50 dark:to-yellow-900/40', Icon: Egg,       iconColor: 'text-amber-700 dark:text-amber-200' },
    { gradient: 'from-sky-200 to-cyan-300 dark:from-sky-900/50 dark:to-cyan-900/40',     Icon: Fish,      iconColor: 'text-sky-700 dark:text-sky-300' },
    { gradient: 'from-pink-200 to-rose-300 dark:from-pink-900/50 dark:to-rose-900/40',   Icon: Beef,      iconColor: 'text-pink-700 dark:text-pink-300' },
  ],
  Grain: [
    { gradient: 'from-amber-200 to-yellow-300 dark:from-amber-900/50 dark:to-yellow-900/40',  Icon: Wheat,     iconColor: 'text-amber-700 dark:text-amber-200' },
    { gradient: 'from-yellow-200 to-orange-300 dark:from-yellow-900/50 dark:to-orange-900/40', Icon: Sandwich,  iconColor: 'text-yellow-700 dark:text-yellow-200' },
    { gradient: 'from-orange-200 to-amber-300 dark:from-orange-900/50 dark:to-amber-900/40',   Icon: Croissant, iconColor: 'text-orange-700 dark:text-orange-300' },
    { gradient: 'from-stone-200 to-amber-200 dark:from-stone-800/60 dark:to-amber-900/40',     Icon: Pizza,     iconColor: 'text-stone-700 dark:text-stone-200' },
    { gradient: 'from-lime-200 to-yellow-300 dark:from-lime-900/50 dark:to-yellow-900/40',     Icon: Wheat,     iconColor: 'text-lime-700 dark:text-lime-300' },
  ],
  Fruit: [
    { gradient: 'from-rose-200 to-pink-300 dark:from-rose-900/50 dark:to-pink-900/40',         Icon: Apple,     iconColor: 'text-rose-700 dark:text-rose-300' },
    { gradient: 'from-fuchsia-200 to-purple-300 dark:from-fuchsia-900/50 dark:to-purple-900/40', Icon: Grape,     iconColor: 'text-fuchsia-700 dark:text-fuchsia-300' },
    { gradient: 'from-red-200 to-rose-300 dark:from-red-900/50 dark:to-rose-900/40',           Icon: Cherry,    iconColor: 'text-red-700 dark:text-red-300' },
    { gradient: 'from-yellow-200 to-amber-300 dark:from-yellow-900/50 dark:to-amber-900/40',   Icon: Banana,    iconColor: 'text-yellow-700 dark:text-yellow-200' },
    { gradient: 'from-orange-200 to-rose-300 dark:from-orange-900/50 dark:to-rose-900/40',     Icon: Apple,     iconColor: 'text-orange-700 dark:text-orange-300' },
  ],
  Vegetable: [
    { gradient: 'from-emerald-200 to-green-300 dark:from-emerald-900/50 dark:to-green-900/40', Icon: Salad,    iconColor: 'text-emerald-700 dark:text-emerald-300' },
    { gradient: 'from-orange-200 to-amber-300 dark:from-orange-900/50 dark:to-amber-900/40',   Icon: Carrot,   iconColor: 'text-orange-700 dark:text-orange-300' },
    { gradient: 'from-lime-200 to-emerald-300 dark:from-lime-900/50 dark:to-emerald-900/40',   Icon: Salad,    iconColor: 'text-lime-700 dark:text-lime-300' },
    { gradient: 'from-teal-200 to-cyan-300 dark:from-teal-900/50 dark:to-cyan-900/40',         Icon: Soup,     iconColor: 'text-teal-700 dark:text-teal-300' },
    { gradient: 'from-green-200 to-lime-300 dark:from-green-900/50 dark:to-lime-900/40',       Icon: Carrot,   iconColor: 'text-green-700 dark:text-green-300' },
  ],
  Dairy: [
    { gradient: 'from-sky-100 to-blue-200 dark:from-sky-900/50 dark:to-blue-900/40',           Icon: Milk,     iconColor: 'text-sky-700 dark:text-sky-300' },
    { gradient: 'from-blue-100 to-indigo-200 dark:from-blue-900/50 dark:to-indigo-900/40',     Icon: Milk,     iconColor: 'text-blue-700 dark:text-blue-300' },
    { gradient: 'from-yellow-100 to-amber-200 dark:from-yellow-900/40 dark:to-amber-900/40',   Icon: IceCreamCone, iconColor: 'text-yellow-700 dark:text-yellow-200' },
    { gradient: 'from-stone-100 to-zinc-200 dark:from-stone-800/60 dark:to-zinc-800/60',       Icon: Milk,     iconColor: 'text-stone-700 dark:text-stone-300' },
    { gradient: 'from-cyan-100 to-sky-200 dark:from-cyan-900/40 dark:to-sky-900/40',           Icon: IceCreamCone, iconColor: 'text-cyan-700 dark:text-cyan-300' },
  ],
  Fat: [
    { gradient: 'from-yellow-200 to-amber-300 dark:from-yellow-900/50 dark:to-amber-900/40',   Icon: Droplet,  iconColor: 'text-yellow-700 dark:text-yellow-200' },
    { gradient: 'from-amber-200 to-orange-300 dark:from-amber-900/50 dark:to-orange-900/40',   Icon: Droplet,  iconColor: 'text-amber-700 dark:text-amber-300' },
    { gradient: 'from-lime-200 to-yellow-300 dark:from-lime-900/50 dark:to-yellow-900/40',     Icon: Droplet,  iconColor: 'text-lime-700 dark:text-lime-300' },
    { gradient: 'from-orange-200 to-yellow-300 dark:from-orange-900/50 dark:to-yellow-900/40', Icon: Droplet,  iconColor: 'text-orange-700 dark:text-orange-300' },
    { gradient: 'from-stone-200 to-amber-200 dark:from-stone-800/60 dark:to-amber-900/40',     Icon: Droplet,  iconColor: 'text-stone-700 dark:text-stone-300' },
  ],
  Beverage: [
    { gradient: 'from-cyan-200 to-sky-300 dark:from-cyan-900/50 dark:to-sky-900/40',           Icon: GlassWater, iconColor: 'text-cyan-700 dark:text-cyan-300' },
    { gradient: 'from-amber-200 to-orange-300 dark:from-amber-900/50 dark:to-orange-900/40',   Icon: Coffee,     iconColor: 'text-amber-800 dark:text-amber-300' },
    { gradient: 'from-rose-200 to-red-300 dark:from-rose-900/50 dark:to-red-900/40',           Icon: Wine,       iconColor: 'text-rose-700 dark:text-rose-300' },
    { gradient: 'from-orange-200 to-amber-300 dark:from-orange-900/50 dark:to-amber-900/40',   Icon: CupSoda,    iconColor: 'text-orange-700 dark:text-orange-300' },
    { gradient: 'from-blue-200 to-cyan-300 dark:from-blue-900/50 dark:to-cyan-900/40',         Icon: GlassWater, iconColor: 'text-blue-700 dark:text-blue-300' },
  ],
  Condiment: [
    { gradient: 'from-rose-200 to-red-300 dark:from-rose-900/50 dark:to-red-900/40',           Icon: Utensils,  iconColor: 'text-rose-700 dark:text-rose-300' },
    { gradient: 'from-amber-200 to-yellow-300 dark:from-amber-900/50 dark:to-yellow-900/40',   Icon: Utensils,  iconColor: 'text-amber-700 dark:text-amber-200' },
    { gradient: 'from-orange-200 to-rose-300 dark:from-orange-900/50 dark:to-rose-900/40',     Icon: Utensils,  iconColor: 'text-orange-700 dark:text-orange-300' },
    { gradient: 'from-yellow-200 to-orange-300 dark:from-yellow-900/50 dark:to-orange-900/40', Icon: Utensils,  iconColor: 'text-yellow-700 dark:text-yellow-300' },
    { gradient: 'from-red-200 to-orange-300 dark:from-red-900/50 dark:to-orange-900/40',       Icon: Utensils,  iconColor: 'text-red-700 dark:text-red-300' },
  ],
  Snack: [
    { gradient: 'from-amber-200 to-orange-300 dark:from-amber-900/50 dark:to-orange-900/40',   Icon: Cookie,    iconColor: 'text-amber-700 dark:text-amber-300' },
    { gradient: 'from-yellow-200 to-amber-300 dark:from-yellow-900/50 dark:to-amber-900/40',   Icon: IceCreamCone, iconColor: 'text-yellow-700 dark:text-yellow-200' },
    { gradient: 'from-fuchsia-200 to-pink-300 dark:from-fuchsia-900/50 dark:to-pink-900/40',   Icon: Lollipop,  iconColor: 'text-fuchsia-700 dark:text-fuchsia-300' },
    { gradient: 'from-orange-200 to-red-300 dark:from-orange-900/50 dark:to-red-900/40',       Icon: Pizza,     iconColor: 'text-orange-700 dark:text-orange-300' },
    { gradient: 'from-rose-200 to-fuchsia-300 dark:from-rose-900/50 dark:to-fuchsia-900/40',   Icon: Cookie,    iconColor: 'text-rose-700 dark:text-rose-300' },
  ],
  Other: [
    { gradient: 'from-zinc-200 to-stone-300 dark:from-zinc-800/60 dark:to-stone-800/60',       Icon: Utensils,  iconColor: 'text-zinc-600 dark:text-zinc-300' },
    { gradient: 'from-slate-200 to-zinc-300 dark:from-slate-800/60 dark:to-zinc-800/60',       Icon: Utensils,  iconColor: 'text-slate-600 dark:text-slate-300' },
    { gradient: 'from-stone-200 to-neutral-300 dark:from-stone-800/60 dark:to-neutral-800/60', Icon: Apple,     iconColor: 'text-stone-600 dark:text-stone-300' },
    { gradient: 'from-neutral-200 to-zinc-300 dark:from-neutral-800/60 dark:to-zinc-800/60',   Icon: Utensils,  iconColor: 'text-neutral-600 dark:text-neutral-300' },
    { gradient: 'from-gray-200 to-slate-300 dark:from-gray-800/60 dark:to-slate-800/60',       Icon: Utensils,  iconColor: 'text-gray-600 dark:text-gray-300' },
  ],
}

function hashName(name: string): number {
  let h = 0
  for (let i = 0; i < name.length; i++) h = ((h << 5) - h + name.charCodeAt(i)) | 0
  return Math.abs(h)
}

interface FoodThumbnailProps {
  name: string
  category?: string
  imageUrl?: string
  /** Tailwind size classes for the wrapper (e.g. "h-10 w-10 rounded-lg"). */
  className?: string
  /** Tailwind size classes for the icon — must be literal so the JIT picks them up. */
  iconClassName?: string
}

export default function FoodThumbnail({
  name,
  category,
  imageUrl,
  className = 'h-10 w-10 rounded-lg',
  iconClassName = 'h-5 w-5',
}: FoodThumbnailProps) {
  if (imageUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={imageUrl}
        alt={name}
        className={`shrink-0 object-cover ${className}`}
      />
    )
  }

  const palette = PALETTE[category ?? 'Other'] ?? PALETTE.Other
  const variant = palette[hashName(name) % palette.length]
  const Icon = variant.Icon

  return (
    <div
      className={`flex shrink-0 items-center justify-center bg-gradient-to-br ${variant.gradient} ${className}`}
      aria-hidden
    >
      <Icon className={`${iconClassName} ${variant.iconColor}`} />
    </div>
  )
}
