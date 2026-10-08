import { useEffect } from 'react'
import { Easing, cancelAnimation, useSharedValue, withRepeat, withSequence, withTiming, type SharedValue } from 'react-native-reanimated'
import { useReducedMotion } from '@/lib/a11y/reducedMotion'
import { EXIT_PULSE_EASING, EXIT_PULSE_LOW, EXIT_PULSE_MS } from './focusedCard'

/**
 * TAILWIND'S `animate-pulse`, AS A SHARED VALUE.
 *
 * `pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite` — opacity 1 → ½ at the
 * half → 1, forever. The focused card's exit-edge light wears it (NP-343),
 * and so does the intro's breathing glow on the start card (NP-346); this is
 * the one implementation, so the two cannot drift. The numbers are the exit
 * edge's, which named them first.
 *
 * Reduce Motion holds the value still at full: the thing that pulses is the
 * hint, the pulse is decoration. The hook reads the setting itself and
 * follows it live — a loop running when the setting lands is cancelled, and
 * resumes if it is turned back off. The shared value is written through
 * `set()`, Reanimated's own setter, so nothing here mutates a hook's result.
 */
export const PULSE_MS = EXIT_PULSE_MS
export const PULSE_LOW = EXIT_PULSE_LOW
export const PULSE_EASING = EXIT_PULSE_EASING

export function usePulse(): SharedValue<number> {
  const reduced = useReducedMotion()
  const pulse = useSharedValue(1)
  useEffect(() => {
    if (reduced) {
      cancelAnimation(pulse)
      pulse.set(1)
      return
    }
    const half = { duration: PULSE_MS / 2, easing: Easing.bezier(...PULSE_EASING) }
    pulse.set(withRepeat(withSequence(withTiming(PULSE_LOW, half), withTiming(1, half)), -1, false))
    return () => cancelAnimation(pulse)
  }, [reduced, pulse])
  return pulse
}
