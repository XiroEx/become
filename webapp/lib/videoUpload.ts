/**
 * Shared validation for exercise-video uploads.
 *
 * Both the admin catalog route (`/api/exercises/[slug]/video`) and the
 * owner-scoped custom route (`/api/exercises/custom/[slug]/video`) run the same
 * checks, so they live here rather than being copy-pasted and drifting.
 */

export const MAX_VIDEO_BYTES = 100 * 1024 * 1024 // 100 MB — generous for short demos

/**
 * The types we will actually store. The browser file picker is intentionally
 * wider (`accept="video/*"`, so iOS offers the Photo Library at all) — this is
 * the real gate.
 */
const ALLOWED_MIMES = new Set([
  'video/mp4',
  'video/quicktime',
  'video/webm',
  'video/x-matroska',
  // iOS hands back .m4v under this type often enough to be worth accepting;
  // it is an MP4 container either way.
  'video/x-m4v',
])

/**
 * Extension → MIME, used when the browser gives us nothing usable. Picking a
 * clip from the iOS Photo Library can yield an empty `file.type`, and Android
 * pickers sometimes report `application/octet-stream`. Both used to fall
 * through to a 415 that read like the file was corrupt.
 */
const EXT_TO_MIME: Record<string, string> = {
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  mov: 'video/quicktime',
  qt: 'video/quicktime',
  webm: 'video/webm',
  mkv: 'video/x-matroska',
}

const UNINFORMATIVE_TYPES = new Set(['', 'application/octet-stream', 'binary/octet-stream'])

/**
 * Best-effort MIME for an uploaded file: trust the browser when it says
 * something meaningful, otherwise fall back to the filename extension.
 * Returns `null` when we cannot place it in the allow-list.
 */
export function resolveVideoMime(fileType: string | undefined, fileName: string | undefined): string | null {
  const declared = (fileType ?? '').toLowerCase().trim()
  if (declared && !UNINFORMATIVE_TYPES.has(declared)) {
    return ALLOWED_MIMES.has(declared) ? normalize(declared) : null
  }
  const ext = (fileName ?? '').toLowerCase().split('.').pop() ?? ''
  const sniffed = EXT_TO_MIME[ext]
  return sniffed ?? null
}

/** `video/x-m4v` is stored as plain MP4 — one fewer type downstream. */
function normalize(mime: string): string {
  return mime === 'video/x-m4v' ? 'video/mp4' : mime
}

export interface VideoValidationFailure {
  error: string
  status: 400 | 413 | 415
}

/**
 * Validate a picked file. Returns the resolved MIME on success, or the error +
 * HTTP status the route should return.
 */
export function validateVideoFile(file: File): { mimeType: string } | VideoValidationFailure {
  if (file.size === 0) {
    return { error: 'That file is empty — try picking the video again.', status: 400 }
  }
  if (file.size > MAX_VIDEO_BYTES) {
    const mb = Math.round(MAX_VIDEO_BYTES / (1024 * 1024))
    return { error: `That video is too large (max ${mb} MB).`, status: 413 }
  }
  const mimeType = resolveVideoMime(file.type, file.name)
  if (!mimeType) {
    return {
      error: `Unsupported video type${file.type ? `: ${file.type}` : ''}. Use MP4, MOV or WebM.`,
      status: 415,
    }
  }
  return { mimeType }
}

export function isValidationFailure(
  result: { mimeType: string } | VideoValidationFailure
): result is VideoValidationFailure {
  return 'error' in result
}
