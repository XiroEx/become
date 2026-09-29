// The one panel behind all three PUBLIC billing return pages
// (/billing/return, /billing/cancelled, /billing/portal-return).
//
// THREE RULES, and every one of them is a real failure if broken:
//
//  1. IT RENDERS SIGNED OUT. Stripe returns a native buyer to Safari, which has
//     never held this member's session — `auth_token` is a cookie on a browser
//     the app does not share. So: no 'use client', no token read, no AuthGuard,
//     no fetch. Server markup only, which is also why a unit test can render it.
//  2. IT SHOWS NO ACCOUNT DATA. There is no session to read one from, and a page
//     on a URL Stripe hands out — one that mail scanners, link previewers and
//     anybody the member forwards it to will open — is the wrong place to say
//     whose account it is or what they pay.
//  3. IT ACTIVATES NOTHING. The app asks `GET /api/billing/status?session_id=`
//     for itself, signed in (NP-054). This page only says what happened and
//     offers the way back.

import { becomeAppLink, webFallbackHref, RETURN_TO_APP_LABEL, type AppReturnKind } from '@/lib/billing/appReturn'

export interface PublicBillingReturnProps {
  kind: AppReturnKind
  title: string
  /** Plain sentences, in order. Copy lives with the page, not in here. */
  lines: string[]
  /** Straight off the query string; dropped unless it looks like `cs_…`. */
  sessionId?: string | string[] | null
  /** For the test to find the right page in the rendered markup. */
  testId: string
}

export default function PublicBillingReturn({
  kind,
  title,
  lines,
  sessionId,
  testId,
}: PublicBillingReturnProps) {
  const appHref = becomeAppLink(kind, sessionId)
  const webHref = webFallbackHref(kind, sessionId)

  return (
    <div
      className="min-h-dvh bg-zinc-50 dark:bg-zinc-950"
      style={{
        paddingTop: 'env(safe-area-inset-top, 0px)',
        paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        paddingLeft: 'env(safe-area-inset-left, 0px)',
        paddingRight: 'env(safe-area-inset-right, 0px)',
      }}
    >
      <div data-testid={testId} className="mx-auto w-full max-w-xl px-4 py-12 sm:px-6 sm:py-16">
        <p className="text-sm font-semibold uppercase tracking-widest text-zinc-500 dark:text-zinc-400">
          Become
        </p>

        <h1 className="mt-3 text-3xl font-extrabold tracking-tight text-zinc-900 dark:text-white sm:text-4xl">
          {title}
        </h1>

        <div className="mt-6 space-y-4">
          {lines.map((line) => (
            <p key={line} className="text-[15px] leading-relaxed text-zinc-700 dark:text-zinc-300">
              {line}
            </p>
          ))}
        </div>

        {/* The custom scheme, NOT a link to this domain: iOS keeps a tap on a
            same-domain link inside Safari, so a universal link on the host the
            buyer is already standing on would only load another web page.
            Safari asks once whether to open Become and remembers the answer. */}
        <a
          href={appHref}
          data-testid="billing-return-app"
          className="mt-8 inline-flex w-full items-center justify-center rounded-xl bg-zinc-900 px-6 py-3.5 text-sm font-semibold text-white dark:bg-white dark:text-black sm:w-auto"
        >
          {RETURN_TO_APP_LABEL}
        </a>

        {/* ...and the member who bought on the web, or who has no app on this
            phone, is not stranded: the plan page, reached exactly as a web buyer
            reaches it. It asks them to sign in, which is the truth here. */}
        <p className="mt-5 text-[13px] leading-relaxed text-zinc-500 dark:text-zinc-400">
          No app on this device?{' '}
          <a
            href={webHref}
            data-testid="billing-return-web"
            className="font-medium text-purple-600 underline underline-offset-2 dark:text-purple-400"
          >
            Open Become in your browser
          </a>{' '}
          and sign in there.
        </p>
      </div>
    </div>
  )
}
