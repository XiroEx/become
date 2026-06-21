// POST /api/nutrition/scans/image — upload a (full-res) plate-scan photo to blob
// storage (MinIO) and return its same-origin URL. Called best-effort from the
// snap/describe flow before saving the scan, so the history can show the real
// photo instead of just the tiny inline thumbnail. Mirrors the avatar upload.
import { NextRequest, NextResponse } from 'next/server'
import { verifyAuth } from '@/lib/auth'
import { getBlobStore } from '@/lib/blobStorage'

const ALLOWED: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
}
const MAX_BYTES = 5 * 1024 * 1024 // 5MB — the client already downscales to ~1024px

export async function POST(request: NextRequest) {
  try {
    const auth = await verifyAuth(request)
    if (!auth.success || !auth.userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const form = await request.formData()
    const file = form.get('file')
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }
    const ext = ALLOWED[file.type]
    if (!ext) {
      return NextResponse.json({ error: 'Unsupported image type' }, { status: 415 })
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: 'Image too large (max 5MB)' }, { status: 413 })
    }

    const buf = Buffer.from(await file.arrayBuffer())
    const rand = Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
    const key = `scans/${auth.userId}/${rand}${ext}`

    await getBlobStore().put({ key, body: buf, contentType: file.type })

    // Serve same-origin via the blob proxy (no MinIO host exposure).
    return NextResponse.json({ imageUrl: `/api/blob/${key}` })
  } catch (err) {
    console.error('POST /api/nutrition/scans/image error:', err)
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 })
  }
}
