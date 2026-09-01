'use client'

// The ONE upsell surface. Every gate in the app — server 403 or client teaser —
// opens this sheet and nothing else.
//
// Everything it says comes from the gate payload it is handed: the server owns
// the refusal wording (`gate.error`) and the tier being asked for
// (`gate.requiresTier`), so a member can never be shown a number or a plan name
// that disagrees with the rule that actually refused them.
//
// Billing is stage 5. Until GET /api/billing/status exists this probes it,
// takes any non-2xx / malformed answer as "not configured", and swaps the CTA
// for a coming-soon note IN PLACE. It never renders a link that goes nowhere,
// and it never assumes a route exists.

import { useCallback, useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Check, Loader2, Lock, X } from 'lucide-react'
import { useEntitlements } from '@/hooks/useEntitlements'
import {
  allowanceLine,
  featureHeadline,
  PLUS_BENEFITS,
  tierLabel,
  type GatePayload,
} from '@/lib/entitlementsClient'

export interface UpgradeSheetProps {
  open: boolean
  onClose: () => void
  /** The verbatim 403 body (or a syntheticGate for a teaser). */
  gate: GatePayload | null
}

type CheckoutState = 'checking' | 'ready' | 'unavailable' | 'starting'

function authHeaders(): HeadersInit {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  }
}

export default function UpgradeSheet({ open, onClose, gate }: UpgradeSheetProps) {
  const { data } = useEntitlements()
  const [checkout, setCheckout] = useState<CheckoutState>('checking')
  // Which gate the coming-soon note is showing for. Keyed on the gate rather
  // than a boolean reset in an effect, so a NEW gate starts clean for free.
  const [soonFor, setSoonFor] = useState<GatePayload | null>(null)
  const showSoon = soonFor !== null && soonFor === gate

  // Probe billing only while the sheet is actually open — a closed sheet must
  // not cost a request, and the answer can change between openings. The probe
  // IS an external-system read, so its answer cannot be derived during render.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (!open) return
    let cancelled = false

    if (data?.checkoutAvailable === true) {
      setCheckout('ready')
      return
    }
    setCheckout('checking')
    ;(async () => {
      try {
        const res = await fetch('/api/billing/status', { headers: authHeaders() })
        if (cancelled) return
        if (!res.ok) {
          // 404 (route not built yet) / 503 (not configured) / anything else.
          setCheckout('unavailable')
          return
        }
        const body: unknown = await res.json().catch(() => null)
        const configured =
          body !== null &&
          typeof body === 'object' &&
          (body as { configured?: unknown }).configured === true
        setCheckout(configured ? 'ready' : 'unavailable')
      } catch {
        if (!cancelled) setCheckout('unavailable')
      }
    })()

    return () => {
      cancelled = true
    }
  }, [open, data?.checkoutAvailable])
  /* eslint-enable react-hooks/set-state-in-effect */

  const startCheckout = useCallback(async () => {
    if (!gate) return
    if (checkout !== 'ready') {
      setSoonFor(gate)
      return
    }
    setCheckout('starting')
    try {
      const res = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({ feature: gate.feature, tier: gate.requiresTier }),
      })
      const body: unknown = res.ok ? await res.json().catch(() => null) : null
      const url =
        body !== null && typeof body === 'object'
          ? (body as { url?: unknown }).url
          : undefined
      if (typeof url === 'string' && url) {
        window.location.assign(url)
        return
      }
      setCheckout('unavailable')
      setSoonFor(gate)
    } catch {
      setCheckout('unavailable')
      setSoonFor(gate)
    }
  }, [gate, checkout])

  // Nothing to say without a gate, and nothing to say at all while the
  // kill-switch is off — that is the launch-day zero-change contract. A null
  // snapshot is NOT treated as unenforced: a real 403 got us here.
  if (!gate) return null
  if (data && data.enforced === false) return null

  const line = allowanceLine(gate)

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            key="upgrade-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-[200] bg-black/50 backdrop-blur-sm"
          />

          <motion.div
            key="upgrade-sheet"
            role="dialog"
            aria-modal="true"
            aria-label="Upgrade"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
            onClick={(e) => e.stopPropagation()}
            className="fixed inset-x-0 bottom-0 z-[201] max-h-[90vh] overflow-y-auto rounded-t-2xl bg-white dark:bg-zinc-900"
          >
            <div className="sticky top-0 z-10 bg-white pt-2 dark:bg-zinc-900">
              <div className="mx-auto h-1.5 w-10 rounded-full bg-zinc-300 dark:bg-zinc-700" />
              <div className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-purple-600/10 text-purple-600 dark:text-purple-400">
                    <Lock className="h-4 w-4" />
                  </span>
                  <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-50">
                    {tierLabel(gate.requiresTier)}
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close"
                  className="flex h-9 w-9 items-center justify-center rounded-full text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            <div className="px-4 pb-[calc(env(safe-area-inset-bottom)+1.5rem)]">
              <h3 className="text-xl font-extrabold text-zinc-900 dark:text-white">
                {featureHeadline(gate.feature, gate.requiresTier)}
              </h3>
              {/* The server's own words, verbatim. */}
              <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">{gate.error}</p>
              {line && (
                <p className="mt-2 text-xs font-medium text-zinc-500 dark:text-zinc-400">{line}</p>
              )}

              <div className="mt-5 grid gap-2">
                {PLUS_BENEFITS.map((benefit) => (
                  <div
                    key={benefit}
                    className="flex items-start gap-3 rounded-xl border border-zinc-200 p-3 dark:border-zinc-800"
                  >
                    <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400">
                      <Check className="h-3.5 w-3.5" />
                    </span>
                    <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200">{benefit}</p>
                  </div>
                ))}
              </div>

              {showSoon ? (
                <div className="mt-5 rounded-xl border border-amber-300 bg-amber-50 px-3 py-3 text-sm text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-300">
                  Upgrades go live shortly — we&apos;ll email you the moment they do.
                </div>
              ) : (
                <button
                  type="button"
                  onClick={startCheckout}
                  disabled={checkout === 'starting'}
                  className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-purple-600 to-indigo-600 px-6 py-3.5 text-sm font-semibold text-white transition-all hover:from-purple-700 hover:to-indigo-700 disabled:opacity-60"
                >
                  {checkout === 'starting' ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Lock className="h-4 w-4" />
                  )}
                  Upgrade to {tierLabel(gate.requiresTier)}
                </button>
              )}

              <button
                type="button"
                onClick={onClose}
                className="mt-3 w-full rounded-2xl px-4 py-2.5 text-sm font-medium text-zinc-500 transition-colors hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
              >
                Not now
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
