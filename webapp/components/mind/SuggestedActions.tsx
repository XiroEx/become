'use client'

// The post-session "smart tile" — 3 suggested next actions (protocols across the
// arsenal categories), picked by the AI from the user's state + tendencies (with
// a deterministic fallback). One wide card at a time; auto-rotates every 3s and is
// swipeable left/right. Tapping a card opens that segment's dashboard.

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowRight, Sparkles } from 'lucide-react'
import { SEGMENT_STYLE, type SuggestedAction } from '@/lib/mind/suggestedProtocols'

const ROTATE_MS = 3000
const RESUME_MS = 5000

const variants = {
  enter: (dir: number) => ({ x: dir >= 0 ? 260 : -260, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (dir: number) => ({ x: dir >= 0 ? -260 : 260, opacity: 0 }),
}

export default function SuggestedActions({ actions, loading }: { actions: SuggestedAction[]; loading?: boolean }) {
  const router = useRouter()
  const [[page, dir], setPage] = useState<[number, number]>([0, 0])
  const [paused, setPaused] = useState(false)
  const resumeRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const n = actions.length
  const idx = n ? ((page % n) + n) % n : 0

  const draggedRef = useRef(false)
  const paginate = useCallback((d: number) => setPage(([p]) => [p + d, d]), [])

  const pauseBriefly = useCallback(() => {
    setPaused(true)
    if (resumeRef.current) clearTimeout(resumeRef.current)
    resumeRef.current = setTimeout(() => setPaused(false), RESUME_MS)
  }, [])

  // Auto-rotate every 3s (unless paused or single).
  useEffect(() => {
    if (paused || n <= 1) return
    const t = setInterval(() => setPage(([p]) => [p + 1, 1]), ROTATE_MS)
    return () => clearInterval(t)
  }, [paused, n])

  useEffect(() => () => { if (resumeRef.current) clearTimeout(resumeRef.current) }, [])

  if (!n) {
    if (loading) {
      return <div className="h-28 w-full animate-pulse rounded-2xl bg-zinc-100 dark:bg-zinc-900" />
    }
    return null
  }

  const a = actions[idx]
  const s = SEGMENT_STYLE[a.system] ?? { label: a.system, bg: 'bg-zinc-500/10', text: 'text-zinc-500', ring: 'border-zinc-500/30', dot: 'bg-zinc-500' }

  return (
    <div className="mb-4">
      <div className="mb-2 flex items-center gap-1.5 px-0.5">
        <Sparkles className="h-3.5 w-3.5 text-violet-500" />
        <p className="text-xs font-bold uppercase tracking-widest text-zinc-500 dark:text-zinc-400">Suggested next</p>
        {loading && <span className="text-[10px] text-zinc-400">· tuning…</span>}
      </div>

      <div className="relative h-32 w-full overflow-hidden">
        <AnimatePresence initial={false} custom={dir} mode="popLayout">
          <motion.button
            key={idx}
            type="button"
            custom={dir}
            variants={variants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ x: { type: 'spring', stiffness: 300, damping: 30 }, opacity: { duration: 0.2 } }}
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.6}
            onDragStart={() => { draggedRef.current = true; setPaused(true) }}
            onDragEnd={(_e, info) => {
              if (info.offset.x < -60) paginate(1)
              else if (info.offset.x > 60) paginate(-1)
              pauseBriefly()
              setTimeout(() => { draggedRef.current = false }, 0)
            }}
            onTap={() => {
              // A real tap (not a swipe) opens the segment.
              if (!draggedRef.current) router.push(`/dashboard/mind/${a.system}`)
            }}
            className={`absolute inset-0 flex cursor-grab flex-col justify-between rounded-2xl border ${s.bg} ${s.ring} p-4 text-left active:cursor-grabbing`}
          >
            <div>
              <div className="flex items-center justify-between">
                <span className={`text-[10px] font-bold uppercase tracking-widest ${s.text}`}>{s.label}</span>
                <ArrowRight className={`h-4 w-4 ${s.text}`} />
              </div>
              <p className="mt-1.5 text-lg font-extrabold leading-tight text-zinc-900 dark:text-white">{a.title}</p>
              <p className="mt-0.5 line-clamp-2 text-xs text-zinc-600 dark:text-zinc-300/80">{a.reason || a.blurb}</p>
            </div>
          </motion.button>
        </AnimatePresence>
      </div>

      {/* Dots */}
      {n > 1 && (
        <div className="mt-2.5 flex items-center justify-center gap-1.5">
          {actions.map((_, i) => (
            <button
              key={i}
              type="button"
              aria-label={`Suggestion ${i + 1}`}
              onClick={() => { setPage([i, i > idx ? 1 : -1]); pauseBriefly() }}
              className={`h-1.5 rounded-full transition-all ${i === idx ? `w-5 ${s.dot}` : 'w-1.5 bg-zinc-300 dark:bg-zinc-700'}`}
            />
          ))}
        </div>
      )}
    </div>
  )
}
