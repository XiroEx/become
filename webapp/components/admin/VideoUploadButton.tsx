"use client";

/**
 * VideoUploadButton — "pick a video off this device and make it the primary".
 *
 * Used by the admin exercise form and by a user's own custom exercises. The
 * upload endpoint differs between the two (admin catalog vs. owner-scoped
 * custom), so the caller passes `uploadUrl` / `deleteUrl` rather than us
 * branching on a scope flag.
 *
 * On `accept`: it is `video/*`, deliberately. iOS Safari only offers the
 * "Photo Library" entry in its file-picker sheet when the accept list is a
 * wildcard video type — with an explicit list like
 * `video/mp4,video/quicktime` it tends to fall back to "Browse" only, which
 * is why picking a clip straight from the camera roll didn't work. Server-side
 * validation still enforces the real allow-list, so widening the picker costs
 * nothing. `capture` is intentionally NOT set: it would force the camera and
 * remove the library option entirely.
 */

import { useRef, useState } from 'react';
import { Trash2, Upload } from 'lucide-react';

export interface VideoUploadButtonProps {
  /** POST target for the multipart upload. Field name is `video`. */
  uploadUrl: string;
  /** DELETE target that removes the video + its blob. Omit to hide Remove. */
  deleteUrl?: string;
  /** True when a video is currently attached — controls the Remove button. */
  hasVideo?: boolean;
  /** Called with the new public URL after a successful upload. */
  onUploaded?: (result: { videoUrl: string }) => void;
  /** Called after a successful delete. */
  onRemoved?: () => void;
  /** Disable both actions (e.g. the exercise has not been saved yet). */
  disabled?: boolean;
  /** Shown under the buttons when disabled, to explain why. */
  disabledHint?: string;
  label?: string;
}

export default function VideoUploadButton({
  uploadUrl,
  deleteUrl,
  hasVideo,
  onUploaded,
  onRemoved,
  disabled,
  disabledHint,
  label = 'Upload from device',
}: VideoUploadButtonProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function authHeader(): string | null {
    if (typeof window === 'undefined') return null;
    const token = localStorage.getItem('token');
    return token ? `Bearer ${token}` : null;
  }

  async function handleFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // Reset immediately so picking the same file twice still fires onChange.
    event.target.value = '';
    if (!file) return;

    setUploading(true);
    setProgress(0);
    setError(null);
    try {
      const form = new FormData();
      form.append('video', file);

      // XHR rather than fetch: we want an upload progress bar, and fetch still
      // has no request-side progress event. A 60MB clip over a phone
      // connection with no feedback reads as a hang.
      const result = await new Promise<{ ok: boolean; status: number; body: string }>(
        (resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open('POST', uploadUrl);
          const auth = authHeader();
          if (auth) xhr.setRequestHeader('Authorization', auth);
          xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) setProgress(Math.round((e.loaded / e.total) * 100));
          };
          xhr.onload = () =>
            resolve({
              ok: xhr.status >= 200 && xhr.status < 300,
              status: xhr.status,
              body: xhr.responseText,
            });
          xhr.onerror = () => reject(new Error('Network error during upload'));
          xhr.send(form);
        }
      );

      if (!result.ok) {
        let msg = `Upload failed (${result.status})`;
        try {
          const parsed = JSON.parse(result.body) as { error?: string };
          if (parsed.error) msg = parsed.error;
        } catch {
          /* non-JSON error body — keep the status message */
        }
        throw new Error(msg);
      }

      const parsed = JSON.parse(result.body) as { videoUrl?: string };
      if (parsed.videoUrl) onUploaded?.({ videoUrl: parsed.videoUrl });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
      setProgress(null);
    }
  }

  async function handleRemove() {
    if (!deleteUrl) return;
    if (!confirm('Remove this video? The file is deleted from storage.')) return;
    setRemoving(true);
    setError(null);
    try {
      const auth = authHeader();
      const res = await fetch(deleteUrl, {
        method: 'DELETE',
        headers: auth ? { Authorization: auth } : undefined,
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error ?? 'Failed to remove video');
      }
      onRemoved?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove video');
    } finally {
      setRemoving(false);
    }
  }

  const busy = uploading || removing;

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept="video/*"
        onChange={handleFile}
        className="hidden"
      />
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy || disabled}
          className="flex items-center gap-1.5 rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
        >
          <Upload className="h-3.5 w-3.5" />
          {uploading ? `Uploading… ${progress ?? 0}%` : label}
        </button>
        {deleteUrl && hasVideo && (
          <button
            type="button"
            onClick={handleRemove}
            disabled={busy || disabled}
            className="flex items-center gap-1.5 rounded-lg border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-red-50 hover:text-red-600 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-red-950/30 dark:hover:text-red-400"
          >
            <Trash2 className="h-3.5 w-3.5" />
            {removing ? 'Removing…' : 'Remove video'}
          </button>
        )}
        {uploading && progress !== null && (
          <div className="h-1.5 min-w-24 flex-1 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
            <div
              className="h-full bg-emerald-500 transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
        )}
      </div>
      <p className="mt-1.5 text-[11px] text-zinc-500 dark:text-zinc-400">
        Pick a clip from your photo library, files, or camera. MP4 / MOV / WebM, up to 100 MB.
      </p>
      {disabled && disabledHint && (
        <p className="mt-1 text-[11px] text-amber-600 dark:text-amber-400">{disabledHint}</p>
      )}
      {error && <p className="mt-1.5 text-xs text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}
