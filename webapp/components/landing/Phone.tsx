"use client"

import type { CSSProperties, ReactNode } from "react"
import Image from "next/image"
import styles from "./landing.module.css"

/** Every v2 capture is 780 x 1688 — a clean 390/844 device frame. */
export const SHOT_RATIO = "390 / 844"

/**
 * The captures start at the app's own header, with no OS status bar. The shell
 * therefore reserves a status strip above the capture (see `.phoneStatus`), so
 * the screen box is a little taller than the shot it holds. Every phone uses
 * the same screen box whether or not it shows the strip, so stacked/crossfaded
 * phones stay exactly the same size.
 */
export const SCREEN_RATIO = "390 / 864"

/** Colour of the reserved status strip — matched to each capture's top row. */
const STATUS_TINT = { light: "#fefefe", dark: "#151517" } as const

export function Phone({
  src,
  srcDark,
  alt,
  className,
  style,
  priority = false,
  sizes = "(max-width: 800px) 62vw, 300px",
  tone = "light",
  island = true,
  statusTint,
  statusTintDark,
  children,
}: {
  src: string
  /**
   * The dark-theme twin of `src`. When set, BOTH images render and CSS shows
   * one (`html.dark` hides `.lightOnly`, everything else hides `.darkOnly`) —
   * no JS, so no hydration mismatch and the swap is live when the OS theme
   * changes. `display: none` never intersects, so next/image's lazy loader
   * never fetches the hidden variant.
   */
  srcDark?: string
  alt: string
  className?: string
  style?: CSSProperties
  priority?: boolean
  sizes?: string
  /** `dark` lifts the inner highlight so the shell reads on a dark section. */
  tone?: "light" | "dark"
  /**
   * The captures carry no OS chrome, so a status strip plus a dynamic-island
   * pill is drawn above the screenshot. A couple of screens are full-bleed
   * media at the top (the live-logging video, the meal photo) where a flat
   * strip would read as a seam — those opt out and fill the whole screen.
   */
  island?: boolean
  /** Override the strip colour when the capture's top row is not white/near-black. */
  statusTint?: string
  /** Same, for the dark-theme twin — its top row is a different colour. */
  statusTintDark?: string
  children?: ReactNode
}) {
  const themed = Boolean(srcDark)

  return (
    <div className={styles.phoneFrame}>
      <div
        className={className ? `${styles.phone} ${className}` : styles.phone}
        data-tone={tone}
        style={style}
      >
        <div className={styles.phoneScreen}>
          {island ? (
            <>
              <span
                className={themed ? `${styles.phoneStatus} ${styles.lightOnly}` : styles.phoneStatus}
                aria-hidden="true"
                style={{ background: statusTint ?? STATUS_TINT[tone] }}
              />
              {themed ? (
                <span
                  className={`${styles.phoneStatus} ${styles.darkOnly}`}
                  aria-hidden="true"
                  style={{ background: statusTintDark ?? STATUS_TINT.dark }}
                />
              ) : null}
            </>
          ) : null}
          <div className={styles.phoneShot} data-inset={island ? "true" : "false"}>
            <Image
              className={themed ? styles.lightOnly : undefined}
              src={src}
              alt={alt}
              fill
              priority={priority}
              sizes={sizes}
            />
            {/* Lazy on purpose even when the light twin is `priority`: one
                preload per slot, and the hidden one is never fetched at all. */}
            {srcDark ? (
              <Image className={styles.darkOnly} src={srcDark} alt={alt} fill sizes={sizes} />
            ) : null}
          </div>
          {island ? <span className={styles.phoneIsland} aria-hidden="true" /> : null}
        </div>
        {children}
      </div>
    </div>
  )
}

export default Phone
