"use client";

/**
 * VideoFilmstripTrimmer — drag-from-either-side trim selector.
 *
 * Replaces the old pair of disconnected Start/End range sliders over a
 * (frequently blank) preview box. This renders actual frame thumbnails
 * sampled from the source video in a horizontal strip — so the admin can
 * see what they're trimming — with two handles overlaid on the strip
 * itself that drag in from the left and right edges, iOS-Photos-style.
 *
 * Frame extraction happens once per (videoUrl, duration): a detached
 * <video> seeks to N evenly spaced timestamps and each frame is drawn to a
 * canvas and read back as a small JPEG data URL. If that fails (a
 * cross-origin source with no CORS headers taints the canvas, or the file
 * doesn't load), the strip still works — it degrades to plain unfilled
 * tiles and a note that previews aren't available for this source.
 */

import { useEffect, useRef, useState } from 'react';
import { clampTrimEnd, clampTrimStart, filmstripFrameTimes, timeToPercent } from '@/lib/videoFilmstrip';

const FRAME_COUNT = 14;
const FRAME_TILE_WIDTH = 160;
/** Longest we'll wait for a single seek — a stalled frame shouldn't hang the whole strip. */
const SEEK_TIMEOUT_MS = 800;

export interface VideoFilmstripTrimmerProps {
  videoUrl: string;
  /** Real duration in seconds. Caller only renders this once it's known. */
  duration: number;
  start: number;
  /** `null` means "to the end of the file". */
  end: number | null;
  minDuration: number;
  onChange: (next: { start: number; end: number | null }) => void;
  className?: string;
}

function seekTo(video: HTMLVideoElement, time: number): Promise<void> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      video.removeEventListener('seeked', onSeeked);
      resolve();
    };
    const onSeeked = () => finish();
    video.addEventListener('seeked', onSeeked);
    video.currentTime = time;
    setTimeout(finish, SEEK_TIMEOUT_MS);
  });
}

