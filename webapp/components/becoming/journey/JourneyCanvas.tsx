'use client'

// The Becoming — the stage.
//
// A world of week-cards on a path that always moves forward and, for a
// consistent member, climbs. One camera (x, y, scale, tilt as motion values →
// one transform on the world div; nothing per-frame goes through React).
//
//   intro     a spread of blurred screens, the current one breathing; the
//             line draws itself under the haze; the camera flies in as the
//             blur lifts and the card "clicks" into place (full opening once
//             per week, a short one after; any touch skips it)
//   focus     one week centred. The finger STEERS the camera along the path:
//             drag and the next (or previous) card follows your intent —
//             pull it up on a climb, across on a hold, down on a dip; let go
//             and it snaps. Buttons/keys/wheel do the same in one step.
//   overview  pinch out: cards → coloured tiles → constant-size markers on
//             the line, with an area fill, month ticks, altitude gridlines and
//             an aggregate — a chart of your becoming. Tap a week to fly in.
//
// One step past the live week sits the Horizon: where this week is trending,
// and who you said you are becoming.

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { motion, useMotionValue, useTransform, animate, useReducedMotion, AnimatePresence, type MotionValue } from 'framer-motion'
import { X, ChevronLeft, ChevronRight, Maximize2, Minimize2, LocateFixed } from 'lucide-react'
import type { JourneyPayload } from '@/lib/becoming/journey'
import {
  layoutWeeks, boundsOf, overviewCamera, neighbourFor, nearestCard, monthTicks, cardSize, scrubTarget, exitEdge, aggregate, peakIndexes,
  OVERVIEW_MAX_SCALE, OVERVIEW_MIN_SCALE, TILE_FADE_SCALE, TILE_FULL_SCALE, type CardPos, type Dir,
} from '@/lib/becoming/layout'
import WeekCard, { HorizonCard, weekColor } from './WeekCard'

type Mode = 'intro' | 'focus' | 'overview'

const EASE_OUT = [0.22, 1, 0.36, 1] as const
const FLY = { duration: 0.85, ease: EASE_OUT }
const INTRO_FLY_MS = 1500
const INTRO_HOLD_MS = 1900
const INTRO_KEY = 'becoming.intro.v2.'

interface Pointer { x: number; y: number; t: number }

export interface JourneyCanvasProps {
  data: JourneyPayload
  onClose: () => void
  onDetails: (weekIndex: number) => void
  /** Deep link: land on this week (YYYY-MM-DD Sunday key). */
  initialWeekKey?: string | null
  /** True while a sheet is open over the stage: gestures and keys are ignored. */
  inert?: boolean
}

function weekKeyOfToday(todayKey: string): string {
  const [y, m, d] = todayKey.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d)); dt.setUTCDate(dt.getUTCDate() - dt.getUTCDay())
  return dt.toISOString().slice(0, 10)
}

