'use client'

// The button behind the restore link.
//
// THE PAGE DOES NOT RESTORE ANYTHING ON LOAD. Mail scanners, link previewers
// and Safe Browsing fetch every URL in an email before a person sees it, so a
// page that POSTed from an effect would let a corporate mail filter undo a
// member's deletion silently. A human presses the button; only then does
// anything change.
//
// It carries no session and needs none: the MAC in the URL is the credential
// (lib/accountRestoreToken.ts). That is the whole point — requesting deletion
// signs every device out, so there is nothing to authenticate with.

import { useState } from 'react'
import Link from 'next/link'
import { LEGAL_CONTACT_EMAIL } from '@/lib/legal'

type State = 'idle' | 'working' | 'done' | 'failed'

export default function RestoreClient({ u, t }: { u: string; t: string }) {
  const [state, setState] = useState<State>('idle')

  async function restore() {
    setState('working')
    try {
      const res = await fetch('/api/me/account/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ u, t }),
      })
      setState(res.ok ? 'done' : 'failed')
    } catch {
      setState('failed')
    }
  }

  if (state === 'done') {
    return (
      <div data-testid="restore-done" className="space-y-4">
        <p className="text-[15px] leading-relaxed text-zinc-700 dark:text-zinc-300">
          Your account is back, and nothing was deleted. Sign in and carry on — your notifications were
          switched off when the request was made, so turn them back on in Settings if you want them.
        </p>
        <Link
          href="/login"
          className="inline-block rounded-xl bg-zinc-900 px-5 py-3 text-sm font-semibold text-white dark:bg-white dark:text-black"
        >
          Sign in
        </Link>
      </div>
    )
  }

  if (state === 'failed') {
    return (
      <div data-testid="restore-failed" className="space-y-4">
        <p className="text-[15px] leading-relaxed text-zinc-700 dark:text-zinc-300">
          This link no longer works. That happens when the deletion was already cancelled, when a newer
          request replaced it, or when the {''}
          window to change your mind has closed and the data is gone.
        </p>
        <p className="text-[15px] leading-relaxed text-zinc-700 dark:text-zinc-300">
          If you think that is wrong, email{' '}
          <a
            href={`mailto:${LEGAL_CONTACT_EMAIL}`}
            className="font-medium text-purple-600 underline underline-offset-2 dark:text-purple-400"
          >
            {LEGAL_CONTACT_EMAIL}
          </a>{' '}
          from the address on the account.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <p className="text-[15px] leading-relaxed text-zinc-700 dark:text-zinc-300">
        Pressing this cancels the deletion request on your account. Nothing has been deleted yet.
      </p>
      <button
        type="button"
        data-testid="restore-confirm"
        onClick={restore}
        disabled={state === 'working'}
        className="w-full rounded-xl bg-zinc-900 py-3.5 text-sm font-semibold text-white disabled:opacity-60 dark:bg-white dark:text-black sm:w-auto sm:px-6"
      >
        {state === 'working' ? 'Restoring…' : 'Restore my account'}
      </button>
    </div>
  )
}
