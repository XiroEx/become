// The one row of legal links, rendered on every surface that needs it: the
// landing footer, the sign-in screen, the plan page, the settings page and the
// legal pages themselves.
//
// NO HOOKS AND NO "use client" ON PURPOSE. This is imported by both server
// components (the legal pages) and client components (settings, plan, login),
// and a component with no state works in either. Adding a hook here would
// break the server pages, not the client ones, which is the failure that is
// easy to miss.
//
// LEGAL_LINKS in lib/legal is the single list. Add a route there and it appears
// on every surface at once, rather than on four of the five.

import Link from 'next/link'
import { LEGAL_ENTITY, LEGAL_LINKS } from '@/lib/legal'

export interface LegalLinksProps {
  className?: string
  /** Renders the current page as plain text instead of a link to itself. */
  activeHref?: string
  /** Adds the copyright line above the links. Off by default. */
  showCopyright?: boolean
}

export default function LegalLinks({
  className = '',
  activeHref,
  showCopyright = false,
}: LegalLinksProps) {
  return (
    <div className={className}>
      {showCopyright && (
        <p className="mb-2 text-xs text-zinc-500 dark:text-zinc-500">
          &copy; {new Date().getFullYear()} {LEGAL_ENTITY}
        </p>
      )}
      <nav aria-label="Legal and support" className="flex flex-wrap items-center gap-x-5 gap-y-2">
        {LEGAL_LINKS.map((link) =>
          link.href === activeHref ? (
            <span
              key={link.href}
              aria-current="page"
              className="text-sm font-semibold text-zinc-900 dark:text-white"
            >
              {link.label}
            </span>
          ) : (
            <Link
              key={link.href}
              href={link.href}
              className="text-sm font-medium text-zinc-600 underline-offset-2 hover:underline dark:text-zinc-400"
            >
              {link.label}
            </Link>
          ),
        )}
      </nav>
    </div>
  )
}
