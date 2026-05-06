// ---------------------------------------------------------------------------
// Client-side image resize via canvas. Caps the long edge at `maxDim` and
// re-encodes as JPEG at the given quality. Keeps payloads to a few hundred KB
// so users don't blast 30MB iPhone photos to the server.
//
// Server-side sharp does its own pass for safety, but doing this client-side
// avoids huge multipart bodies on flaky mobile networks.
// ---------------------------------------------------------------------------

export interface ResizeOptions {
  maxDim?: number       // long-edge cap in pixels (default 1600)
  quality?: number      // JPEG quality 0..1 (default 0.82)
  mimeType?: string     // output mime (default image/jpeg)
}

export async function resizeImageToBlob(
  file: File | Blob,
  opts: ResizeOptions = {},
): Promise<Blob> {
  const maxDim = opts.maxDim ?? 1600
  const quality = opts.quality ?? 0.82
  const mimeType = opts.mimeType ?? 'image/jpeg'

  // Try modern createImageBitmap first — it auto-handles EXIF on most browsers.
  // Fall back to <img> + objectURL if not available (e.g. older Safari).
  let bitmap: ImageBitmap | HTMLImageElement
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  } catch {
    bitmap = await loadImageElement(file)
  }

  const srcW = (bitmap as ImageBitmap).width || (bitmap as HTMLImageElement).naturalWidth
  const srcH = (bitmap as ImageBitmap).height || (bitmap as HTMLImageElement).naturalHeight

  let dstW = srcW
  let dstH = srcH
  if (Math.max(srcW, srcH) > maxDim) {
    if (srcW >= srcH) {
      dstW = maxDim
      dstH = Math.round((srcH / srcW) * maxDim)
    } else {
      dstH = maxDim
      dstW = Math.round((srcW / srcH) * maxDim)
    }
  }

  const canvas = document.createElement('canvas')
  canvas.width = dstW
  canvas.height = dstH
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D context unavailable')
  // High-quality smoothing for downsample
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(bitmap as CanvasImageSource, 0, 0, dstW, dstH)

  const blob: Blob = await new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('canvas.toBlob returned null'))),
      mimeType,
      quality,
    )
  })

  // Free ImageBitmap GPU resources where supported.
  if ('close' in bitmap && typeof (bitmap as ImageBitmap).close === 'function') {
    (bitmap as ImageBitmap).close()
  }

  return blob
}

function loadImageElement(file: File | Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Failed to decode image'))
    }
    img.src = url
  })
}
