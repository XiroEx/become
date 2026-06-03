'use client'

// Crop / zoom / reposition a chosen image into a square avatar before upload.
// Round crop preview, pinch/drag to position, slider to zoom. On save, renders
// the selected crop to a fixed 512×512 JPEG (so the upload is always a small,
// normalized image — which also sidesteps HEIC / oversized phone photos).

import { useCallback, useState } from 'react'
import Cropper, { type Area } from 'react-easy-crop'
import { X, Check, Loader2, ZoomIn } from 'lucide-react'

const OUT_SIZE = 512

async function cropToBlob(src: string, area: Area): Promise<Blob> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image()
    i.crossOrigin = 'anonymous'
    i.onload = () => resolve(i)
    i.onerror = reject
    i.src = src
  })
  const canvas = document.createElement('canvas')
  canvas.width = OUT_SIZE
  canvas.height = OUT_SIZE
  const ctx = canvas.getContext('2d')!
  ctx.drawImage(img, area.x, area.y, area.width, area.height, 0, 0, OUT_SIZE, OUT_SIZE)
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('crop failed'))), 'image/jpeg', 0.9),
  )
}

export default function AvatarCropModal({
  src,
  saving = false,
  onCancel,
  onSave,
}: {
  src: string
  saving?: boolean
  onCancel: () => void
  onSave: (blob: Blob) => void
}) {
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [areaPixels, setAreaPixels] = useState<Area | null>(null)
  const [working, setWorking] = useState(false)

  const onComplete = useCallback((_: Area, pixels: Area) => setAreaPixels(pixels), [])

  async function save() {
    if (!areaPixels || working || saving) return
    setWorking(true)
    try {
      const blob = await cropToBlob(src, areaPixels)
      onSave(blob)
    } catch {
      setWorking(false)
    }
  }

  const busy = working || saving

  return (
    <div className="fixed inset-0 z-[120] flex flex-col bg-black/90" style={{ paddingTop: 'env(safe-area-inset-top,0px)', paddingBottom: 'env(safe-area-inset-bottom,0px)' }}>
      <div className="flex items-center justify-between px-4 py-3">
        <button onClick={onCancel} disabled={busy} className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white disabled:opacity-50">
          <X className="h-5 w-5" />
        </button>
        <span className="text-sm font-semibold text-white">Position &amp; zoom</span>
        <button onClick={save} disabled={busy || !areaPixels} className="flex items-center gap-1.5 rounded-full bg-white px-4 py-1.5 text-sm font-bold text-black disabled:opacity-50">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" strokeWidth={3} />}
          Save
        </button>
      </div>

      <div className="relative flex-1">
        <Cropper
          image={src}
          crop={crop}
          zoom={zoom}
          aspect={1}
          cropShape="round"
          showGrid={false}
          onCropChange={setCrop}
          onZoomChange={setZoom}
          onCropComplete={onComplete}
        />
      </div>

      <div className="flex items-center gap-3 px-6 py-5">
        <ZoomIn className="h-5 w-5 shrink-0 text-white/60" />
        <input
          type="range"
          min={1}
          max={3}
          step={0.01}
          value={zoom}
          onChange={(e) => setZoom(Number(e.target.value))}
          className="h-1 w-full cursor-pointer appearance-none rounded-full bg-white/25 accent-white"
          aria-label="Zoom"
        />
      </div>
    </div>
  )
}
