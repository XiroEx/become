// The renderer for /terms, /privacy and /support.
//
// SERVER COMPONENT ON PURPOSE. These three pages must render for a crawler, for
// an App Store reviewer and for Stripe with no JavaScript, no token and no
// session. They live outside /dashboard, so nothing here may touch AuthGuard,
// a hook, or the client bundle.
//
// The document content is data (lib/legal/*). This file only draws it. Inline
// markup is deliberately tiny: `**bold**` and `[label](/path)`, parsed into
// React nodes. No HTML is ever injected, so a document can never carry markup
// into the page.

import Link from 'next/link'
import type { ReactNode } from 'react'
import {
  LEGAL_ADDRESS_LINES,
  LEGAL_CONTACT_EMAIL,
  LEGAL_LAST_UPDATED,
  LEGAL_LAST_UPDATED_ISO,
  LEGAL_VERSION,
  COUNSEL_TODO,
  type LegalBlock,
  type LegalDoc,
} from '@/lib/legal'
import LegalLinks from './LegalLinks'

/* ── Inline markup ────────────────────────────────────────────────────────── */

/** `**bold**` and `[label](/path)`. Anything else is literal text. */
const INLINE = /(\*\*[^*]+\*\*|\[[^\]]+\]\([^)\s]+\))/g

export function inline(text: string): ReactNode[] {
  return text.split(INLINE).map((piece, i) => {
    if (!piece) return null
    if (piece.startsWith('**') && piece.endsWith('**')) {
      return (
        <strong key={i} className="font-semibold text-zinc-900 dark:text-white">
          {piece.slice(2, -2)}
        </strong>
      )
    }
    const link = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(piece)
    if (link) {
      return (
        <Link
          key={i}
          href={link[2]}
          className="font-medium text-purple-600 underline underline-offset-2 hover:text-purple-700 dark:text-purple-400"
        >
          {link[1]}
        </Link>
      )
    }
    return <span key={i}>{piece}</span>
  })
}

/* ── Blocks ───────────────────────────────────────────────────────────────── */

const CALLOUT_TONE = {
  warning:
    'border-amber-300 bg-amber-50 dark:border-amber-500/40 dark:bg-amber-500/10',
  info: 'border-purple-300 bg-purple-50/70 dark:border-purple-500/40 dark:bg-purple-500/10',
} as const

function Block({ block }: { block: LegalBlock }) {
  switch (block.kind) {
    case 'p':
      return (
        <p className="text-[15px] leading-relaxed text-zinc-700 dark:text-zinc-300">
          {inline(block.text)}
        </p>
      )

    case 'ul':
      return (
        <ul className="space-y-2 text-[15px] leading-relaxed text-zinc-700 dark:text-zinc-300">
          {block.items.map((item, i) => (
            <li key={i} className="flex gap-2.5">
              <span
                aria-hidden="true"
                className="mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full bg-zinc-400 dark:bg-zinc-600"
              />
              <span className="min-w-0">{inline(item)}</span>
            </li>
          ))}
        </ul>
      )

    case 'ol':
      return (
        <ol className="space-y-2 text-[15px] leading-relaxed text-zinc-700 dark:text-zinc-300">
          {block.items.map((item, i) => (
            <li key={i} className="flex gap-2.5">
              <span className="shrink-0 font-semibold text-zinc-500 tabular-nums dark:text-zinc-400">
                {i + 1}.
              </span>
              <span className="min-w-0">{inline(item)}</span>
            </li>
          ))}
        </ol>
      )

    // A definition list, not a table: at 390px a three-column table is a
    // horizontal scroll nobody performs, and every one of these is a
    // term-and-explanation pair anyway.
    case 'dl':
      return (
        <dl className="space-y-3">
          {block.items.map((item, i) => (
            <div
              key={i}
              className="rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900"
            >
              <dt className="text-sm font-semibold text-zinc-900 dark:text-white">
                {item.term}
              </dt>
              <dd className="mt-1 text-[15px] leading-relaxed text-zinc-700 dark:text-zinc-300">
                {inline(item.detail)}
              </dd>
            </div>
          ))}
        </dl>
      )

    case 'callout':
      return (
        <div className={`rounded-xl border p-3.5 sm:p-4 ${CALLOUT_TONE[block.tone]}`}>
          <p className="text-sm font-bold text-zinc-900 dark:text-white">{block.title}</p>
          <ul className="mt-2 space-y-2 text-[15px] leading-relaxed text-zinc-800 dark:text-zinc-200">
            {block.items.map((item, i) => (
              <li key={i} className="flex gap-2.5">
                <span
                  aria-hidden="true"
                  className="mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full bg-zinc-500 dark:bg-zinc-400"
                />
                <span className="min-w-0">{inline(item)}</span>
              </li>
            ))}
          </ul>
        </div>
      )

    // Rendered LOUDLY and on purpose. An unresolved legal question that is
    // invisible on the page is one that ships.
    case 'todo':
      return (
        <div className="rounded-xl border border-dashed border-amber-500 bg-amber-50 p-3.5 dark:border-amber-500/60 dark:bg-amber-500/10">
          <p className="font-mono text-[11px] font-bold uppercase tracking-wide text-amber-700 dark:text-amber-300">
            {COUNSEL_TODO}
          </p>
          <p className="mt-1.5 text-[15px] leading-relaxed text-zinc-800 dark:text-zinc-200">
            {block.text}
          </p>
        </div>
      )
  }
}

