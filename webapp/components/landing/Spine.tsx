"use client"

import { useRef, type ReactNode, type RefObject } from "react"
import { motion, useInView, useScroll, useSpring, useTransform } from "framer-motion"
import { useReducedMotionSafe } from "./hooks"
import styles from "./landing.module.css"

/**
 * The line, continued: a thin gradient rail in the left gutter whose fill is
 * scroll-linked across the whole product tour. Desktop only — on narrower
 * viewports it would crowd the content, so it is omitted and the step rail in
 * "How it works" carries the motif instead.
 */
export function Spine({ trackRef }: { trackRef: RefObject<HTMLDivElement | null> }) {
  const reduced = useReducedMotionSafe()
  const { scrollYProgress } = useScroll({
    target: trackRef,
    offset: ["start 65%", "end 85%"],
  })
  const smooth = useSpring(scrollYProgress, { stiffness: 120, damping: 30, restDelta: 0.001 })
  // Reveal with a clip rather than a scale, so the violet→red→green→gold
  // gradient stays anchored to the page instead of compressing as it fills.
  const clip = useTransform(smooth, (value) => `inset(0 0 ${Math.max(0, (1 - value) * 100)}% 0)`)

  return (
    <div className={styles.spine} aria-hidden="true">
      <div className={styles.spineTrack} />
      <motion.div className={styles.spineFill} style={reduced ? { clipPath: "inset(0 0 0% 0)" } : { clipPath: clip }} />
    </div>
  )
}

/**
 * A milestone on the rail. Lives inside a full-bleed section so it shares the
 * section's horizontal origin with the spine; lights up when its section
 * enters the viewport.
 */
export function SpineDot({ tone = "green", top = 118 }: { tone?: "violet" | "green" | "gold" | "red"; top?: number }) {
  const ref = useRef<HTMLSpanElement>(null)
  const inView = useInView(ref, { once: true, amount: 0.6 })

  return (
    <span
      ref={ref}
      className={styles.spineDot}
      data-tone={tone}
      data-lit={inView ? "true" : "false"}
      style={{ top }}
      aria-hidden="true"
    />
  )
}

/** Wraps the sections the spine travels through. */
export function SpineRail({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  return (
    <div className={styles.spineRail} ref={ref}>
      <Spine trackRef={ref} />
      {children}
    </div>
  )
}

export default SpineRail
