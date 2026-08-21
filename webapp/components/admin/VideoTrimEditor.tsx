"use client";

/**
 * VideoTrimEditor — admin-only in/out points for a single exercise video.
 *
 * Sits under VideoFramingEditor in the exercise form. Default state is "full
 * length"; opening the panel reveals a start/end pair of sliders over a live
 * preview that loops the selected window, so you can see the trim before you
 * save it.
 *
 * The trim is non-destructive — we store seconds and the player seeks, we
 * never re-encode. That means a bad in/out is one edit away from fixed rather
 * than a re-upload, and it works without ffmpeg in the runtime image.
 */

import { useCallback, useEffect, useState } from 'react';
import { ChevronDown, ChevronUp, RotateCcw, Save, Scissors } from 'lucide-react';
import FramedVideo from '@/components/FramedVideo';
import type { VideoFramingOverride } from '@/lib/videoFraming';
import {
  MIN_TRIM_DURATION,
  formatTimecode,
  resolveTrim,
  type VideoTrimOverride,
} from '@/lib/videoTrim';

export interface VideoTrimEditorProps {
  /** Exercise slug used to build the PATCH URL. */
  slug: string;
  videoUrl: string;
  videoWidth?: number | null;
  videoHeight?: number | null;
  videoFraming?: VideoFramingOverride | null;
  /** Persisted trim, if any. */
  videoTrim?: VideoTrimOverride | null;
  /**
   * Endpoint family. Admin catalog exercises PATCH
   * /api/exercises/[slug]/trim; a user's own custom exercise PATCHes
   * /api/exercises/custom/[slug]/trim.
   */
  scope?: 'admin' | 'custom';
  /** Fired after a successful save with the new trim payload. */
  onSaved?: (next: VideoTrimOverride | null) => void;
}

/** Slider granularity. Matches the tenth-of-a-second the API stores. */
const STEP = 0.1;

