'use client'

// The user's equipped profile icon, rendered consistently everywhere (TopNav,
// profile card, etc.). Shows a custom uploaded image when equipped, otherwise a
// preset glyph on its branded gradient. The optional `frame` slot is where an
// earned redReward frame will wrap the avatar in a later phase.

import Image from 'next/image'
import { presetIcon } from '@/lib/reward/icons'

export interface AvatarProps {
  /** PRESET_ICONS id, or 'custom' to use imageUrl. */
  icon?: string | null
  /** Custom image URL (used when icon === 'custom'). */
  imageUrl?: string | null
  /** Pixel size of the avatar. */
  size?: number
  className?: string
}

export default function Avatar({ icon, imageUrl, size = 32, className = '' }: AvatarProps) {
  const isCustom = icon === 'custom' && !!imageUrl

  if (isCustom) {
    return (
      <span
        className={`relative inline-block overflow-hidden rounded-full ${className}`}
        style={{ width: size, height: size }}
      >
        <Image src={imageUrl!} alt="" fill sizes={`${size}px`} className="object-cover" />
      </span>
    )
  }

  const preset = presetIcon(icon)
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
