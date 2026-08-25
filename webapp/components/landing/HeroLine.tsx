"use client"

import { useEffect, useRef, useState } from "react"
import { motion } from "framer-motion"
import { useReducedMotionSafe } from "./hooks"
import styles from "./landing.module.css"

const PATH =
  "M8 672 C 116 672 138 534 224 494 C 314 452 340 322 428 284 C 502 252 522 172 592 156"

const MILESTONES = [0.14, 0.4, 0.66, 0.92]

/**
 * The signature motif: a gradient path that draws itself under the hero
 * phones, with milestone dots that land exactly on the curve (measured from
 * the path itself, so they can never drift).
 */
export function HeroLine() {
  const reduced = useReducedMotionSafe()
  const pathRef = useRef<SVGPathElement>(null)
  const [dots, setDots] = useState<Array<{ x: number; y: number }>>([])

  useEffect(() => {
    const node = pathRef.current
    if (!node) return
    const total = node.getTotalLength()
    setDots(
      MILESTONES.map((at) => {
        const point = node.getPointAtLength(total * at)
        return { x: point.x, y: point.y }
      }),
    )
  }, [])

  return (
    <svg
      className={styles.heroLine}
      viewBox="0 0 600 760"
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        {/* stop-color via class, not the presentation attribute: attributes
            cannot hold var(), and these follow the theme tokens (identical
            values in light, brighter variants on dark). */}
        <linearGradient id="becomeHeroLine" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0%" className={styles.heroLineStopViolet} />
          <stop offset="34%" className={styles.heroLineStopRed} />
          <stop offset="68%" className={styles.heroLineStopGreen} />
          <stop offset="100%" className={styles.heroLineStopGold} />
        </linearGradient>
      </defs>
      <path d={PATH} className={styles.heroLineGhost} />
      <motion.path
        ref={pathRef}
        d={PATH}
        className={styles.heroLinePath}
        stroke="url(#becomeHeroLine)"
        initial={reduced ? { pathLength: 1 } : { pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={reduced ? { duration: 0 } : { duration: 1.6, ease: [0.22, 1, 0.36, 1], delay: 0.15 }}
      />
      {dots.map((dot, index) => (
        <motion.circle
          key={`${dot.x}-${dot.y}`}
          cx={dot.x}
          cy={dot.y}
          r={6}
          className={styles.heroLineDot}
          initial={reduced ? { scale: 1, opacity: 1 } : { scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={
            reduced
              ? { duration: 0 }
              : { type: "spring", stiffness: 480, damping: 18, delay: 0.5 + index * 0.28 }
          }
          style={{ transformOrigin: `${dot.x}px ${dot.y}px` }}
        />
      ))}
    </svg>
  )
}

export default HeroLine
