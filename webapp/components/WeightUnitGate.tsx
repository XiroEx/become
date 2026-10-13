'use client'

// NP-209: ask a member who has no stored lb/kg preference, exactly once.
//
// Jon's rule (NP-028, 10/13): "the KG members should be able to use KG
// throughout the whole app. yes you should be asked if you dont pick 'lb or
// Kg' which one you want to do." `profile.weightUnit` carries no default any
// more (models/User.ts) — absent means never asked, which is what makes this
// gate's condition answerable. The 46 accounts already holding 'lbs' are
// treated as having chosen it (George's DECIDED comment) and never see this.
//
// FAILS OPEN, same convention as ConsentGate: a network blip or a missing
// token leaves the member unasked for this load rather than blocking the app
// — the next load tries again. Mounted in the dashboard layout, next to
// ConsentGate, so it covers every protected route once per app load.
import { useMemberWeightUnit } from '@/lib/useMemberWeightUnit'
import { useLockScroll } from '@/lib/useLockScroll'

export default function WeightUnitGate() {
  const { hasChosen, loaded, choose } = useMemberWeightUnit()
  const open = loaded && !hasChosen
  useLockScroll(open)

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center sm:p-4">
      <div className="w-full max-w-sm rounded-t-2xl bg-white p-6 shadow-2xl dark:bg-zinc-900 sm:rounded-2xl">
        <h2 className="text-lg font-bold text-zinc-900 dark:text-white">Pounds or kilograms?</h2>
        <p className="mt-1.5 text-sm text-zinc-500 dark:text-zinc-400">
          Pick how you want your lifting weights shown — live workouts, history and records. You can change this later in Settings.
        </p>
        <div className="mt-5 grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => choose('lbs')}
            className="rounded-xl border border-zinc-300 py-3 text-center font-semibold text-zinc-900 transition-colors hover:border-zinc-900 dark:border-zinc-700 dark:text-white dark:hover:border-white"
          >
            Pounds (lbs)
          </button>
          <button
            type="button"
            onClick={() => choose('kg')}
            className="rounded-xl border border-zinc-300 py-3 text-center font-semibold text-zinc-900 transition-colors hover:border-zinc-900 dark:border-zinc-700 dark:text-white dark:hover:border-white"
          >
            Kilograms (kg)
          </button>
        </div>
      </div>
    </div>
  )
}
