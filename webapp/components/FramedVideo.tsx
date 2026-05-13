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
import { Volume2, VolumeX } from 'lucide-react';
import { resolveFraming, type VideoFramingInput, type VideoSurface } from '@/lib/videoFraming';

// Persists the user's mute preference across the session so a viewer who
// unmutes once doesn't have to un-mute every exercise card.
const MUTE_LS_KEY = 'become:video-muted';

function readInitialMuted(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    return window.localStorage.getItem(MUTE_LS_KEY) !== '0';
  } catch {
    return true;
  }
}

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
   * Called once with the intrinsic dims after the video's metadata loads.
   * Use this to auto-persist dims to the server. Receives the same numbers
   * every time the metadata reloads, so callers should de-dupe on their end.
   */
  onDimensions?: (width: number, height: number) => void;
  /** Extra classes on the outer container. */
  className?: string;
  /** Show a tiny "Demo" badge in the corner (form/preview only). */
  showBadge?: boolean;
  /** Show a mute/unmute toggle button. Workout form uses this so users can
   *  hear coaching audio without giving up clean autoplay (the video still
   *  starts muted; the toggle persists across the session via localStorage). */
  showMuteToggle?: boolean;
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
  onDimensions,
  className,
  showBadge,
  showMuteToggle,
  wrapperOverride,
}: FramedVideoProps) {
  const reportedRef = useRef(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  // Always start muted (autoplay requires it). After mount, sync to the
  // user's saved preference. SSR-safe because the initial render is always
  // muted; only the client effect can flip it.
  const [muted, setMuted] = useState<boolean>(true);
  useEffect(() => {
    if (!showMuteToggle) return;
    const remembered = readInitialMuted();
    if (!remembered) {
      setMuted(false);
    }
  }, [showMuteToggle]);

  // Keep the <video> element's muted attribute in sync with state. When the
  // user un-mutes, also nudge play() since some browsers pause a previously-
  // autoplaying muted video the moment you flip muted=false.
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = muted;
    if (!muted) {
      v.play().catch(() => {
        // Autoplay-with-sound was rejected. Fall back to muted so the demo
        // keeps looping silently — the user can try the toggle again.
        v.muted = true;
        setMuted(true);
      });
    }
  }, [muted]);

  const toggleMute = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setMuted((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(MUTE_LS_KEY, next ? '1' : '0');
      } catch {
        /* private mode / disabled storage — fall through */
      }
      return next;
    });
  }, []);

  // Resolve every render so manual edits in the framing editor are reflected
  // immediately (no debounce — sliders already throttle their setState).
  const resolved = useMemo(
    () => resolveFraming({ videoWidth, videoHeight, videoFraming }, surface),
    [videoWidth, videoHeight, videoFraming, surface]
  );

  const handleLoadedMetadata = useCallback(
    (e: React.SyntheticEvent<HTMLVideoElement>) => {
      const v = e.currentTarget;
      const w = v.videoWidth;
      const h = v.videoHeight;
      if (!w || !h) return;
      if (reportedRef.current) return;
      reportedRef.current = true;
      onDimensions?.(w, h);
    },
    [onDimensions]
  );

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
        loop
        muted={muted}
        playsInline
        preload="metadata"
        onLoadedMetadata={handleLoadedMetadata}
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
      {showMuteToggle && (
        <button
          type="button"
          onClick={toggleMute}
          aria-label={muted ? 'Unmute video' : 'Mute video'}
          title={muted ? 'Unmute' : 'Mute'}
          className="absolute bottom-2 right-2 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-sm transition hover:bg-black/80 active:scale-95"
        >
          {muted ? (
            <VolumeX className="h-4 w-4" strokeWidth={1.75} />
          ) : (
            <Volume2 className="h-4 w-4" strokeWidth={1.75} />
          )}
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