/* ── Page ─────────────────────────────────────────────────────────────────── */

export default function LegalDocument({ doc }: { doc: LegalDoc }) {
  return (
    <div
      className="min-h-dvh bg-zinc-50 dark:bg-zinc-950"
      // These pages sit OUTSIDE the dashboard shell, which is where the app's
      // safe-area padding normally comes from, so they carry their own. Left
      // and right matter too: landscape on a notched phone clips the text
      // otherwise, and a legal page is the one screen people read in landscape.
      style={{
        paddingTop: 'env(safe-area-inset-top, 0px)',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        paddingLeft: 'env(safe-area-inset-left, 0px)',
        paddingRight: 'env(safe-area-inset-right, 0px)',
      }}
    >
      <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 sm:py-12">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white"
        >
          <span aria-hidden="true">&larr;</span> Back to Become
        </Link>

        <header className="mt-5">
          <h1 className="text-3xl font-extrabold tracking-tight text-zinc-900 dark:text-white sm:text-4xl">
            {doc.title}
          </h1>
          <p className="mt-2 text-[15px] leading-relaxed text-zinc-600 dark:text-zinc-400">
            {doc.standfirst}
          </p>
          <p className="mt-3 text-xs font-medium text-zinc-500 dark:text-zinc-500">
            Last updated <time dateTime={LEGAL_LAST_UPDATED_ISO}>{LEGAL_LAST_UPDATED}</time>
            {' · '}
            Version {LEGAL_VERSION}
          </p>
        </header>

        {/* Contents. Long documents need a way in, and on a phone this is the
            only one that works without a sticky sidebar. */}
        <nav aria-label="Contents" className="mt-6 rounded-xl border border-zinc-200 bg-white p-3.5 dark:border-zinc-800 dark:bg-zinc-900">
          <p className="text-xs font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Contents
          </p>
          <ul className="mt-2 space-y-1.5">
            {doc.sections.map((section) => (
              <li key={section.id}>
                <a
                  href={`#${section.id}`}
                  className="text-sm text-zinc-700 underline-offset-2 hover:underline dark:text-zinc-300"
                >
                  {section.heading}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <main className="mt-8 space-y-9">
          {doc.sections.map((section) => (
            <section key={section.id} id={section.id} className="scroll-mt-6 space-y-3">
              <h2 className="text-lg font-bold text-zinc-900 dark:text-white sm:text-xl">
                {section.heading}
              </h2>
              {section.blocks.map((block, i) => (
                <Block key={i} block={block} />
              ))}
            </section>
          ))}
        </main>

        <footer className="mt-12 border-t border-zinc-200 pt-6 dark:border-zinc-800">
          <address className="text-sm not-italic leading-relaxed text-zinc-600 dark:text-zinc-400">
            {LEGAL_ADDRESS_LINES.map((line) => (
              <span key={line} className="block">
                {line}
              </span>
            ))}
            <a
              href={`mailto:${LEGAL_CONTACT_EMAIL}`}
              className="mt-1 inline-block font-medium text-purple-600 underline underline-offset-2 dark:text-purple-400"
            >
              {LEGAL_CONTACT_EMAIL}
            </a>
          </address>
          <LegalLinks className="mt-5" activeHref={`/${doc.slug}`} />
        </footer>
      </div>
    </div>
  )
}
