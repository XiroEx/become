"use client";

/**
 * FramedVideo — the canonical <video> renderer for exercise demos.
 *
 * One component, three surfaces (form / live / preview), automatic per-video
 * framing via `resolveFraming`, optional one-shot dimension capture on first
 * playback. Anywhere we used to write an ad-hoc `<video className="object-…">`
 * we now use this.
 *
 * The component is intentionally dumb about persistence: it just *reports*
 * intrinsic dimensions via `onDimensions` after `loadedmetadata`. The caller
 * decides whether to POST them back to the server. The dedicated hook below
 * (`useAutoPersistVideoDimensions`) handles that for the workout surfaces.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Maximize2 } from 'lucide-react';
import { resolveFraming, type VideoFramingInput, type VideoSurface } from '@/lib/videoFraming';
import { resolveTrim, type VideoTrimOverride } from '@/lib/videoTrim';

// Same detection regex used elsewhere — kept local so this component is
// self-contained when imported by anything that already imports the regex.
const DIRECT_VIDEO_FILE = /\.(mp4|mov|webm|mkv|m4v)(\?.*)?$/i;

function mimeForVideoUrl(u: string): string {
  if (/\.mov(\?.*)?$/i.test(u)) return 'video/quicktime';
  if (/\.webm(\?.*)?$/i.test(u)) return 'video/webm';
  if (/\.mkv(\?.*)?$/i.test(u)) return 'video/x-matroska';
  return 'video/mp4';
}

export interface FramedVideoProps extends VideoFramingInput {
  src: string;
  surface: VideoSurface;
  /**
   * Optional in/out points in seconds. When set, the element's native `loop`
   * is turned off and we loop the trimmed window by hand — see the
   * `timeupdate` handler below.
   */
  videoTrim?: VideoTrimOverride | null;
  /** Called once with the file's duration after metadata loads. */
  onDuration?: (seconds: number) => void;
  /**
   * Called once with the intrinsic dims after the video's metadata loads.
   * Use this to auto-persist dims to the server. Receives the same numbers
   * every time the metadata reloads, so callers should de-dupe on their end.
   */
  onDimensions?: (width: number, height: number) => void;
  /** Extra classes on the outer container. */
  className?: string;
  /** Show a tiny "Demo" badge in the corner (form/preview only). */
  showBadge?: boolean;
  /** Show a fullscreen-toggle button in the top-left. Tapping it puts the
   *  underlying <video> into native fullscreen (Fullscreen API + iOS
   *  webkitEnterFullscreen fallback). When fullscreen, the browser's own
   *  controls show — that's the OS default we lean on. */
  showFullscreenToggle?: boolean;
  /**
   * Replace the default wrapper classes entirely. Use when the parent already
   * sizes the container (e.g. small thumbnail in a list row) — defaults still
   * include `relative overflow-hidden` so positioning works.
   */
  wrapperOverride?: string;
}

