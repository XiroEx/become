'use client'

// Where the "Keep my account" link in the deletion email lands.
//
// THREE THINGS THIS PAGE HAS TO SURVIVE, and they are why it looks the way it
// does:
//
//   1. NO SESSION. Requesting the deletion signed the device out, and the link
//      is usually opened in a mail app's in-app browser that shares nothing
//      with the real one. The HMAC in the URL is the whole credential; this
//      page never reads a token and never asks anyone to sign in.
//   2. NO ACCIDENTAL RESTORE. Link scanners fetch every URL in an email before
//      a human sees it, so nothing happens on load: the member presses a
//      button, and only that POSTs. (The API's GET does not mutate either.)
//   3. IT MAY OPEN IN THE APP INSTEAD. become.redbtn.io/account/restore is an
//      associated domain on iOS and an autoVerify intent filter on Android, so
//      the native app catches the same link and calls the same endpoint. Both
//      paths end in one place, which is why the outcome copy lives here and is
//      mirrored, deliberately short, in the native screen.

import { useCallback, useState } from 'react'
import Link from 'next/link'
import { LEGAL_CONTACT_EMAIL } from '@/lib/legal'

type State = 'idle' | 'working' | 'restored' | 'invalid' | 'nothing' | 'error'

const COPY: Record<Exclude<State, 'idle' | 'working'>, { title: string; body: string }> = {
  restored: {
    title: 'Your account is back',
    body: 'The deletion has been cancelled and nothing was removed. Sign in as usual — your training, nutrition and mind history are all where you left them. Notifications were switched off when the deletion was requested and stay off until you turn them back on in Settings.',
  },
  invalid: {
    title: 'That link is not valid any more',
    body: 'A restore link stops working once the deletion has been cancelled, and a new request replaces the old link. Check that you opened the most recent email, and if you are stuck, write to us.',
  },
  nothing: {
    title: 'There is nothing to restore',
    body: 'No deletion is pending on this account. Either it was already cancelled, or the seven days elapsed and the data has been erased — in which case it cannot be brought back.',
  },
  error: {
    title: 'Something went wrong',
    body: 'We could not cancel the deletion just now. Nothing has been erased yet, so try again in a minute. If it keeps failing, write to us — we can cancel it by hand.',
  },
}

export default function RestoreClient({ u, t }: { u: string; t: string }) {
  const [state, setState] = useState<State>('idle')

  const restore = useCallback(async () => {
    setState('working')
    try {
      const res = await fetch('/api/me/account/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ u, t }),
      })
      const data = (await res.json().catch(() => null)) as
        | { restored?: boolean; reason?: string }
        | null
      if (data?.restored) return setState('restored')
      if (data?.reason === 'nothing_pending') return setState('nothing')
      if (data?.reason === 'invalid_link') return setState('invalid')
      setState('error')
    } catch {
      setState('error')
    }
  }, [u, t])

  const outcome = state === 'idle' || state === 'working' ? null : COPY[state]
  const missing = !u || !t

  return (
    <div className="min-h-dvh bg-zinc-50 dark:bg-zinc-950">
      <div className="mx-auto w-full max-w-lg px-4 py-16 sm:px-6">
        <div className="rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900 sm:p-8">
          {outcome ? (
            <>
              <h1
                data-testid="restore-outcome"
                className="text-2xl font-extrabold tracking-tight text-zinc-900 dark:text-white"
              >
                {outcome.title}
              </h1>
              <p className="mt-3 text-[15px] leading-relaxed text-zinc-600 dark:text-zinc-300">
                {outcome.body}
              </p>
            </>
          ) : (
            <>
              <h1 className="text-2xl font-extrabold tracking-tight text-zinc-900 dark:text-white">
                Keep your account
              </h1>
              <p className="mt-3 text-[15px] leading-relaxed text-zinc-600 dark:text-zinc-300">
                {missing
                  ? 'This link is missing the part that identifies it. Open the “Keep my account” button in the email we sent you instead of copying the address by hand.'
                  : 'Your Become account is scheduled for deletion. Press the button and the deletion is cancelled — nothing has been erased yet, and everything comes back exactly as it was.'}
              </p>
              <button
                type="button"
                data-testid="restore-confirm"
                onClick={restore}
                disabled={missing || state === 'working'}
                className="mt-6 w-full rounded-xl bg-zinc-900 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200"
              >
                {state === 'working' ? 'Cancelling the deletion…' : 'Keep my account'}
              </button>
            </>
          )}

          <div className="mt-8 flex flex-wrap gap-x-5 gap-y-2 border-t border-zinc-200 pt-5 text-sm dark:border-zinc-800">
            <Link
              href="/login"
              className="font-medium text-zinc-600 underline-offset-2 hover:underline dark:text-zinc-400"
            >
              Sign in
            </Link>
            <Link
              href="/delete-account"
              className="font-medium text-zinc-600 underline-offset-2 hover:underline dark:text-zinc-400"
            >
              About deletion
            </Link>
            <a
              href={`mailto:${LEGAL_CONTACT_EMAIL}`}
              className="font-medium text-zinc-600 underline-offset-2 hover:underline dark:text-zinc-400"
            >
              {LEGAL_CONTACT_EMAIL}
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}
