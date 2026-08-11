// POST /api/nutrition/flags/image — upload a photo of a nutrition panel to blob
// storage (MinIO) and return its same-origin URL, to be attached to a food
// report. Mirrors the plate-scan upload.
//
// This photo is the strongest evidence the pipeline can get: the reporter is
// holding the actual package, which beats any database. It is still only a
// CLAIM until its product identity is checked against the record — a panel
// photo has no inherent link to the food it was attached to, and a mis-attached
// one carries perfectly self-consistent numbers that no arithmetic check can
// catch. See `matchesRecord` in lib/nutrition/evidence.ts.
import { NextRequest, NextResponse } from 'next/server'
import { verifyAuth } from '@/lib/auth'
import { getBlobStore } from '@/lib/blobStorage'

const ALLOWED: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
}
const MAX_BYTES = 5 * 1024 * 1024 // 5MB — the client downscales to ~1024px first

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
    // Keyed by user so an abusive uploader is attributable and prunable.
    const key = `food-flags/${auth.userId}/${rand}${ext}`

    await getBlobStore().put({ key, body: buf, contentType: file.type })

    // Same-origin via the blob proxy — never expose the MinIO host.
    return NextResponse.json({ imageUrl: `/api/blob/${key}` })
  } catch (err) {
    console.error('POST /api/nutrition/flags/image error:', err)
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 })
  }
}
