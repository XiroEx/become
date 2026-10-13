"use client"

import { useReducedMotionSafe } from "./hooks"
import styles from "./landing.module.css"

/**
 * The Becoming, as a vibe rather than a feature: identity lines from the
 * weekly practice drift past between the hero and the product tour.
 */
const LINES = [
  "I keep the next promise.",
  "Then → now → next.",
  "Three practices. One person.",
  "Evidence, not vibes.",
  "Week 7: you came back.",
  "The set you didn't skip.",
  "Consistency is a skill, not a mood.",
  "Show up. Log it. Repeat.",
] as const

function Track({ ariaHidden }: { ariaHidden: boolean }) {
  return (
    <div className={styles.marqueeTrack} aria-hidden={ariaHidden || undefined}>
      {LINES.map((line) => (
        <span key={line} className={styles.marqueeItem}>
          {line}
          <span className={styles.marqueeDot} aria-hidden="true" />
        </span>
      ))}
    </div>
  )
}

export function Marquee() {
  const reduced = useReducedMotionSafe()

  return (
    <section className={styles.marquee} aria-label="The Becoming">
      <div className={styles.marqueeViewport} data-static={reduced ? "true" : "false"}>
        <Track ariaHidden={false} />
        {reduced ? null : <Track ariaHidden />}
      </div>
    </section>
  )
}

export default Marquee
