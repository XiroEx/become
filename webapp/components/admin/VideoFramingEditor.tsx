"use client";

/**
 * VideoFramingEditor — admin-only "fine-tune" panel for a single video.
 *
 * Lives next to AdminVideoPreview in the exercise admin form. Default state
 * is "auto" — clicking "Fine-tune framing" opens the panel; switching to
 * Manual reveals sliders for fit/positionX/positionY/zoom; saving PATCHes
 * /api/exercises/[slug]/framing.
 *
 * The whole point: most videos should never need this. When you DO need it
 * (a portrait video where the action sits near the top, say), you can dial
 * it in and the change propagates to form + live + preview because all three
 * share `resolveFraming` + `<FramedVideo />`.
 */

import { useEffect, useState } from 'react';
import { ChevronDown, ChevronUp, RotateCcw, Save } from 'lucide-react';
import FramedVideo from '@/components/FramedVideo';
import {
  resolveFraming,
  type VideoFramingOverride,
  type VideoSurface,
} from '@/lib/videoFraming';

export interface VideoFramingEditorProps {
  /** Exercise slug used for the PATCH URL. */
  slug: string;
  /** Current video URL (direct file). */
  videoUrl: string;
  /** Persisted intrinsic dims from the DB, if any. */
  videoWidth?: number | null;
  videoHeight?: number | null;
  /** Persisted framing override, if any. */
  videoFraming?: VideoFramingOverride | null;
  /**
   * The surface to preview against. Defaults to 'form' (matches the admin
   * card surroundings); admin can flip to 'live' to see the full-screen
   * crop applied.
   */
  defaultSurface?: VideoSurface;
  /** Fired after a successful save with the new framing payload. */
  onSaved?: (next: VideoFramingOverride | null) => void;
  /** Fired whenever the auto-captured dims change (forwarded from FramedVideo). */
  onDimensions?: (w: number, h: number) => void;
}

type Mode = 'auto' | 'manual';