export default function FramedVideo({
  src,
  surface,
  videoWidth,
  videoHeight,
  videoFraming,
  videoTrim,
  onDimensions,
  onDuration,
  className,
  showBadge,
  showFullscreenToggle,
  wrapperOverride,
}: FramedVideoProps) {
  const reportedRef = useRef(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const enterFullscreen = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const v = videoRef.current;
    if (!v) return;
    // iOS Safari ignores standard requestFullscreen on arbitrary elements but
    // exposes webkitEnterFullscreen directly on <video>. Standard browsers use
    // the Fullscreen API on the video element itself.
    const ios = (v as unknown as { webkitEnterFullscreen?: () => void }).webkitEnterFullscreen;
    if (typeof ios === 'function') {
      ios.call(v);
      return;
    }
    if (typeof v.requestFullscreen === 'function') {
      v.requestFullscreen().catch(() => {
        // Some browsers reject fullscreen if not triggered by a direct user
        // gesture or if disabled by permissions policy. Fail silently.
      });
    }
  }, []);

  // When the user exits fullscreen, browsers leave the <video> paused — even
  // though it was autoplaying before. The autoplay attribute fires once on
  // mount, not on every state change, so the small-view loop just dies.
  // Listen for the exit event on both APIs (webkit on iOS, standard
  // fullscreenchange on the rest) and resume play() so the demo keeps looping.
  useEffect(() => {
    if (!showFullscreenToggle) return;
    const v = videoRef.current;
    if (!v) return;

    const resumeIfNotFullscreen = () => {
      const stillFullscreen =
        document.fullscreenElement === v ||
        (document as unknown as { webkitFullscreenElement?: Element }).webkitFullscreenElement === v;
      if (stillFullscreen) return;
      // Tiny delay so the browser finishes transitioning before play() — iOS
      // Safari otherwise re-suspends the video.
      window.setTimeout(() => {
        v.play().catch(() => {});
      }, 50);
    };

    // iOS dispatches webkitendfullscreen on the <video> element itself.
    v.addEventListener('webkitendfullscreen', resumeIfNotFullscreen);
    // Standard browsers dispatch fullscreenchange on document.
    document.addEventListener('fullscreenchange', resumeIfNotFullscreen);
    return () => {
      v.removeEventListener('webkitendfullscreen', resumeIfNotFullscreen);
      document.removeEventListener('fullscreenchange', resumeIfNotFullscreen);
    };
  }, [showFullscreenToggle]);

  // Resolve every render so manual edits in the framing editor are reflected
  // immediately (no debounce — sliders already throttle their setState).
  const resolved = useMemo(
    () => resolveFraming({ videoWidth, videoHeight, videoFraming }, surface),
    [videoWidth, videoHeight, videoFraming, surface]
  );

  // Trim window. Resolved against the real duration once metadata lands so a
  // stale in/out (saved against a file that has since been replaced) clamps
  // instead of seeking past the end and stalling on a black frame.
  //
  // The measured duration is stored together with the src it came from and
  // matched during render, rather than being cleared by an effect on `src`.
  // An effect runs after paint, so swapping the src would leave one frame in
  // which the new file is clamped against the previous file's length.
  const [measured, setMeasured] = useState<{ src: string; seconds: number } | null>(null);
  const duration = measured?.src === src ? measured.seconds : null;
  const trim = useMemo(
    () => resolveTrim({ videoTrim }, duration),
    [videoTrim, duration]
  );

  const handleLoadedMetadata = useCallback(
    (e: React.SyntheticEvent<HTMLVideoElement>) => {
      const v = e.currentTarget;
      if (Number.isFinite(v.duration) && v.duration > 0) {
        setMeasured({ src, seconds: v.duration });
        onDuration?.(v.duration);
      }
      const w = v.videoWidth;
      const h = v.videoHeight;
      if (!w || !h) return;
      if (reportedRef.current) return;
      reportedRef.current = true;
      onDimensions?.(w, h);
    },
    [onDimensions, onDuration, src]
  );

  // Manual loop over the trimmed window. `timeupdate` fires ~4×/sec, which is
  // coarse enough that we can overshoot `end` by up to ~250ms — acceptable for
  // a demo loop, and the alternative (requestAnimationFrame) burns a frame
  // callback on every card in a long workout.
  const handleTimeUpdate = useCallback(
    (e: React.SyntheticEvent<HTMLVideoElement>) => {
      if (trim.isFullLength) return;
      const v = e.currentTarget;
      const end = trim.end;
      if (end !== null && v.currentTime >= end) {
        v.currentTime = trim.start;
        // Native `loop` is off while trimmed, so a video that reached the real
        // end of the file is paused — seeking alone would leave it frozen.
        if (v.paused) v.play().catch(() => {});
      } else if (v.currentTime < trim.start - 0.25) {
        // Guards the case where something else (a scrub, a fullscreen exit)
        // dropped playback back before the in-point.
        v.currentTime = trim.start;
      }
    },
    [trim]
  );

  // Seek to the in-point whenever the window changes — covers both the first
  // metadata load and an admin dragging the slider in the trim editor.
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (trim.isFullLength) return;
    if (Math.abs(v.currentTime - trim.start) < 0.05) return;
    if (v.currentTime < trim.start || (trim.end !== null && v.currentTime > trim.end)) {
      v.currentTime = trim.start;
    }
  }, [trim, duration]);

  // Reset the "reported" flag whenever the src changes — different file, new
  // dims worth reporting.
  useMemoResetRef(reportedRef, src);

  if (!src || !DIRECT_VIDEO_FILE.test(src)) {
    // Caller is responsible for handling non-direct (YouTube, etc.) cases.
    // We render nothing here rather than guess.
    return null;
  }

  // Sizing per surface. `live` uses the parent's full extent (the live page
  // wraps us in `absolute inset-0`). `form` / `preview` are 16:9 cards.
  // `wrapperOverride` lets callers (admin row thumbnails) supply their own
  // sizing while still benefiting from the framing math.
  const wrapperCls =
    wrapperOverride ??
    (surface === 'live'
      ? 'relative h-full w-full overflow-hidden bg-black'
      : 'relative aspect-video w-full overflow-hidden rounded-lg bg-black');

  // CSS application: object-fit + object-position handle 99% of cases; zoom
  // applies a transform scale so admins can push past plain cover/contain.
  const objectFit = resolved.fit;
  const objectPosition = `${resolved.positionX}% ${resolved.positionY}%`;
  const transform = resolved.zoom === 100 ? undefined : `scale(${resolved.zoom / 100})`;

  return (
    <div className={`${wrapperCls} ${className ?? ''}`}>
      <video
        ref={videoRef}
        key={src}
        className="h-full w-full"
        style={{
          objectFit,
          objectPosition,
          ...(transform ? { transform, transformOrigin: 'center center' } : null),
        }}
        autoPlay
        loop={trim.isFullLength}
        muted
        playsInline
        preload="metadata"
        onLoadedMetadata={handleLoadedMetadata}
        onTimeUpdate={trim.isFullLength ? undefined : handleTimeUpdate}
      >
        <source src={src} type={mimeForVideoUrl(src)} />
      </video>
      {showBadge && surface !== 'live' && (
        <div className="absolute top-2 right-2">
          <span className="inline-block rounded bg-black/60 px-2 py-1 text-xs font-medium text-white backdrop-blur-sm">
            Demo
          </span>
        </div>
      )}
      {showFullscreenToggle && (
        <button
          type="button"
          onClick={enterFullscreen}
          aria-label="Open video in fullscreen"
          title="Fullscreen"
          className="absolute top-2 left-2 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-sm transition hover:bg-black/80 active:scale-95"
        >
          <Maximize2 className="h-4 w-4" strokeWidth={1.75} />
        </button>
      )}
    </div>
  );
}

// Tiny helper: reset a ref whenever a dep changes. Kept inline because it's
// trivial and self-contained — pulling it into lib/ would over-share something
// the rest of the app doesn't need.
function useMemoResetRef(ref: React.MutableRefObject<boolean>, dep: unknown) {
  // useMemo with an empty body just to fire on dep change — cheaper than
  // useEffect because we don't need post-paint timing.
  useMemo(() => {
    ref.current = false;
    return null;
  }, [ref, dep]);
}
