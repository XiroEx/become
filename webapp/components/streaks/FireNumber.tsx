'use client'

// A number that is on fire.
//
// Two things this has to do, and the second one is why there is no JavaScript
// in the animation:
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
//
// Legibility first: the ramp starts deep enough to read on white and lightens on
// black. Reduced motion keeps the colour crawling through the digits and stops
// everything that travels (see app/globals.css).

/** Where each tongue sits across the number, and how fast it burns. */
const FLAMES = [
  { left: '2%', w: 6, h: 10, dur: '1.05s', delay: '0s' },
  { left: '22%', w: 8, h: 13, dur: '0.85s', delay: '0.15s' },
  { left: '44%', w: 7, h: 11, dur: '1.25s', delay: '0.32s' },
  { left: '64%', w: 6, h: 9, dur: '0.95s', delay: '0.48s' },
  { left: '84%', w: 5, h: 8, dur: '1.15s', delay: '0.65s' },
]

export default function FireNumber({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={`relative inline-block align-baseline ${className}`} data-testid="fire-number">
      {/* Embers at the foot of the digits */}
      <span
        aria-hidden="true"
        className="fire-ember pointer-events-none absolute inset-x-0 bottom-0 h-2/5 rounded-[50%] bg-orange-500/35 blur-[5px] dark:bg-orange-400/40"
      />

      {/* Tongues licking off the top edge */}
      <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-[8%] h-1/4 overflow-visible">
        {FLAMES.map((f, i) => (
          <span
            key={i}
            className="fire-lick absolute bottom-0 rounded-[45%_55%_40%_60%] bg-gradient-to-t from-yellow-300 via-orange-500 to-red-500 blur-[1.5px]"
            style={{
              left: f.left,
              width: f.w,
              height: f.h,
              animationDuration: f.dur,
              animationDelay: f.delay,
              transformOrigin: 'bottom center',
            }}
          />
        ))}
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