export default function VideoFramingEditor({
  slug,
  videoUrl,
  videoWidth,
  videoHeight,
  videoFraming,
  defaultSurface = 'form',
  onSaved,
  onDimensions,
}: VideoFramingEditorProps) {
  const [open, setOpen] = useState(false);
  const [surface, setSurface] = useState<VideoSurface>(defaultSurface);

  // Mode is derived from initial framing: any override field → manual.
  const initialMode: Mode = videoFraming && Object.values(videoFraming).some((v) => v != null) ? 'manual' : 'auto';
  const [mode, setMode] = useState<Mode>(initialMode);

  // Live preview state — separate from saved state so admin can scrub sliders
  // without firing network requests. Seeded from saved framing OR from the
  // computed auto defaults so the sliders start at meaningful positions when
  // flipping from Auto → Manual.
  const computedAuto = resolveFraming({ videoWidth, videoHeight, videoFraming: null }, surface);
  // Local draft has concrete non-null values for every field; we only persist
  // a subset back to the server. (The store can mark fields as "auto" by
  // omitting them; the UI keeps them populated so sliders always have a
  // value.)
  interface FramingDraft {
    fit: 'contain' | 'cover';
    positionX: number;
    positionY: number;
    zoom: number;
  }
  const [draft, setDraft] = useState<FramingDraft>({
    fit: (videoFraming?.fit as 'contain' | 'cover' | undefined) ?? computedAuto.fit,
    positionX: videoFraming?.positionX ?? computedAuto.positionX,
    positionY: videoFraming?.positionY ?? computedAuto.positionY,
    zoom: videoFraming?.zoom ?? computedAuto.zoom,
  });

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // If videoWidth/Height arrive after mount (auto-detect just persisted), make
  // sure Auto-mode draft tracks the new computed defaults.
  useEffect(() => {
    if (mode !== 'auto') return;
    const a = resolveFraming({ videoWidth, videoHeight, videoFraming: null }, surface);
    setDraft({ fit: a.fit, positionX: a.positionX, positionY: a.positionY, zoom: a.zoom });
  }, [videoWidth, videoHeight, surface, mode]);

  const resolved = resolveFraming(
    {
      videoWidth,
      videoHeight,
      videoFraming: mode === 'manual' ? draft : null,
    },
    surface
  );

  async function patchFraming(payload: Record<string, unknown> | null) {
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
    const res = await fetch(`/api/exercises/${encodeURIComponent(slug)}/framing`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(payload ?? {}),
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      throw new Error(data.error ?? 'Failed to save framing');
    }
    return (await res.json()) as { videoFraming: VideoFramingOverride | null };
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      const data = await patchFraming({
        fit: draft.fit,
        positionX: draft.positionX,
        positionY: draft.positionY,
        zoom: draft.zoom,
      });
      onSaved?.(data.videoFraming);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save framing');
    } finally {
      setSaving(false);
    }
  }

  async function handleResetToAuto() {
    setSaving(true);
    setError(null);
    try {
      const data = await patchFraming(null);
      setMode('auto');
      const a = resolveFraming({ videoWidth, videoHeight, videoFraming: null }, surface);
      setDraft({ fit: a.fit, positionX: a.positionX, positionY: a.positionY, zoom: a.zoom });
      onSaved?.(data.videoFraming);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reset framing');
    } finally {
      setSaving(false);
    }
  }

  if (!videoUrl) return null;

  return (
    <div className="mt-2 rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-xs font-medium text-zinc-700 hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-zinc-800"
      >
        <span className="flex items-center gap-2">
          Fine-tune framing
          <span
            className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ${
              resolved.isAuto
                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                : 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
            }`}
          >
            {resolved.isAuto ? 'Auto' : 'Manual'}
          </span>
          <span className="text-[10px] text-zinc-500 dark:text-zinc-400">
            {videoWidth && videoHeight
              ? `${videoWidth}×${videoHeight} · ${resolved.detectedOrientation}`
              : 'dims pending'}
          </span>
        </span>
        {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>

      {open && (
        <div className="border-t border-zinc-200 p-3 dark:border-zinc-800">
          {/* Live preview */}
          <div className="mb-3">
            <FramedVideo
              src={videoUrl}
              surface={surface}
              videoWidth={videoWidth}
              videoHeight={videoHeight}
              videoFraming={mode === 'manual' ? draft : null}
              onDimensions={onDimensions}
            />
          </div>

          {/* Surface preview switcher */}
          <div className="mb-3 flex items-center gap-1.5 text-[11px]">
            <span className="text-zinc-500 dark:text-zinc-400">Preview as</span>
            {(['form', 'live', 'preview'] as VideoSurface[]).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSurface(s)}
                className={`rounded-full px-2 py-0.5 ${
                  surface === s
                    ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                    : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700'
                }`}
              >
                {s}
              </button>
            ))}
          </div>

          {/* Mode toggle */}
          <div className="mb-3 flex items-center gap-2 text-xs">
            <label className="inline-flex items-center gap-1.5">
              <input
                type="radio"
                checked={mode === 'auto'}
                onChange={() => setMode('auto')}
              />
              Auto
            </label>
            <label className="inline-flex items-center gap-1.5">
              <input
                type="radio"
                checked={mode === 'manual'}
                onChange={() => setMode('manual')}
              />
              Manual
            </label>
          </div>

          {/* Controls (manual only) */}
          {mode === 'manual' && (
            <div className="grid grid-cols-1 gap-3 text-xs sm:grid-cols-2">
              <Field label="Fit">
                <select
                  value={draft.fit}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, fit: e.target.value as 'contain' | 'cover' }))
                  }
                  className={selectCls}
                >
                  <option value="contain">Contain (letterbox)</option>
                  <option value="cover">Cover (crop to fill)</option>
                </select>
              </Field>

              <Field label={`Zoom — ${draft.zoom}%`}>
                <input
                  type="range"
                  min={100}
                  max={300}
                  step={5}
                  value={draft.zoom}
                  onChange={(e) => setDraft((d) => ({ ...d, zoom: Number(e.target.value) }))}
                  className={rangeCls}
                />
              </Field>

              <Field label={`Position X — ${draft.positionX}%`}>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  value={draft.positionX}
                  onChange={(e) => setDraft((d) => ({ ...d, positionX: Number(e.target.value) }))}
                  className={rangeCls}
                />
              </Field>

              <Field label={`Position Y — ${draft.positionY}%`}>
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  value={draft.positionY}
                  onChange={(e) => setDraft((d) => ({ ...d, positionY: Number(e.target.value) }))}
                  className={rangeCls}
                />
              </Field>
            </div>
          )}

          {error && (
            <p className="mt-2 text-xs text-red-600 dark:text-red-400">{error}</p>
          )}

          <div className="mt-3 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={handleResetToAuto}
              disabled={saving}
              className="flex items-center gap-1 rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Reset to auto
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || mode === 'auto'}
              className="flex items-center gap-1 rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
            >
              <Save className="h-3.5 w-3.5" />
              {saving ? 'Saving…' : 'Save framing'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const selectCls =
  'w-full rounded-lg border border-zinc-300 bg-white px-2.5 py-1.5 text-xs text-zinc-900 focus:border-zinc-500 focus:outline-none focus:ring-1 focus:ring-zinc-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-white';

const rangeCls =
  'h-2 w-full cursor-pointer appearance-none rounded-full bg-zinc-200 accent-zinc-900 dark:bg-zinc-700 dark:accent-zinc-100';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-[11px] font-medium text-zinc-600 dark:text-zinc-400">
        {label}
      </label>
      {children}
    </div>
  );
}
