import React from 'react'
import ProfileMenu from './ProfileMenu'

// One page header on every /dashboard page: the page title on the left at
// today's h1 size, the avatar button with its dropdown on the right, no bar
// background.
//
// Stacking: the menu hangs out of this header and into the page, and an
// `absolute` child can never outrank its own stacking context — so this
// wrapper sits at z-40, the app-chrome tier BottomNav also claims: above
// every in-page `sticky` header (those top out at z-30) and below every
// overlay (those start at z-50).
export default function PageHeader({
  title,
  subtitle,
  className = '',
}: {
  title: React.ReactNode
  subtitle?: React.ReactNode
  className?: string
}) {
  return (
    <div className={`relative z-40 ${className}`}>
      <div className="flex items-start justify-between gap-3">
        <h1 className="min-w-0 flex-1 text-2xl font-bold text-zinc-900 dark:text-white sm:text-3xl">
          {title}
        </h1>
        <div className="shrink-0">
          <ProfileMenu />
        </div>
      </div>
      {subtitle != null && (
        <div className="mt-1 text-sm text-zinc-500 dark:text-zinc-400 sm:text-base">
          {subtitle}
        </div>
      )}
    </div>
  )
}
