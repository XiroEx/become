'use client'

// The user's equipped profile icon, rendered consistently everywhere (TopNav,
// profile card, etc.). Shows a custom uploaded image when equipped, otherwise a
// preset glyph on its branded gradient. The optional `frame` slot is where an
// earned redReward frame will wrap the avatar in a later phase.
//
// A custom image that cannot be drawn falls back to a glyph instead of the
// browser's broken-image box — an equipped photo is a pointer at an object in
// the blob store, and the pointer outlives the object whenever storage is lost
// or a remote host stops answering. See lib/avatarSource.ts.

import Image from 'next/image'
import { useState } from 'react'
import { UserRound } from 'lucide-react'
import { presetIcon } from '@/lib/reward/icons'
import { avatarImageSrc, canOptimizeAvatarSrc, equippedCustomAvatar } from '@/lib/avatarSource'

export interface AvatarProps {
  /** PRESET_ICONS id, or 'custom' to use imageUrl. */
  icon?: string | null
  /** Custom image URL (used when icon === 'custom'). */
  imageUrl?: string | null
  /** Pixel size of the avatar. */
  size?: number
  className?: string
}

/**
 * Stands in for a photo that was equipped and cannot be drawn. Deliberately
 * NOT a preset: `presetIcon()` falls back to the first entry in the catalog, so
 * a member whose upload went missing would be shown a flame they never picked.
 * A neutral silhouette says "no picture" instead, which is the truth.
 */
const MISSING_PHOTO = { Icon: UserRound, gradient: 'from-zinc-400 to-zinc-500 dark:from-zinc-600 dark:to-zinc-700' }

export default function Avatar({ icon, imageUrl, size = 32, className = '' }: AvatarProps) {
  // The src that failed, not a boolean: a fresh upload changes the key, so a
  // new src is retried automatically without an effect to reset any state.
  const [brokenSrc, setBrokenSrc] = useState<string | null>(null)

  const src = avatarImageSrc(icon, imageUrl)

  if (src && src !== brokenSrc) {
    return (
      <span
        className={`relative inline-block overflow-hidden rounded-full ${className}`}
        style={{ width: size, height: size }}
      >
        <Image
          src={src}
          alt=""
          fill
          sizes={`${size}px`}
          className="object-cover"
          unoptimized={!canOptimizeAvatarSrc(src)}
          onError={() => setBrokenSrc(src)}
        />
      </span>
    )
  }

  const preset = equippedCustomAvatar(icon) ? MISSING_PHOTO : presetIcon(icon)
  const { Icon } = preset
  return (
    <span
      className={`inline-flex items-center justify-center rounded-full bg-gradient-to-br ${preset.gradient} ${className}`}
      style={{ width: size, height: size }}
    >
      <Icon className="text-white" style={{ width: size * 0.55, height: size * 0.55 }} strokeWidth={2.25} />
    </span>
  )
}
