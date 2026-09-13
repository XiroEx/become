// The visible half of the consent gate, kept PURE so a test can render it and
// read the words. State, fetching and the decision to show it live in
// ConsentGate.tsx; this file only draws.
//
// NO HOOKS AND NO "use client" ON PURPOSE (same rule as LegalLinks): a
// component with no state renders under renderToStaticMarkup in a node test
// without an app-router context.
//
// The statement it shows is CONSENT_STATEMENT — the same sentence the sign-up
// form shows — with the two documents linked. `target="_blank"` on purpose: the
// gate lives inside the app shell, and navigating to /terms in place would
// unmount it and lose the tick.

import Link from 'next/link'
import { CONSENT_STATEMENT, HEALTH_DISCLAIMER_SHORT, LEGAL_MINIMUM_AGE } from '@/lib/legal'

export interface ConsentSheetProps {
  checked: boolean
  onCheckedChange: (next: boolean) => void
  onAgree: () => void
  busy: boolean
  error: string | null
}

export function ConsentSheet({ checked, onCheckedChange, onAgree, busy, error }: ConsentSheetProps) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="consent-gate-title"
      className="fixed inset-0 z-[300] flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center sm:p-4"
      data-testid="consent-gate"
    >
      <div
        className="w-full max-w-md rounded-t-2xl bg-white p-6 shadow-xl dark:bg-zinc-900 sm:rounded-2xl"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 24px)' }}
      >
        <h2 id="consent-gate-title" className="text-lg font-bold text-zinc-900 dark:text-white">
          Before you continue
        </h2>
        <p className="mt-1.5 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">
          We need one thing on record: that you are old enough to use Become and that you agree to how it works.
        </p>

        <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-xl border border-zinc-200 p-3.5 text-sm leading-relaxed text-zinc-800 dark:border-zinc-700 dark:text-zinc-200">
          <input
            type="checkbox"
            checked={checked}
            onChange={(e) => onCheckedChange(e.target.checked)}
            data-testid="consent-gate-checkbox"
            className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded border-zinc-300 accent-zinc-900 dark:border-zinc-600 dark:accent-white"
          />
          <span>
            I am at least {LEGAL_MINIMUM_AGE} years old, and I agree to the{' '}
            <Link href="/terms" target="_blank" rel="noreferrer" className="font-medium text-zinc-900 underline underline-offset-2 dark:text-white">
              Terms of Service
            </Link>{' '}
            and the{' '}
            <Link href="/privacy" target="_blank" rel="noreferrer" className="font-medium text-zinc-900 underline underline-offset-2 dark:text-white">
              Privacy Policy
            </Link>
            .<span className="sr-only"> {CONSENT_STATEMENT}</span>
          </span>
        </label>

        <p className="mt-4 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">{HEALTH_DISCLAIMER_SHORT}</p>

        {error && (
          <p role="alert" className="mt-3 text-sm text-red-600 dark:text-red-400">
            {error}
          </p>
        )}

        <button
          type="button"
          onClick={onAgree}
          disabled={!checked || busy}
          data-testid="consent-gate-agree"
          className="mt-5 w-full rounded-xl bg-zinc-900 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-black disabled:cursor-not-allowed disabled:opacity-40 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
        >
          {busy ? 'Saving…' : 'Agree and continue'}
        </button>
      </div>
    </div>
  )
}
