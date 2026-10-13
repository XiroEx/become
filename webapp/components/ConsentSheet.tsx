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
//
// ─── TWO ASKS, TWO TICKS ─────────────────────────────────────────────────────
//
// The Terms/age tick is REQUIRED: you cannot hold an account without it, and
// the button stays disabled until it is ticked.
//
// The AI tick is not. App Store Guideline 5.1.2(i) wants explicit permission
// before personal data reaches a third-party AI, and a box you must tick to
// get past a blocking sheet is consent in name only. So it starts unticked,
// leaving it unticked is a valid answer that gets recorded as one, and the
// copy says what saying no actually costs. Each ask is drawn only when it is
// still open — a member who agreed to the Terms last week and is being asked
// about the AI today sees one question, not two.

import Link from 'next/link'
import {
  AI_CONSENT_DECLINE_NOTE,
  AI_CONSENT_SENDS,
  AI_CONSENT_STATEMENT,
  AI_PROVIDER,
  AI_PROVIDER_ROUTE,
  CONSENT_STATEMENT,
  HEALTH_DISCLAIMER_SHORT,
  LEGAL_MINIMUM_AGE,
} from '@/lib/legal'

export interface ConsentSheetProps {
  checked: boolean
  onCheckedChange: (next: boolean) => void
  onAgree: () => void
  busy: boolean
  error: string | null
  /** Draw the Terms/age tick. False when the member's agreement is current and
   *  only the AI permission is outstanding. */
  showTerms?: boolean
  /** Draw the AI permission tick. False once they have answered it. */
  showAi?: boolean
  aiChecked?: boolean
  onAiCheckedChange?: (next: boolean) => void
}

export function ConsentSheet({
  checked,
  onCheckedChange,
  onAgree,
  busy,
  error,
  showTerms = true,
  showAi = true,
  aiChecked = false,
  onAiCheckedChange,
}: ConsentSheetProps) {
  const title = showTerms ? 'Before you continue' : 'One thing about AI'
  const standfirst = showTerms
    ? 'We need one thing on record: that you are old enough to use Become and that you agree to how it works.'
    : `Become uses AI for some of its work, and that means sending what you submit to ${AI_PROVIDER}. We will not do that until you say we can.`

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="consent-gate-title"
      className="fixed inset-0 z-[300] flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center sm:p-4"
      data-testid="consent-gate"
    >
      <div
        className="max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white p-6 shadow-xl dark:bg-zinc-900 sm:rounded-2xl"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 24px)' }}
      >
        <h2 id="consent-gate-title" className="text-lg font-bold text-zinc-900 dark:text-white">
          {title}
        </h2>
        <p className="mt-1.5 text-sm leading-relaxed text-zinc-600 dark:text-zinc-400">{standfirst}</p>

        {showTerms && (
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
        )}

        {showAi && (
          <div className="mt-3 rounded-xl border border-zinc-200 p-3.5 dark:border-zinc-700" data-testid="ai-consent-block">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Optional
            </p>
            <label className="mt-2 flex cursor-pointer items-start gap-3 text-sm leading-relaxed text-zinc-800 dark:text-zinc-200">
              <input
                type="checkbox"
                checked={aiChecked}
                onChange={(e) => onAiCheckedChange?.(e.target.checked)}
                data-testid="ai-consent-checkbox"
                className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded border-zinc-300 accent-zinc-900 dark:border-zinc-600 dark:accent-white"
              />
              <span>{AI_CONSENT_STATEMENT}</span>
            </label>
            <p className="mt-2.5 text-xs text-zinc-500 dark:text-zinc-400">
              What gets sent to {AI_PROVIDER}, through {AI_PROVIDER_ROUTE}:
            </p>
            <ul className="mt-1.5 list-disc space-y-1 pl-5 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
              {AI_CONSENT_SENDS.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <p className="mt-2.5 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
              {AI_CONSENT_DECLINE_NOTE}{' '}
              <Link href="/privacy#ai" target="_blank" rel="noreferrer" className="font-medium text-zinc-900 underline underline-offset-2 dark:text-white">
                Privacy Policy, section 7
              </Link>
              .
            </p>
          </div>
        )}

        <p className="mt-4 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">{HEALTH_DISCLAIMER_SHORT}</p>

        {error && (
          <p role="alert" className="mt-3 text-sm text-red-600 dark:text-red-400">
            {error}
          </p>
        )}

        <button
          type="button"
          onClick={onAgree}
          disabled={(showTerms && !checked) || busy}
          data-testid="consent-gate-agree"
          className="mt-5 w-full rounded-xl bg-zinc-900 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-black disabled:cursor-not-allowed disabled:opacity-40 dark:bg-white dark:text-black dark:hover:bg-zinc-200"
        >
          {busy ? 'Saving…' : showTerms ? 'Agree and continue' : aiChecked ? 'Allow and continue' : 'Save and continue'}
        </button>
      </div>
    </div>
  )
}