export default function JourneyCanvas({ data, onClose, onDetails, initialWeekKey, inert = false }: JourneyCanvasProps) {
  const reduced = !!useReducedMotion()
  const stageRef = useRef<HTMLDivElement>(null)
  // The stage is measured synchronously before anything positions itself; until
  // then nothing is laid out (a placeholder size would put the intro's landing
  // point somewhere else on every phone that is not 390×844).
  const [vp, setVp] = useState<{ w: number; h: number } | null>(null)
  const inertRef = useRef(inert); inertRef.current = inert
  const vw = vp?.w ?? 390, vh = vp?.h ?? 844
  const size = useMemo(() => cardSize(vw, vh), [vw, vh])
  const positionsRef = useRef<CardPos[]>([])
  const weeks = data.weeks
  const positions = useMemo<CardPos[]>(() => layoutWeeks(weeks, size), [weeks, size])
  positionsRef.current = positions
  const bounds = useMemo(() => boundsOf(positions, size), [positions, size])
  const liveIndex = Math.max(0, weeks.length - 1)
  const horizonIndex = weeks.length // one past the live week
  const startIndex = useMemo(() => {
    const i = initialWeekKey ? weeks.findIndex(w => w.weekKey === initialWeekKey || (w.gap && w.gap.fromKey <= initialWeekKey && initialWeekKey <= w.gap.toKey)) : -1
    return i >= 0 ? i : liveIndex
  }, [initialWeekKey, weeks, liveIndex])

  // Full opening once per week; a short one after. Any touch skips.
  const introKind = useMemo<'full' | 'short' | 'none'>(() => {
    if (reduced) return 'none'
    if (initialWeekKey) return 'short'
    try {
      if (typeof window !== 'undefined' && window.sessionStorage.getItem('becoming.opened')) return 'none'
      const k = INTRO_KEY + weekKeyOfToday(data.todayKey)
      if (typeof window !== 'undefined' && window.localStorage.getItem(k)) return 'short'
    } catch { /* ignore */ }
    return 'full'
  }, [reduced, initialWeekKey, data.todayKey])
  // Low-memory devices skip the blur (a plain fog lifts instead) — same beat, no filter.
  const lowFx = useMemo(() => {
    if (typeof navigator === 'undefined') return false
    const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory
    return typeof mem === 'number' && mem < 4
  }, [])

  const [mode, setMode] = useState<Mode>(introKind === 'none' ? 'focus' : 'intro')
  const [focus, setFocus] = useState(startIndex)
  const [landed, setLanded] = useState<number | null>(introKind === 'none' ? startIndex : null)
  const [showTitle, setShowTitle] = useState(introKind === 'full')
  const [hint, setHint] = useState<string | null>(null)
  const modeRef = useRef(mode); modeRef.current = mode
  const focusRef = useRef(focus); focusRef.current = focus

  // Camera: the world point at the viewport centre, the scale, a tilt for the intro.
  const camX = useMotionValue(positions[startIndex]?.x ?? 0)
  const camY = useMotionValue(positions[startIndex]?.y ?? 0)
  const camS = useMotionValue(1)
  const tilt = useMotionValue(0)
  const blur = useMotionValue(introKind === 'none' ? 0 : 1)

  useLayoutEffect(() => {
    const el = stageRef.current
    if (!el) return
    const measure = () => { const w = el.clientWidth, h = el.clientHeight; if (w && h) setVp(prev => (prev && prev.w === w && prev.h === h ? prev : { w, h })) }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  // Lock the page behind the stage while it is up.
  useEffect(() => {
    const scroller = document.getElementById('app-scroll')
    const prev = scroller?.style.overflow
    if (scroller) scroller.style.overflow = 'hidden'
    return () => { if (scroller) scroller.style.overflow = prev ?? '' }
  }, [])

  const worldTransform = useTransform([camX, camY, camS] as MotionValue<number>[], ([x, y, s]) => {
    const sc = s as number
    return `translate3d(${vw / 2 - (x as number) * sc}px, ${vh / 2 - (y as number) * sc}px, 0) scale(${sc})`
  })
  // The intro tilt lives on a wrapper that rotates about the VIEWPORT centre —
  // rotating the world about its own origin (week 1) would swing a 36-week
  // scene by hundreds of pixels.
  const tiltTransform = useTransform(tilt, r => `rotate(${r}deg)`)
  // Stroke widths in world units that read as constant screen px at any zoom
  // (vector-effect does not undo an ancestor's CSS scale everywhere).
  const lineW = useTransform(camS, s => 3 / s)
  const hairW = useTransform(camS, s => 1 / s)
  const ringW = useTransform(camS, s => 2 / s)
  const bgTransform = useTransform([camX, camY, camS] as MotionValue<number>[], ([x, y, s]) => `translate3d(${-(x as number) * 0.25 * (s as number)}px, ${-(y as number) * 0.25 * (s as number)}px, 0)`)
  const blurFilter = useTransform(blur, v => (lowFx ? 'none' : `blur(${Math.round(v * 10)}px)`))
  const blurOpacity = useTransform(blur, v => v)
  const tilesOpacity = useTransform(camS, s => Math.max(0, Math.min(1, (s - TILE_FADE_SCALE) / (TILE_FULL_SCALE - TILE_FADE_SCALE))))
  const markersOpacity = useTransform(camS, s => 1 - Math.max(0, Math.min(1, (s - TILE_FADE_SCALE) / (TILE_FULL_SCALE - TILE_FADE_SCALE))))
  const graphChrome = useTransform(camS, s => 1 - Math.max(0, Math.min(1, (s - 0.35) / 0.15))) // gridlines/ticks/area
  const markerR = useTransform(camS, s => Math.min(6.5 / s, size.col * 0.42))
  const markerRing = useTransform(camS, s => Math.min(12 / s, size.col * 0.48))
  const tickFont = useTransform(camS, s => 12 / s)
  const tickBase = useMotionValue(0)
  const tickY = useTransform([tickBase, camS] as MotionValue<number>[], ([b, s]) => (b as number) + 34 / (s as number))
  const hudOpacity = useTransform(camS, s => 1 - Math.max(0, Math.min(1, (s - 0.3) / 0.2)))

  // ── Camera moves ──────────────────────────────────────────────────────
  const settleTimer = useRef<number | null>(null)
  const flyTo = useCallback((index: number, opts?: { scale?: number; duration?: number; click?: boolean }) => {
    const p = positions[index]; if (!p) return
    const dur = reduced ? 0 : opts?.duration ?? FLY.duration
    const same = index === focusRef.current
    setFocus(index)
    if (!same) setLanded(null)
    animate(camX, p.x, { ...FLY, duration: dur })
    animate(camY, p.y, { ...FLY, duration: dur })
    const s = opts?.scale ?? 1
    if (opts?.click && !reduced) {
      // Land a hair large, then spring-settle: a felt "click into place".
      animate(camS, [camS.get(), s * 1.015], { duration: dur * 0.9, ease: EASE_OUT }).then(() => { animate(camS, s, { type: 'spring', stiffness: 180, damping: 22 }) })
    } else animate(camS, s, { ...FLY, duration: dur })
    if (same) return
    if (settleTimer.current) window.clearTimeout(settleTimer.current)
    settleTimer.current = window.setTimeout(() => setLanded(index), Math.max(0, dur * 1000 - 120))
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator && !reduced) { try { navigator.vibrate(8) } catch { /* no haptics */ } }
  }, [positions, camX, camY, camS, reduced])

  const overviewTarget = useCallback(() => overviewCamera(bounds, positions, vw - 32, vh - 240), [bounds, positions, vw, vh])
  const enterOverview = useCallback(() => {
    const { s, x, y } = overviewTarget()
    const dur = reduced ? 0 : 0.8
    animate(camX, x, { ...FLY, duration: dur }); animate(camY, y, { ...FLY, duration: dur }); animate(camS, s, { ...FLY, duration: dur })
    setMode('overview')
  }, [overviewTarget, camX, camY, camS, reduced])
  const focusOn = useCallback((index: number) => { setMode('focus'); flyTo(index, { click: true }) }, [flyTo])

  // Re-centre on resize/rotation (and on the intro→focus handover) without animation.
  useEffect(() => {
    if (mode !== 'focus') return
    const p = positions[focusRef.current]; if (!p) return
    if (Math.abs(camX.get() - p.x) > 0.5 || Math.abs(camY.get() - p.y) > 0.5) { camX.set(p.x); camY.set(p.y) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [positions, mode])

  // ── Intro ─────────────────────────────────────────────────────────────
  const skipIntro = useRef<(() => void) | null>(null)
  useEffect(() => {
    if (mode !== 'intro') return
    if (!vp) return // wait for the stage to be measured
    if (!positions.length) { setMode('focus'); return }
    const cur = positions[startIndex]
    let cancelled = false
    const finish = () => {
      if (cancelled) return
      cancelled = true
      setShowTitle(false)
      const p = positionsRef.current[startIndex] ?? cur
      animate(camX, p.x, { duration: 0.25 }); animate(camY, p.y, { duration: 0.25 }); animate(camS, 1, { duration: 0.25 }); animate(tilt, 0, { duration: 0.25 }); animate(blur, 0, { duration: 0.25 })
      setFocus(startIndex); setMode('focus'); setLanded(startIndex)
    }
    skipIntro.current = finish
    try { window.localStorage.setItem(INTRO_KEY + weekKeyOfToday(data.todayKey), '1'); window.sessionStorage.setItem('becoming.opened', '1') } catch { /* ignore */ }

    if (introKind === 'short') {
      camX.set(cur.x); camY.set(cur.y); camS.set(0.7); blur.set(0.7); tilt.set(0)
      animate(camS, 1, { duration: 0.9, ease: EASE_OUT }); animate(blur, 0, { duration: 0.8, ease: EASE_OUT })
      const t = setTimeout(() => { if (!cancelled) { cancelled = true; setMode('focus'); setLanded(startIndex) } }, 950)
      return () => { cancelled = true; clearTimeout(t) }
    }

    // FULL: a spread of screens, blurred, tilted 2.5°, current one breathing.
    const s0 = 0.3
    camX.set(cur.x - (vw * 0.12) / s0); camY.set(cur.y - (vh * 0.06) / s0); camS.set(s0); tilt.set(2.5); blur.set(1)
    animate(camX, cur.x - (vw * 0.04) / s0, { duration: INTRO_HOLD_MS / 1000, ease: 'easeInOut' })
    animate(camS, s0 * 1.08, { duration: INTRO_HOLD_MS / 1000, ease: 'easeInOut' })
    animate(tilt, 1, { duration: INTRO_HOLD_MS / 1000, ease: 'easeInOut' })
    const t1 = setTimeout(() => {
      if (cancelled) return
      setShowTitle(false)
      const fly = { duration: INTRO_FLY_MS / 1000, ease: EASE_OUT }
      const p = positionsRef.current[startIndex] ?? cur
      animate(camX, p.x, fly); animate(camY, p.y, fly); animate(tilt, 0, fly)
      animate(camS, [camS.get(), 1.015], { duration: (INTRO_FLY_MS / 1000) * 0.9, ease: [0.65, 0, 0.35, 1] }).then(() => { if (!cancelled) animate(camS, 1, { type: 'spring', stiffness: 180, damping: 22 }) })
      animate(blur, 0, { duration: 1.1, ease: [0.65, 0, 0.35, 1], delay: 0.35 })
      setFocus(startIndex)
    }, INTRO_HOLD_MS)
    const t2 = setTimeout(() => { if (!cancelled) { cancelled = true; setMode('focus'); setLanded(startIndex); setHint('swipe to move through your weeks · pinch out for the line') } }, INTRO_HOLD_MS + INTRO_FLY_MS + 80)
    return () => { cancelled = true; clearTimeout(t1); clearTimeout(t2) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [positions.length, !!vp])
  useEffect(() => { if (!hint) return; const t = setTimeout(() => setHint(null), 3200); return () => clearTimeout(t) }, [hint])

  // ── Gestures ──────────────────────────────────────────────────────────
  const pointers = useRef(new Map<number, Pointer>())
  const gesture = useRef<{
    kind: 'none' | 'drag' | 'pinch'
    startCam: { x: number; y: number; s: number }
    startMid: { x: number; y: number }
    startDist: number
    startWorldMid: { x: number; y: number }
    startPt: Pointer
    lastPt: Pointer
    moved: boolean
    scrub: { target: number; progress: number } | null
  }>({ kind: 'none', startCam: { x: 0, y: 0, s: 1 }, startMid: { x: 0, y: 0 }, startDist: 1, startWorldMid: { x: 0, y: 0 }, startPt: { x: 0, y: 0, t: 0 }, lastPt: { x: 0, y: 0, t: 0 }, moved: false, scrub: null })

  const toWorld = useCallback((sx: number, sy: number) => {
    const s = camS.get()
    return { x: camX.get() + (sx - vw / 2) / s, y: camY.get() + (sy - vh / 2) / s }
  }, [camX, camY, camS, vw, vh])
  const midpoint = () => {
    const pts = [...pointers.current.values()]
    if (pts.length < 2) return { x: pts[0]?.x ?? 0, y: pts[0]?.y ?? 0, d: 1 }
    const [a, b] = pts
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, d: Math.hypot(a.x - b.x, a.y - b.y) || 1 }
  }

  const onPointerDown = (e: React.PointerEvent) => {
    if (inertRef.current) return
    if (modeRef.current === 'intro') { skipIntro.current?.(); return }
    ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
    const rect = stageRef.current!.getBoundingClientRect()
    const pt = { x: e.clientX - rect.left, y: e.clientY - rect.top, t: performance.now() }
    pointers.current.set(e.pointerId, pt)
    const g = gesture.current
    if (pointers.current.size === 2) {
      const m = midpoint()
      g.kind = 'pinch'; g.scrub = null
      g.startCam = { x: camX.get(), y: camY.get(), s: camS.get() }
      g.startMid = { x: m.x, y: m.y }; g.startDist = m.d
      g.startWorldMid = toWorld(m.x, m.y)
      camX.stop(); camY.stop(); camS.stop()
    } else if (pointers.current.size === 1) {
      g.kind = 'drag'
      g.startCam = { x: camX.get(), y: camY.get(), s: camS.get() }
      g.startPt = pt; g.lastPt = pt; g.moved = false; g.scrub = null
      camX.stop(); camY.stop()
    }
  }

  const onPointerMove = (e: React.PointerEvent) => {
    const g = gesture.current
    if (g.kind === 'none' || !pointers.current.has(e.pointerId)) return
    const rect = stageRef.current!.getBoundingClientRect()
    const pt = { x: e.clientX - rect.left, y: e.clientY - rect.top, t: performance.now() }
    pointers.current.set(e.pointerId, pt)
    if (g.kind === 'pinch' && pointers.current.size >= 2) {
      const m = midpoint()
      const s = Math.max(OVERVIEW_MIN_SCALE, Math.min(1.6, g.startCam.s * (m.d / g.startDist)))
      camS.set(s)
      camX.set(g.startWorldMid.x - (m.x - vw / 2) / s)
      camY.set(g.startWorldMid.y - (m.y - vh / 2) / s)
      return
    }
    if (g.kind === 'drag') {
      const dx = pt.x - g.startPt.x, dy = pt.y - g.startPt.y
      if (Math.abs(dx) > 5 || Math.abs(dy) > 5) g.moved = true
      const s = g.startCam.s
      if (modeRef.current === 'overview') {
        camX.set(g.startCam.x - dx / s); camY.set(g.startCam.y - dy / s)
      } else {
        // Scrub: project the drag onto the segment the finger is moving along and
        // move the camera along that segment (rubber-banded past the ends).
        const sc = scrubTarget(positions, focusRef.current, dx, dy, s)
        const cur = positions[focusRef.current]
        if (sc && cur) {
          const tgt = positions[sc.target]
          const p = sc.progress > 1 ? 1 + (sc.progress - 1) * 0.25 : sc.progress < 0 ? sc.progress * 0.25 : sc.progress
          camX.set(cur.x + (tgt.x - cur.x) * p); camY.set(cur.y + (tgt.y - cur.y) * p)
          g.scrub = { target: sc.target, progress: sc.progress }
        } else if (cur) {
          // Against the path: a small nudge, springs back on release.
          camX.set(cur.x - (dx * 0.15) / s); camY.set(cur.y - (dy * 0.15) / s)
          g.scrub = null
        }
      }
      g.lastPt = pt
    }
  }

  const onPointerUp = (e: React.PointerEvent) => {
    const g = gesture.current
    const had = pointers.current.get(e.pointerId)
    pointers.current.delete(e.pointerId)
    if (!had) return
    if (g.kind === 'pinch') {
      if (pointers.current.size >= 2) return
      g.kind = 'none'
      const s = camS.get()
      if (s >= OVERVIEW_MAX_SCALE) focusOn(nearestCard(positions, camX.get(), camY.get()))
      else if (modeRef.current !== 'overview') enterOverview()
      // Already in overview: keep whatever zoom/pan the fingers left (just clamp).
      else if (s < OVERVIEW_MIN_SCALE) animate(camS, OVERVIEW_MIN_SCALE, { duration: 0.25 })
      return
    }
    if (g.kind === 'drag' && pointers.current.size === 0) {
      g.kind = 'none'
      const dx = had.x - g.startPt.x, dy = had.y - g.startPt.y
      const dt = Math.max(1, had.t - g.startPt.t)
      const v = Math.hypot(dx, dy) / dt // px/ms
      if (modeRef.current === 'overview') {
        if (!g.moved) {
          const wpt = toWorld(had.x, had.y)
          const s = camS.get(); const tol = 28 / s
          const hit = positions.find(p => Math.abs(wpt.x - p.x) <= Math.max(size.w / 2, tol) && Math.abs(wpt.y - p.y) <= Math.max(size.h / 2, tol))
          if (hit) focusOn(hit.index)
        }
        return
      }
      // Focus: commit the scrub if it went far or fast enough; else snap back.
      if (g.scrub && (g.scrub.progress >= 0.35 || (v > 0.55 && g.scrub.progress > 0.08))) { flyTo(g.scrub.target, { duration: 0.55, click: true }); return }
      if (!g.moved) {
        // Tap: a neighbouring card comes forward; the focused card does nothing (its own buttons handle themselves).
        const wpt = toWorld(had.x, had.y)
        const hit = positions.find(p => Math.abs(wpt.x - p.x) <= size.w / 2 && Math.abs(wpt.y - p.y) <= size.h / 2)
        if (hit && hit.index !== focusRef.current) { flyTo(hit.index, { click: true }); return }
      } else if (!g.scrub && g.moved) {
        // Against the path: nothing navigates; say which way the line goes.
        const e = exitEdge(positions, focusRef.current, size.row)
        setHint(e === 'up' ? 'the line goes up from here · pull down' : e === 'down' ? 'this week dips · push up' : e === 'right' ? 'the line goes on from here · drag left' : 'written next Sunday')
      }
      flyTo(focusRef.current, { duration: 0.35 })
    }
  }

  // Wheel: ctrl/meta = zoom; otherwise navigate (focus) or pan (overview).
  // Registered natively with { passive: false } — React attaches wheel passively,
  // so preventDefault there is a no-op and ctrl+wheel would zoom the whole page.
  const wheelAcc = useRef({ x: 0, y: 0, until: 0 })
  const onWheelRef = useRef<(e: WheelEvent) => void>(() => {})
  useEffect(() => {
    const el = stageRef.current; if (!el) return
    const h = (e: WheelEvent) => onWheelRef.current(e)
    el.addEventListener('wheel', h, { passive: false })
    return () => el.removeEventListener('wheel', h)
  }, [])
  onWheelRef.current = (e: WheelEvent) => {
    if (inertRef.current) return
    if (modeRef.current === 'intro') { skipIntro.current?.(); return }
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault()
      const s0 = camS.get()
      const s = Math.max(OVERVIEW_MIN_SCALE, Math.min(1.6, s0 * Math.exp(-e.deltaY * 0.01)))
      const rect = stageRef.current!.getBoundingClientRect()
      const wpt = toWorld(e.clientX - rect.left, e.clientY - rect.top)
      camS.set(s)
      camX.set(wpt.x - (e.clientX - rect.left - vw / 2) / s)
      camY.set(wpt.y - (e.clientY - rect.top - vh / 2) / s)
      if (s < OVERVIEW_MAX_SCALE && modeRef.current !== 'overview') setMode('overview')
      if (s >= OVERVIEW_MAX_SCALE && modeRef.current !== 'focus') { setMode('focus'); setFocus(nearestCard(positions, camX.get(), camY.get())) }
      return
    }
    if (modeRef.current === 'overview') { const s = camS.get(); camX.set(camX.get() + e.deltaX / s); camY.set(camY.get() + e.deltaY / s); return }
    const now = performance.now()
    if (now < wheelAcc.current.until) return
    wheelAcc.current.x += e.deltaX; wheelAcc.current.y += e.deltaY
    const ax = Math.abs(wheelAcc.current.x), ay = Math.abs(wheelAcc.current.y)
    if (Math.max(ax, ay) > 90) {
      const dir: Dir = ax >= ay ? (wheelAcc.current.x > 0 ? 'left' : 'right') : (wheelAcc.current.y > 0 ? 'up' : 'down')
      const target = neighbourFor(positions, focusRef.current, dir)
      if (target != null) flyTo(target, { click: true })
      wheelAcc.current = { x: 0, y: 0, until: now + 550 }
    }
  }

  // Keyboard.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (inertRef.current) return
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'BUTTON' || t.tagName === 'A' || t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable) && (e.key === ' ' || e.key === 'Enter')) return
      if (modeRef.current === 'intro') { skipIntro.current?.(); return }
      const forward = ['ArrowRight', 'ArrowUp', ' ', 'PageDown']
      const back = ['ArrowLeft', 'ArrowDown', 'PageUp']
      if (forward.includes(e.key) || back.includes(e.key)) {
        e.preventDefault()
        if (modeRef.current === 'overview') { focusOn(focusRef.current); return }
        const t = neighbourFor(positions, focusRef.current, forward.includes(e.key) ? 'left' : 'right'); if (t != null) flyTo(t, { click: true })
      } else if (e.key === '-' || e.key === '_' || e.key === 'm' || e.key === 'M') enterOverview()
      else if (e.key === '+' || e.key === '=' || e.key === 'Enter') focusOn(focusRef.current)
      else if (e.key === 'Escape') { if (modeRef.current === 'overview') focusOn(focusRef.current); else onClose() }
      else if (e.key === 'Home') focusOn(0)
      else if (e.key === 'End') focusOn(liveIndex)
      else if (e.key === 'h' || e.key === 'H') focusOn(horizonIndex)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [positions, flyTo, focusOn, enterOverview, onClose, liveIndex, horizonIndex])

  // ── Path (SVG in world space) ─────────────────────────────────────────
  const path = useMemo(() => {
    if (positions.length < 1) return null
    const weeksPos = positions.filter(p => !p.horizon)
    const segs: Array<{ x1: number; y1: number; x2: number; y2: number; dashed: boolean; color: string }> = []
    for (let i = 1; i < positions.length; i++) {
      const a = positions[i - 1], b = positions[i]
      const wk = weeks[Math.min(i, weeks.length - 1)]
      const dashed = !!b.horizon || !!wk?.gap
      segs.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y, dashed, color: b.horizon ? '#a78bfa' : weekColor(wk.subject, wk.score, 62) })
    }
    const baseY = Math.max(...positions.map(p => p.y)) + size.h / 2 + 40
    const area = weeksPos.length >= 2 ? `${weeksPos[0].x},${baseY} ` + weeksPos.map(p => `${p.x},${p.y}`).join(' ') + ` ${weeksPos[weeksPos.length - 1].x},${baseY}` : null
    const maxAlt = Math.max(0, ...weeks.map(w => w.altitude))
    const grid: number[] = []
    for (let k = 0; k <= Math.ceil(maxAlt); k++) grid.push(-k * size.row)
    const allTicks = monthTicks(weeks).map(t => ({ ...t, x: positions[t.index].x }))
    // Long histories: every other month, or the labels collide at far zoom.
    const ticks = weeks.length > 26 ? allTicks.filter((_, i) => i % 2 === 0) : allTicks
    return { segs, area, minX: bounds.minX, minY: bounds.minY, w: bounds.width, h: bounds.height, grid, ticks, baseY }
  }, [positions, bounds, weeks, size])
  useEffect(() => { if (path) tickBase.set(path.baseY) }, [path, tickBase])

  const stars = useMemo(() => {
    const out: Array<{ x: number; y: number; r: number; o: number }> = []
    let seed = 7
    const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280 }
    for (let i = 0; i < 90; i++) out.push({ x: bounds.minX - 600 + rnd() * (bounds.width + 1200), y: bounds.minY - 900 + rnd() * (bounds.height + 1800), r: 1 + rnd() * 2, o: 0.2 + rnd() * 0.6 })
    return out
  }, [bounds])

  const peaks = useMemo(() => peakIndexes(weeks), [weeks])
  const onHorizon = focus === horizonIndex
  const focusedWeek = weeks[Math.min(focus, weeks.length - 1)]
  const edge = exitEdge(positions, focus, size.row)
  const liveTrend: 'up' | 'flat' | 'down' = weeks.length ? (weeks[liveIndex].daysElapsed < 2 ? 'flat' : weeks[liveIndex].step === 'up' ? 'up' : weeks[liveIndex].step === 'down' ? 'down' : 'flat') : 'flat'
  const drawLine = mode === 'intro' && introKind === 'full' && !reduced

  return (
    <div
      ref={stageRef}
      data-testid="journey-stage"
      data-mode={mode}
      className="fixed inset-0 z-[90] select-none overflow-hidden bg-[#07060d] text-white"
      style={{ touchAction: 'none', overscrollBehavior: 'contain' }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      tabIndex={0}
      aria-label="The Becoming"
    >
      {/* Ambient sky */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_80%_at_50%_0%,rgba(124,58,237,0.32),transparent_60%),radial-gradient(80%_60%_at_80%_100%,rgba(16,185,129,0.16),transparent_60%)]" />
      <motion.div className="pointer-events-none absolute inset-0" style={{ transform: bgTransform }}>
        <svg className="absolute left-1/2 top-1/2 overflow-visible" width="1" height="1" aria-hidden="true">
          {stars.map((s, i) => <circle key={i} cx={s.x * 0.25} cy={s.y * 0.25} r={s.r} fill="white" opacity={s.o * 0.5} />)}
        </svg>
      </motion.div>

      {/* World (inside a layer that tilts about the viewport centre during the intro) */}
      <motion.div className="absolute inset-0" style={{ transform: tiltTransform }}>
      {vp && <motion.div className="absolute left-0 top-0 will-change-transform" style={{ transform: worldTransform, transformOrigin: '0 0' }}>
        {path && (
          <svg className="pointer-events-none absolute overflow-visible" style={{ left: path.minX, top: path.minY, width: path.w, height: path.h }} viewBox={`${path.minX} ${path.minY} ${path.w} ${path.h}`} aria-hidden="true">
            <defs>
              <linearGradient id="becoming-area" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0" stopColor="#a78bfa" stopOpacity="0.22" />
                <stop offset="1" stopColor="#a78bfa" stopOpacity="0" />
              </linearGradient>
            </defs>
            <motion.g style={{ opacity: graphChrome }}>
              {path.grid.map(y => <motion.line key={y} x1={path.minX} x2={path.minX + path.w} y1={y} y2={y} stroke="white" strokeOpacity={0.07} style={{ strokeWidth: hairW }} />)}
              {path.area && <polygon points={path.area} fill="url(#becoming-area)" />}
              {path.ticks.map(t => (
                <motion.text key={t.index} x={t.x} style={{ y: tickY, fontSize: tickFont }} fill="white" fillOpacity={0.45} textAnchor="middle" fontFamily="inherit" fontWeight={600}>{t.label}</motion.text>
              ))}
            </motion.g>
            {path.segs.map((sg, i) => sg.dashed ? (
              // Dashed (gap / horizon) segments are plain lines: framer's pathLength
              // handling overwrites stroke-dasharray, so they cannot animate the draw.
              <motion.line key={i} x1={sg.x1} y1={sg.y1} x2={sg.x2} y2={sg.y2} stroke={sg.color} strokeLinecap="round" strokeDasharray="6 6" opacity={0.85} style={{ strokeWidth: lineW }} pathLength={1} />
            ) : (
              <motion.line
                key={i}
                x1={sg.x1} y1={sg.y1} x2={sg.x2} y2={sg.y2}
                stroke={sg.color} strokeLinecap="round" opacity={0.85}
                style={{ strokeWidth: lineW }}
                initial={drawLine ? { pathLength: 0 } : false}
                animate={{ pathLength: 1 }}
                transition={drawLine ? { delay: 0.25 + i * (1.2 / Math.max(1, path.segs.length)), duration: 0.35, ease: 'easeOut' } : { duration: 0 }}
              />
            ))}
            {/* Markers — constant screen size, coloured by the week's subject */}
            <motion.g style={{ opacity: markersOpacity }}>
              {positions.map(p => {
                if (p.horizon) return <motion.circle key="h" cx={p.x} cy={p.y} r={markerR} fill="none" stroke="#a78bfa" strokeDasharray="3 3" style={{ strokeWidth: ringW }} />
                const w = weeks[p.index]
                const color = weekColor(w.subject, w.score, 62)
                return (
                  <g key={p.index}>
                    {w.isCurrent && <motion.circle cx={p.x} cy={p.y} r={markerRing} fill="none" stroke={color} strokeOpacity={0.6} style={{ strokeWidth: ringW }} />}
                    {peaks.has(p.index) && <motion.circle cx={p.x} cy={p.y} r={markerRing} fill="none" stroke="#ffd37a" strokeOpacity={0.9} style={{ strokeWidth: ringW }} />}
                    <motion.circle cx={p.x} cy={p.y} r={markerR} fill={color} stroke="#07060d" style={{ strokeWidth: ringW }} />
                    {p.index === 0 && (
                      <motion.text x={p.x} style={{ y: tickY, fontSize: tickFont }} dy="-1.6em" fill="white" fillOpacity={0.6} textAnchor="middle" fontFamily="inherit" fontWeight={600}>started</motion.text>
                    )}
                  </g>
                )
              })}
            </motion.g>
          </svg>
        )}

        <motion.div style={{ opacity: tilesOpacity }} className="absolute left-0 top-0">
          {positions.map((p, i) => {
            const d = Math.abs(i - focus)
            const inOverview = mode === 'overview'
            const compact = inOverview || d > 2
            const opacity = inOverview ? 1 : d <= 2 ? 1 : 0.35
            const brightness = inOverview ? 1 : d === 0 ? 1 : d === 1 ? 0.55 : 0.4
            const scale = inOverview ? 1 : d === 0 ? 1 : 0.94
            const isFocused = mode === 'focus' && i === focus
            return (
              <div
                key={p.horizon ? 'horizon' : weeks[i].weekKey}
                className="absolute"
                style={{
                  left: p.x - size.w / 2, top: p.y - size.h / 2, width: size.w, height: size.h,
                  opacity, transform: `scale(${mode === 'intro' && i === startIndex ? 1.03 : scale})`, transformOrigin: 'center',
                  transition: reduced ? undefined : 'opacity 500ms ease, transform 500ms ease, filter 500ms ease',
                  filter: !inOverview && d >= 1 && mode !== 'intro' ? `brightness(${brightness}) blur(${Math.min(2, d)}px)` : undefined,
                }}
              >
                {mode === 'intro' && i === startIndex && !reduced && (
                  <div className="pointer-events-none absolute -inset-4 animate-pulse rounded-[40px] bg-violet-400/25 blur-2xl" />
                )}
                {p.horizon ? (
                  <HorizonCard width={size.w} height={size.h} identity={data.identity} trend={liveTrend} next={data.next} focused={isFocused} landed={landed === i} reduced={reduced} />
                ) : (
                  <WeekCard
                    week={weeks[i]}
                    unit={data.unit}
                    width={size.w}
                    height={size.h}
                    focused={isFocused}
                    landed={landed === i}
                    compact={compact}
                    exitEdge={isFocused ? edge : null}
                    isPeak={peaks.has(i)}
                    spark={{ altitudes: weeks.map(x => x.altitude), at: i }}
                    onSparkline={enterOverview}
                    totalWeeks={weeks.length}
                    identity={data.identity}
                    next={weeks[i].isCurrent ? data.next : null}
                    onDetails={() => onDetails(i)}
                    reduced={reduced}
                  />
                )}
              </div>
            )
          })}
        </motion.div>
      </motion.div>}
      </motion.div>

      {/* Intro veil + title */}
      <motion.div className="pointer-events-none absolute inset-0" style={{ backdropFilter: blurFilter, WebkitBackdropFilter: blurFilter, opacity: blurOpacity, backgroundColor: 'rgba(7,6,13,0.22)' }} />
      <AnimatePresence>
        {showTitle && (
          <motion.div
            key="title"
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12, transition: { duration: 0.5 } }}
            transition={{ duration: 0.7, ease: EASE_OUT }}
            className="pointer-events-none absolute inset-x-0 top-[36%] px-8 text-center"
            data-testid="journey-title"
          >
            <p className="text-[11px] font-semibold uppercase tracking-[0.35em] text-white/60">The Becoming</p>
            <h1 className="mt-2 text-4xl font-black tracking-tight">Who am I becoming?</h1>
            {data.identity && <p className="mx-auto mt-4 max-w-sm font-serif text-base italic text-white/75 line-clamp-3">“{data.identity}”</p>}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Overview HUD: identity + aggregate */}
      {mode === 'overview' && (
        <motion.div className="pointer-events-none absolute inset-x-0 top-[calc(env(safe-area-inset-top,0px)+62px)] px-6 text-center" style={{ opacity: hudOpacity }} data-testid="journey-hud">
          {data.identity && <p className="mx-auto max-w-md font-serif text-[15px] italic leading-snug text-white/85 line-clamp-2">“{data.identity}”</p>}
          <p className="mt-1.5 text-[11px] tabular-nums text-white/55">{aggregate(weeks, data.unit)}{data.firstActivity ? ` · since ${new Date(data.firstActivity + 'T12:00:00Z').toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })}` : ''}</p>
        </motion.div>
      )}

      {/* Chrome */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between px-3 pt-[calc(env(safe-area-inset-top,0px)+10px)]">
        <button type="button" onPointerDown={e => e.stopPropagation()} onClick={onClose} aria-label="Close" className="pointer-events-auto flex h-10 w-10 items-center justify-center rounded-full bg-white/10 backdrop-blur hover:bg-white/15">
          <X className="h-5 w-5" />
        </button>
        <div className="text-center">
          <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-white/55">The Becoming</p>
          {mode !== 'intro' && (
            <p className="text-xs text-white/80" data-testid="journey-counter">
              {mode === 'overview' ? `${weeks.length} weeks` : onHorizon ? 'Horizon' : `Week ${focus + 1} of ${weeks.length}`}
            </p>
          )}
        </div>
        <button
          type="button" onPointerDown={e => e.stopPropagation()}
          onClick={() => (mode === 'overview' ? focusOn(focus) : enterOverview())}
          aria-label={mode === 'overview' ? 'Zoom in' : 'Zoom out'}
          data-testid="journey-zoom"
          className="pointer-events-auto flex h-10 w-10 items-center justify-center rounded-full bg-white/10 backdrop-blur hover:bg-white/15"
        >
          {mode === 'overview' ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
        </button>
      </div>

      {mode === 'focus' && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-between px-3 pb-[calc(env(safe-area-inset-bottom,0px)+14px)]">
          <button type="button" onPointerDown={e => e.stopPropagation()} onClick={() => { const t = neighbourFor(positions, focus, 'right'); if (t != null) flyTo(t, { click: true }) }} disabled={focus === 0} aria-label="Previous week" data-testid="journey-prev" className="pointer-events-auto flex h-11 w-11 items-center justify-center rounded-full bg-white/10 backdrop-blur disabled:opacity-30 hover:bg-white/15">
            <ChevronLeft className="h-5 w-5" />
          </button>
          <div className="text-center text-[11px] text-white/55" data-testid="journey-hint">
            {hint ?? (onHorizon ? 'written next Sunday · pinch out for the line' : edge ? `${edge === 'up' ? 'pull down' : edge === 'down' ? 'push up' : 'swipe left'} · next week ${edge === 'up' ? 'climbs' : edge === 'down' ? 'dips' : 'holds'}` : 'pinch out to see the line')}
          </div>
          <div className="pointer-events-auto flex items-center gap-2">
            {focus !== liveIndex && (
              <button type="button" onPointerDown={e => e.stopPropagation()} onClick={() => flyTo(liveIndex, { click: true })} aria-label="Jump to this week" data-testid="journey-today" className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 backdrop-blur hover:bg-white/15">
                <LocateFixed className="h-5 w-5" />
              </button>
            )}
            <button type="button" onPointerDown={e => e.stopPropagation()} onClick={() => { const t = neighbourFor(positions, focus, 'left'); if (t != null) flyTo(t, { click: true }) }} disabled={focus >= horizonIndex} aria-label="Next week" data-testid="journey-next" className="flex h-11 w-11 items-center justify-center rounded-full bg-white/10 backdrop-blur disabled:opacity-30 hover:bg-white/15">
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>
        </div>
      )}
      {mode === 'overview' && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 pb-[calc(env(safe-area-inset-bottom,0px)+16px)] text-center text-[11px] text-white/55">
          your line · tap a week to open it
        </div>
      )}
      {/* Live region for assistive tech */}
      <p className="sr-only" aria-live="polite">{mode === 'focus' && focusedWeek ? (onHorizon ? 'Horizon: who you are becoming' : `${focusedWeek.label}: ${focusedWeek.headline}`) : ''}</p>
    </div>
  )
}
