'use client'

// A number that is on fire.
//
// The super streak is the one number in the app that is allowed to shout. The
// first cut was a gradient with a nervous flicker, and the flame ICON pulsed
// beside it — which read as "something is loading", not "you are on a run".
//
// Now the digits themselves burn: fire colours through the numerals (hot amber
// at the base, red at the tips), a bed of embers behind them, and flames that
// rise off the top and fade. Nothing else moves — the icon sits still, so the
// only thing pulling the eye is the count.
//
// Legibility first: the ramp starts deep enough to read on white and lightens
// on black, and with reduced motion the flames simply hold their shape.

import { motion, useReducedMotion } from 'framer-motion'

/** Where each flame sits across the number, and how it moves. */
const FLAMES = [
  { left: '6%', w: 8, h: 9, dur: 1.15, delay: 0 },
  { left: '30%', w: 10, h: 12, dur: 0.95, delay: 0.18 },
  { left: '56%', w: 7, h: 8, dur: 1.35, delay: 0.36 },
  { left: '76%', w: 6, h: 7, dur: 1.05, delay: 0.52 },
]

export default function FireNumber({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  const reduced = useReducedMotion()

  return (
    <span className={`relative inline-block align-baseline ${className}`} data-testid="fire-number">
      {/* Embers: a warm bed at the FOOT of the digits. Wrapped around the whole
          number it read as a smudge behind them, not as something burning. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-1 bottom-0 h-2/5 rounded-[50%] bg-orange-500/25 blur-[6px] dark:bg-orange-400/30"
      />

      {/* Flames licking off the TOP edge, rising and thinning out */}
      <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-[12%] h-1/4 overflow-visible">
        {FLAMES.map((f, i) => (
          <motion.span
            key={i}
            className="absolute bottom-0 rounded-[50%_50%_45%_45%] bg-gradient-to-t from-amber-400 via-orange-500 to-red-500 blur-[2px]"
            style={{ left: f.left, width: f.w, height: f.h, transformOrigin: 'bottom center' }}
            animate={reduced
              ? { opacity: 0.5, scaleY: 1 }
              : {
                  y: [2, -f.h * 0.3, 2],
                  scaleY: [0.85, 1.35, 0.85],
                  scaleX: [1, 0.72, 1],
                  opacity: [0.85, 0.15, 0.85],
                }}
            transition={reduced ? { duration: 0 } : { duration: f.dur, repeat: Infinity, ease: 'easeOut', delay: f.delay }}
          />
        ))}
      </span>

      {/* The digits, burning: hot at the base, red at the tips */}
      <span
        className="relative bg-gradient-to-t from-amber-500 via-orange-600 to-red-700 bg-clip-text font-black text-transparent dark:from-amber-200 dark:via-orange-400 dark:to-red-500"
        style={{ filter: 'drop-shadow(0 1px 7px rgba(234,88,12,0.6))' }}
      >
        {children}
      </span>
    </span>
  )
}
