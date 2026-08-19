'use client'

// A number that is on fire.
//
// The super streak is the one number in the app that moves on its own. It
// burns in both themes: deep amber → orange on white, where a bright gradient
// would wash out, and the lighter end of the same ramp on black.
//
// The digits carry the motion, not the icon beside them — the streak is the
// thing that is alight, and the eye should go to the count.

import { motion, useReducedMotion } from 'framer-motion'

const EMBER = 'rgba(234,88,12,'   // orange-600, the colour of the glow

export default function FireNumber({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  const reduced = useReducedMotion()
  return (
    <span className={`relative inline-block ${className}`} data-testid="fire-number">
      {/* Heat haze */}
      <motion.span
        aria-hidden="true"
        className="absolute -inset-x-2 -inset-y-1 rounded-full bg-orange-500/25 blur-md dark:bg-orange-500/30"
        animate={reduced ? { opacity: 0.5 } : { opacity: [0.35, 0.7, 0.45, 0.65, 0.35], scaleY: [1, 1.12, 1.02, 1.08, 1] }}
        transition={reduced ? { duration: 0 } : { duration: 1.35, repeat: Infinity, ease: 'easeInOut' }}
      />
      <motion.span
        className="relative inline-block bg-gradient-to-b from-amber-500 via-orange-600 to-orange-700 bg-clip-text text-transparent dark:from-amber-200 dark:via-orange-400 dark:to-orange-600"
        animate={reduced ? {} : {
          scale: [1, 1.045, 0.995, 1.03, 1],
          filter: [
            `drop-shadow(0 0 0px ${EMBER}0))`,
            `drop-shadow(0 1px 9px ${EMBER}0.55))`,
            `drop-shadow(0 0 3px ${EMBER}0.3))`,
            `drop-shadow(0 1px 7px ${EMBER}0.5))`,
            `drop-shadow(0 0 0px ${EMBER}0))`,
          ],
        }}
        transition={reduced ? {} : { duration: 1.35, repeat: Infinity, ease: 'easeInOut' }}
        style={{ transformOrigin: 'bottom center' }}
      >
        {children}
      </motion.span>
    </span>
  )
}
