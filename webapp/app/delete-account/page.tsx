// PUBLIC route. This is the URL Google Play's Data safety form wants for
// "where can a user request account deletion", and it is checked signed out,
// from a browser, by someone who has never installed the app. It must render
// with no session and no JavaScript — see lib/legal/deleteAccount.ts for why
// it documents the in-app path rather than offering a public form.
//
// It is also where the web app lands a member who has just deleted their
// account: they are signed out by then, so the page that tells them what
// happens next has to be one that works signed out.

import type { Metadata } from 'next'
import LegalDocument from '@/components/legal/LegalDocument'
import { DELETE_ACCOUNT } from '@/lib/legal/deleteAccount'
import { RESTORE_WINDOW_DAYS } from '@/lib/accountDeletion'

export const metadata: Metadata = {
  title: 'Delete your account',
  description:
    'How to delete your Become account and the data attached to it, what is removed, what is kept, and how long you have to change your mind.',
}

export default async function DeleteAccountPage({
  searchParams,
}: {
  searchParams: Promise<{ requested?: string | string[] }>
}) {
  const { requested } = await searchParams
  const justRequested = requested === '1' || (Array.isArray(requested) && requested.includes('1'))

  return (
    <LegalDocument
      doc={DELETE_ACCOUNT}
      notice={
        justRequested ? (
          <div
            data-testid="deletion-requested"
            className="rounded-xl border border-amber-300 bg-amber-50 p-3.5 dark:border-amber-500/40 dark:bg-amber-500/10 sm:p-4"
          >
            <p className="text-sm font-bold text-zinc-900 dark:text-white">
              Your deletion request is in.
            </p>
            <p className="mt-1.5 text-[15px] leading-relaxed text-zinc-800 dark:text-zinc-200">
              You have been signed out and your devices will not get notifications from Become any more.
              Check your email: the message we just sent carries a link that undoes this, and it works for{' '}
              {RESTORE_WINDOW_DAYS} days. After that, the deletion is permanent.
            </p>
          </div>
        ) : null
      }
    />
  )
}
