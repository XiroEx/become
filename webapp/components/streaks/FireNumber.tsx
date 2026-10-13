'use client'

// A number that is on fire.
//
// Three things this has to do, and the last two are why there is no JavaScript
// in the animation and no flame inside the digits' box:
//
//   1. Look like fire. The gradient travels UP THROUGH the numerals rather than
//      sitting behind them, tongues lick off the top edge and fade, and a bed of
//      embers breathes underneath. The digits are the fuel, not a label with a
//      glow.
//   2. Be alight the moment the app opens. The first cut animated with
//      framer-motion, so nothing moved until React had hydrated — on a cold PWA
//      start, a slow phone, or a throttled tab, people opened the app and saw a
//      photograph of a fire. CSS keyframes start at first paint and never wait
//      for a bundle.
//   3. NEVER paint on a numeral. The tongues used to hang in a band from 8% to
//      33% of the number's height and the embers covered its bottom 40%, so on
//      the dashboard's Super Streak tile the fire was drawn across the digits
//      (found capturing store screenshots, 2026-10-13). The decoration now
//      lives in two bands OUTSIDE the digits' line box — `bottom-full` above,
//      `top-full` below — and each band is `overflow-hidden`, so a tongue that
//      is taller than its band (and the ember's 5px blur) is CLIPPED at the
//      digits' edge instead of bleeding over them. That holds at 1, 2 and 3
//      digits and at any text size, because every number in
//      lib/streaks/fireNumberLayout is a fraction of the text's own box.
//
// Legibility first: the ramp starts deep enough to read on white and lightens on
// black. Reduced motion keeps the colour crawling through the digits and stops
// everything that travels (see app/globals.css).

import { EMBER_BAND, FLAME_BAND, FLAME_TONGUES, percent } from '@/lib/streaks/fireNumberLayout'

export default function FireNumber({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={`relative inline-block align-baseline ${className}`} data-testid="fire-number">
      {/* Tongues licking off the top edge, in a clipped band ABOVE the digits */}
      <span
        aria-hidden="true"
        data-testid="fire-flames"
        className="pointer-events-none absolute inset-x-0 bottom-full overflow-hidden"
        style={{ height: `${FLAME_BAND}em` }}
      >
        {FLAME_TONGUES.map((f, i) => (
          <span
            key={i}
            className="fire-lick absolute bottom-0 rounded-[45%_55%_40%_60%] bg-gradient-to-t from-yellow-300 via-orange-500 to-red-500 blur-[1.5px]"
            style={{
              left: percent(f.left),
              width: percent(f.width),
              height: `${f.height}em`,
              animationDuration: `${f.durationMs}ms`,
              animationDelay: `${f.delayMs}ms`,
              transformOrigin: 'bottom center',
            }}
          />
        ))}
      </span>

      {/* Embers at the foot of the digits, in a clipped band BELOW them: the
          band is what stops the blur bleeding back up onto the numerals. */}
      <span
        aria-hidden="true"
        data-testid="fire-embers"
        className="pointer-events-none absolute inset-x-0 top-full overflow-hidden"
        style={{ height: `${EMBER_BAND}em` }}
      >
        <span className="fire-ember absolute inset-0 rounded-[50%] bg-orange-500/35 blur-[5px] dark:bg-orange-400/40" />
      </span>

      {/* The digits themselves, with the fire running up through them */}
      <span
        className="fire-digits relative bg-gradient-to-t from-yellow-400 via-orange-600 to-red-700 bg-clip-text font-black text-transparent dark:from-yellow-200 dark:via-orange-400 dark:to-red-500"
        style={{ filter: 'drop-shadow(0 1px 8px rgba(234,88,12,0.65))' }}
      >
        {children}
      </span>
    </span>
  )
}
