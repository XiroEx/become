"use client"

// ---------------------------------------------------------------------------
// AdminVideoPreview — small inline preview for admin exercise videos.
//
// Mirrors the detection logic from WorkoutFormClient so the same URL renders
// identically here and in the workout flow:
//
//   - Direct video files (.mp4 / .mov / .webm / .mkv / .m4v) → autoplay
//     loop muted <video> with object-contain so portrait videos display whole.
//   - YouTube URLs → static thumbnail + external link (clicking opens in a
//     new tab). No iframe — admin doesn't need autoplay in a preview.
//   - Anything else → placeholder card.
//
// Used by:
//   - ExerciseForm.tsx — next to the Video URL input
//   - VideosEditor.tsx — per linked-video row (small thumbnail size)
// ---------------------------------------------------------------------------

import { ExternalLink, VideoOff } from 'lucide-react'
import FramedVideo from '@/components/FramedVideo'
import type { VideoFramingOverride } from '@/lib/videoFraming'

const DIRECT_VIDEO_FILE = /\.(mp4|mov|webm|mkv|m4v)(\?.*)?$/i

function isYouTubeUrl(u: string): boolean {
  return /(?:youtube\.com|youtu\.be)/i.test(u)
}

export interface AdminVideoPreviewProps {
  url?: string | null
  /** Visual size. `sm` is the row-thumbnail size; `md` is the form-preview size. */
  size?: 'sm' | 'md'
  className?: string
  /** Persisted intrinsic dims (for smart framing). */
  videoWidth?: number | null
  videoHeight?: number | null
  /** Optional manual framing override. */
  videoFraming?: VideoFramingOverride | null
  /** Called when intrinsic dims first become available — used by the form to
   *  auto-persist via PATCH /api/exercises/[slug]/video/dimensions. */
  onDimensions?: (w: number, h: number) => void
}

export default function AdminVideoPreview({
  url,
  size = 'md',
  className,
  videoWidth,
  videoHeight,
  videoFraming,
  onDimensions,
}: AdminVideoPreviewProps) {
  const trimmed = url?.trim() || ''

  // ── Sizing ────────────────────────────────────────────────────────────
  const wrapperBase = 'relative overflow-hidden rounded-lg bg-black ring-1 ring-zinc-200 dark:ring-zinc-800'
  const dims = size === 'sm'
    ? 'h-14 w-24 shrink-0'        // ~96×56 — fits a list row
    : 'aspect-video w-full max-w-sm' // ~16:9 card in the form

  // ── Empty / placeholder ───────────────────────────────────────────────
  if (!trimmed) {
    return (
      <div className={`${wrapperBase} ${dims} ${className ?? ''} flex items-center justify-center bg-zinc-100 dark:bg-zinc-800`}>
        <VideoOff className="h-4 w-4 text-zinc-400 dark:text-zinc-600" strokeWidth={1.5} />
      </div>
    )
  }

  // ── Direct video file ─────────────────────────────────────────────────
  // Uses FramedVideo so the preview reflects the exact framing rules used
  // in the workout flow. `size='sm'` still uses the 96×56 wrapper but the
  // <FramedVideo>'s internal aspect-video would override that, so for the
  // small badge size we render a custom inner wrapper.
  if (DIRECT_VIDEO_FILE.test(trimmed)) {
    if (size === 'sm') {
      // Small row thumbnail — we want the same framing math but compressed
      // into the 96×56 box without FramedVideo's own aspect-video constraint.
      return (
        <FramedVideo
          src={trimmed}
          surface="preview"
          videoWidth={videoWidth}
          videoHeight={videoHeight}
          videoFraming={videoFraming}
          onDimensions={onDimensions}
          wrapperOverride={`${wrapperBase} ${dims} ${className ?? ''}`}
        />
      )
    }
    return (
      <FramedVideo
        src={trimmed}
        surface="preview"
        videoWidth={videoWidth}
        videoHeight={videoHeight}
        videoFraming={videoFraming}
        onDimensions={onDimensions}
        className={`${className ?? ''} max-w-sm ring-1 ring-zinc-200 dark:ring-zinc-800`}
      />
    )
  }

  // ── YouTube fallback ─────────────────────────────────────────────────
  // No iframe — admin preview just opens the URL in a new tab on click. Avoids
  // an iframe load + the autoplay-blocked thumbnail flicker.
  if (isYouTubeUrl(trimmed)) {
    return (
      <a
        href={trimmed}
        target="_blank"
        rel="noopener noreferrer"
        className={`${wrapperBase} ${dims} ${className ?? ''} flex items-center justify-center gap-1.5 bg-zinc-900 text-xs font-medium text-white hover:opacity-80 transition`}
      >
        <ExternalLink className="h-3.5 w-3.5" strokeWidth={1.5} />
        YouTube
      </a>
    )
  }

  // ── Unknown URL — link out ────────────────────────────────────────────
  return (
    <a
      href={trimmed}
      target="_blank"
      rel="noopener noreferrer"
      className={`${wrapperBase} ${dims} ${className ?? ''} flex items-center justify-center bg-zinc-100 dark:bg-zinc-800 text-[11px] text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition`}
      title={trimmed}
    >
      <ExternalLink className="h-4 w-4" strokeWidth={1.5} />
    </a>
  )
}
