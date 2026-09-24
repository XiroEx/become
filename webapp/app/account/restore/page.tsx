// PUBLIC route: the page the restore link in the deletion email points at.
//
// IT MUST WORK IN A BROWSER AND INSIDE THE STORE BUILDS, because a link in an
// email opens wherever the phone decides:
//   • Android — the app declares an autoVerify app-link filter for
//     /account/restore (expo/app.json), so the installed app opens it; without
//     the app, or from a desktop, this page is what loads.
//   • iOS — `applinks:become.redbtn.io` in the associated domains covers every
//     path, so the same link opens expo/app/account/restore.tsx when the app is
//     installed. Mail on the Mac opens this page instead.
// Both paths end up calling the SAME public route (POST /api/me/account/restore)
// with the same `u` + `t`, so the two surfaces cannot drift.
//
// Server component: no session exists to read (the deletion signed every device
// out), so there is nothing to guard and nothing to fetch before paint.

import type { Metadata } from 'next'
import Link from 'next/link'
import RestoreClient from './RestoreClient'
import { LEGAL_CONTACT_EMAIL } from '@/lib/legal'

export const metadata: Metadata = {
  title: 'Restore your account',
  description: 'Cancel a pending Become account deletion.',
  // A link that undoes a deletion has no business in a search index.
  robots: { index: false, follow: false },
}

export default async function RestoreAccountPage({
  searchParams,
}: {
  searchParams: Promise<{ u?: string | string[]; t?: string | string[] }>
}) {
  const params = await searchParams
  const first = (value: string | string[] | undefined) =>
    (Array.isArray(value) ? value[0] : value)?.trim() ?? ''
  const u = first(params.u)
  const t = first(params.t)

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
      <div className="mx-auto w-full max-w-2xl px-4 py-10 sm:px-6 sm:py-16">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white"
        >
          <span aria-hidden="true">&larr;</span> Back to Become
        </Link>

        <h1 className="mt-5 text-3xl font-extrabold tracking-tight text-zinc-900 dark:text-white sm:text-4xl">
          Restore your account
        </h1>

        <div className="mt-6">
          {u && t ? (
            <RestoreClient u={u} t={t} />
          ) : (
            <p data-testid="restore-missing" className="text-[15px] leading-relaxed text-zinc-700 dark:text-zinc-300">
              This link is incomplete. Open the one in the email we sent when the deletion was requested,
              or email{' '}
              <a
                href={`mailto:${LEGAL_CONTACT_EMAIL}`}
                className="font-medium text-purple-600 underline underline-offset-2 dark:text-purple-400"
              >
                {LEGAL_CONTACT_EMAIL}
              </a>{' '}
              from the address on the account.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
