'use client'

// How fast? Three chips (0.5 / 1 / 1.5 lb a week; 0.25 / 0.5 / 0.75 kg) with
// the ETA under them. A CHOSEN pace, not a computed one — a computed pace from
// history reads as a verdict; this is a plan. Used by onboarding, Settings and
// the nutrition goals page.

import { PACE_OPTIONS_LB, PACE_OPTIONS_KG, unitToKg, kgToUnit, etaWeeks, formatEta, etaDate } from '@/lib/goals/pace'

export interface PacePickerProps {
  unit: 'lbs' | 'kg'
  direction: 'lose' | 'maintain' | 'gain'
  /** Current pace in kg/week (null → nothing selected). */
  valueKgPerWeek: number | null
  onChange: (kgPerWeek: number) => void
  /** For the ETA line, both in `unit`. */
  latestWeight?: number | null
  targetWeight?: number | null
  compact?: boolean
  disabled?: boolean
}

export default function PacePicker({ unit, direction, valueKgPerWeek, onChange, latestWeight, targetWeight, compact, disabled }: PacePickerProps) {
  if (direction === 'maintain') return null
  const options = unit === 'kg' ? PACE_OPTIONS_KG : PACE_OPTIONS_LB
  const selected = valueKgPerWeek != null ? Math.round(kgToUnit(valueKgPerWeek, unit) * 100) / 100 : null
  const eta = latestWeight && targetWeight && valueKgPerWeek
    ? etaWeeks(unitToKg(latestWeight, unit), unitToKg(targetWeight, unit), valueKgPerWeek)
    : null
  const when = eta != null && eta > 0 ? etaDate(new Date(), eta).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : null

  return (
    <div data-testid="pace-picker">
      {!compact && (
        <label className="block text-xs font-medium text-zinc-500 dark:text-zinc-400 mb-1.5">
          How fast? ({direction === 'lose' ? 'lose' : 'gain'} per week)
        </label>
      )}
      <div className="grid grid-cols-3 gap-2">
        {options.map(o => {
          const on = selected != null && Math.abs(selected - o) < 0.01
          return (
            <button
              key={o}
              type="button"
              disabled={disabled}
              data-testid={`pace-${o}`}
              onClick={() => onChange(unitToKg(o, unit))}
              className={`rounded-xl border px-3 py-2 text-sm font-semibold transition-colors ${
                on
                  ? 'border-zinc-900 bg-zinc-900 text-white dark:border-white dark:bg-white dark:text-black'
                  : 'border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200'
              } disabled:opacity-50`}
            >
              {o} {unit === 'kg' ? 'kg' : 'lb'}
              <span className="block text-[10px] font-normal opacity-70">/ week</span>
            </button>
          )
        })}
      </div>
      <p className="mt-1.5 text-[11px] text-zinc-500 dark:text-zinc-400" data-testid="pace-eta">
        {eta == null
          ? 'Pick a pace to see when you get there.'
          : eta === 0
            ? 'You are already inside your target band.'
            : `At this pace: ${formatEta(eta)}${when ? ` → ${when}` : ''}. Slower is easier to keep; faster is fine short term.`}
      </p>
    </div>
  )
}
