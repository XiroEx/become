// Shared motion tokens — keeps the animation sweep from drifting into a dozen
// one-off easings. `EASE_OUT` is the same gentle-decel curve The Becoming
// journey uses (components/becoming/journey/*); reuse it anywhere a fade/slide
// needs to feel like part of the same app instead of a bolted-on effect.

export const EASE_OUT = [0.16, 1, 0.3, 1] as const;

export const SPRING_SNAPPY = { type: "spring", stiffness: 380, damping: 30 } as const;

/** Per-item delay for staggered list/card entrances. */
export const stagger = (i: number, base = 0.05) => ({
  delay: base * i,
  duration: 0.35,
  ease: EASE_OUT,
});