export default function VideoTrimEditor({
  slug,
  videoUrl,
  videoWidth,
  videoHeight,
  videoFraming,
  videoTrim,
  scope = 'admin',
  onSaved,
}: VideoTrimEditorProps) {
  const [open, setOpen] = useState(false);
  const [duration, setDuration] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const saved = resolveTrim({ videoTrim }, duration);

  // Draft is the live preview state — dragging a slider must not fire a
  // request per pixel, so it stays local until Save.
  const [draft, setDraft] = useState<{ start: number; end: number | null }>({
    start: saved.start,
    end: saved.end,
  });

  // Once the real duration lands we can give the "end" slider a maximum. Seed
  // an unset end to the full length so the handle starts somewhere sensible
  // rather than pinned at zero.
  useEffect(() => {
    if (duration === null) return;
    setDraft((d) => ({
      start: Math.min(d.start, Math.max(0, duration - MIN_TRIM_DURATION)),
      end: d.end === null ? duration : Math.min(d.end, duration),
    }));
  }, [duration]);

  const patchTrim = useCallback(
    async (payload: { start?: number | null; end?: number | null }) => {
      const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
      const base = scope === 'custom' ? '/api/exercises/custom' : '/api/exercises';
      const res = await fetch(`${base}/${encodeURIComponent(slug)}/trim`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? 'Failed to save trim');
      }
      return (await res.json()) as { videoTrim: VideoTrimOverride | null };
    },
    [slug, scope]
  );

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      // An end at the very end of the file is the same as no end bound; send
      // null so the record says "full length" instead of pinning a number that
      // would be wrong the moment the video is replaced.
      const atEnd = duration !== null && draft.end !== null && draft.end >= duration - 0.05;
      const data = await patchTrim({
        start: draft.start > 0 ? draft.start : null,
        end: atEnd ? null : draft.end,
      });
      onSaved?.(data.videoTrim);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save trim');
    } finally {
      setSaving(false);
    }
  }

  async function handleReset() {
    setSaving(true);
    setError(null);
    try {
      const data = await patchTrim({ start: null, end: null });
      setDraft({ start: 0, end: duration });
      onSaved?.(data.videoTrim);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reset trim');
    } finally {
      setSaving(false);
    }
  }

  if (!videoUrl) return null;

  const max = duration ?? 0;
  const clipLength = draft.end === null ? null : Math.max(0, draft.end - draft.start);
  // Save is pointless until we know the duration (the sliders have no range)
  // and meaningless if the window is shorter than the floor the API enforces.
  const canSave =
    duration !== null && (draft.end === null || draft.end - draft.start >= MIN_TRIM_DURATION);

  return (
    <div className="rounded-xl border border-zinc-200 dark:border-zinc-800">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-3 py-2.5 text-left"
      >
        <span className="flex items-center gap-2 text-sm font-medium text-zinc-700 dark:text-zinc-200">
          <Scissors className="h-3.5 w-3.5" strokeWidth={1.75} />
          Trim length
          {saved.isFullLength ? (
            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
              Full
            </span>
          ) : (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
              {formatTimecode(saved.start)} – {saved.end === null ? 'end' : formatTimecode(saved.end)}
            </span>
          )}
        </span>
        {open ? (
          <ChevronUp className="h-4 w-4 text-zinc-400" />
        ) : (
          <ChevronDown className="h-4 w-4 text-zinc-400" />
        )}
      </button>

      {open && (
        <div className="space-y-3 border-t border-zinc-200 p-3 dark:border-zinc-800">
          {/* Live preview of the drafted window, not the saved one. */}
          <FramedVideo
            src={videoUrl}
            surface="preview"
            videoWidth={videoWidth}
            videoHeight={videoHeight}
            videoFraming={videoFraming}
            videoTrim={{ start: draft.start, end: draft.end }}
            onDuration={(d) => setDuration((prev) => (prev === null ? d : prev))}
            className="max-w-sm"
          />

          {duration === null ? (
            <p className="text-xs text-zinc-500 dark:text-zinc-400">Reading video length…</p>
          ) : (
            <>
              <div>
                <div className="mb-1 flex items-center justify-between text-xs">
                  <label className="font-medium text-zinc-600 dark:text-zinc-300">Start</label>
                  <span className="tabular-nums text-zinc-500 dark:text-zinc-400">
                    {formatTimecode(draft.start)}
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={max}
                  step={STEP}
                  value={draft.start}
                  onChange={(e) => {
                    const next = Number(e.target.value);
                    setDraft((d) => ({
                      // Dragging start past end would invert the window; push
                      // end along instead of letting it go negative.
                      start: next,
                      end:
                        d.end !== null && next > d.end - MIN_TRIM_DURATION
                          ? Math.min(max, next + MIN_TRIM_DURATION)
                          : d.end,
                    }));
                  }}
                  className="w-full accent-green-600"
                />
              </div>

              <div>
                <div className="mb-1 flex items-center justify-between text-xs">
                  <label className="font-medium text-zinc-600 dark:text-zinc-300">End</label>
                  <span className="tabular-nums text-zinc-500 dark:text-zinc-400">
                    {draft.end === null ? formatTimecode(max) : formatTimecode(draft.end)}
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={max}
                  step={STEP}
                  value={draft.end ?? max}
                  onChange={(e) => {
                    const next = Number(e.target.value);
                    setDraft((d) => ({
                      start:
                        next < d.start + MIN_TRIM_DURATION
                          ? Math.max(0, next - MIN_TRIM_DURATION)
                          : d.start,
                      end: next,
                    }));
                  }}
                  className="w-full accent-green-600"
                />
              </div>

              <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                Clip length{' '}
                <span className="font-medium tabular-nums text-zinc-700 dark:text-zinc-200">
                  {clipLength === null ? formatTimecode(max) : formatTimecode(clipLength)}
                </span>{' '}
                of {formatTimecode(max)}. The original file is kept — trimming only changes
                where playback starts and loops.
              </p>
            </>
          )}

          {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || !canSave}
              className="flex items-center gap-1 rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
            >
              <Save className="h-3.5 w-3.5" />
              {saving ? 'Saving…' : 'Save trim'}
            </button>
            <button
              type="button"
              onClick={handleReset}
              disabled={saving}
              className="flex items-center gap-1 rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Full length
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