export default function VideoFilmstripTrimmer({
  videoUrl,
  duration,
  start,
  end,
  minDuration,
  onChange,
  className,
}: VideoFilmstripTrimmerProps) {
  const stripRef = useRef<HTMLDivElement | null>(null);
  // Keyed by src rather than reset imperatively: a stale result from a
  // previous video is simply ignored on render (`result?.src === videoUrl`)
  // instead of being cleared with a synchronous setState at the top of the
  // effect.
  const [result, setResult] = useState<{ src: string; frames: string[] } | null>(null);
  const [errorSrc, setErrorSrc] = useState<string | null>(null);
  const frames = result?.src === videoUrl ? result.frames : [];
  const frameError = errorSrc === videoUrl;

  useEffect(() => {
    if (!videoUrl || !(duration > 0)) return;
    let cancelled = false;

    const video = document.createElement('video');
    video.crossOrigin = 'anonymous';
    video.muted = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.src = videoUrl;

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    async function run() {
      await new Promise<void>((resolve, reject) => {
        const onLoaded = () => {
          cleanup();
          resolve();
        };
        const onError = () => {
          cleanup();
          reject(new Error('video failed to load for frame extraction'));
        };
        const cleanup = () => {
          video.removeEventListener('loadeddata', onLoaded);
          video.removeEventListener('error', onError);
        };
        video.addEventListener('loadeddata', onLoaded, { once: true });
        video.addEventListener('error', onError, { once: true });
      });
      if (cancelled || !ctx) return;

      const vw = video.videoWidth || 16;
      const vh = video.videoHeight || 9;
      canvas.width = FRAME_TILE_WIDTH;
      canvas.height = Math.max(1, Math.round(FRAME_TILE_WIDTH * (vh / vw)));

      const out: string[] = [];
      for (const t of filmstripFrameTimes(duration, FRAME_COUNT)) {
        if (cancelled) return;
        await seekTo(video, t);
        if (cancelled) return;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        // Throws (SecurityError) if the source is cross-origin without CORS
        // headers — caught below, degrading to plain tiles.
        out.push(canvas.toDataURL('image/jpeg', 0.55));
      }
      if (!cancelled) setResult({ src: videoUrl, frames: out });
    }

    run().catch(() => {
      if (!cancelled) setErrorSrc(videoUrl);
    });

    return () => {
      cancelled = true;
      video.src = '';
    };
  }, [videoUrl, duration]);

  const effectiveEnd = end ?? duration;
  const startPct = timeToPercent(start, duration);
  const endPct = timeToPercent(effectiveEnd, duration);

  function dragHandlers(which: 'start' | 'end') {
    return {
      onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
      },
      onPointerMove: (e: React.PointerEvent<HTMLDivElement>) => {
        if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
        const rect = stripRef.current?.getBoundingClientRect();
        if (!rect || rect.width <= 0) return;
        const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
        const t = ratio * duration;
        if (which === 'start') {
          onChange({ start: clampTrimStart(t, effectiveEnd, duration, minDuration), end });
        } else {
          onChange({ start, end: clampTrimEnd(t, start, duration, minDuration) });
        }
      },
    };
  }

  function onHandleKeyDown(which: 'start' | 'end') {
    return (e: React.KeyboardEvent<HTMLDivElement>) => {
      const step = e.shiftKey ? 1 : 0.1;
      let delta = 0;
      if (e.key === 'ArrowLeft') delta = -step;
      else if (e.key === 'ArrowRight') delta = step;
      else return;
      e.preventDefault();
      if (which === 'start') {
        onChange({ start: clampTrimStart(start + delta, effectiveEnd, duration, minDuration), end });
      } else {
        onChange({ start, end: clampTrimEnd(effectiveEnd + delta, start, duration, minDuration) });
      }
    };
  }

  return (
    <div className={className}>
      <div
        ref={stripRef}
        className="relative h-16 w-full touch-none overflow-hidden rounded-lg bg-zinc-800 select-none"
      >
        <div className="absolute inset-0 flex">
          {frames.length > 0
            ? frames.map((src, i) => (
                // eslint-disable-next-line @next/next/no-img-element -- data URLs, not an optimizable remote asset
                <img key={i} src={src} alt="" draggable={false} className="h-full flex-1 object-cover" />
              ))
            : Array.from({ length: FRAME_COUNT }).map((_, i) => (
                <div
                  key={i}
                  className="h-full flex-1 animate-pulse border-r border-zinc-700/50 bg-zinc-700/60 last:border-r-0"
                />
              ))}
        </div>

        {/* Dim the parts of the file that will be cut. */}
        <div className="pointer-events-none absolute inset-y-0 left-0 bg-black/70" style={{ width: `${startPct}%` }} />
        <div
          className="pointer-events-none absolute inset-y-0 right-0 bg-black/70"
          style={{ width: `${100 - endPct}%` }}
        />
        <div
          className="pointer-events-none absolute inset-y-0 border-y-2 border-white"
          style={{ left: `${startPct}%`, width: `${Math.max(0, endPct - startPct)}%` }}
        />

        {/* Handles — drag from either side, like the reference trim UI. */}
        <div
          role="slider"
          aria-label="Trim start"
          aria-valuemin={0}
          aria-valuemax={duration}
          aria-valuenow={start}
          tabIndex={0}
          onKeyDown={onHandleKeyDown('start')}
          {...dragHandlers('start')}
          style={{ left: `calc(${startPct}% - 11px)` }}
          className="absolute inset-y-0 z-10 flex w-[22px] cursor-ew-resize touch-none items-center justify-center rounded-l-md bg-white shadow-md focus:outline-2 focus:outline-emerald-500"
        >
          <span className="h-6 w-0.5 rounded-full bg-zinc-500" />
        </div>
        <div
          role="slider"
          aria-label="Trim end"
          aria-valuemin={0}
          aria-valuemax={duration}
          aria-valuenow={effectiveEnd}
          tabIndex={0}
          onKeyDown={onHandleKeyDown('end')}
          {...dragHandlers('end')}
          style={{ left: `calc(${endPct}% - 11px)` }}
          className="absolute inset-y-0 z-10 flex w-[22px] cursor-ew-resize touch-none items-center justify-center rounded-r-md bg-white shadow-md focus:outline-2 focus:outline-emerald-500"
        >
          <span className="h-6 w-0.5 rounded-full bg-zinc-500" />
        </div>
      </div>

      {frameError && (
        <p className="mt-1.5 text-[11px] text-zinc-500 dark:text-zinc-400">
          Frame previews aren&apos;t available for this video source — the handles still trim by position.
        </p>
      )}
    </div>
  );
}
