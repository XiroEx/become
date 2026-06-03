// POST /api/chat/upload — upload an image or GIF for a chat message.
// Stores it in the blob store and returns a same-origin URL (/api/blob/<key>)
// to attach to a message. Auth required. The actual message is created
// separately via the messages route with { imageUrl }.

import { NextRequest, NextResponse } from 'next/server'
import { verifyAuth } from '@/lib/auth'
import { getBlobStore } from '@/lib/blobStorage'

const ALLOWED: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
}
const MAX_BYTES = 12 * 1024 * 1024 // 12MB — generous enough for GIFs

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
      return NextResponse.json({ error: 'Image too large (max 12MB)' }, { status: 413 })
    }

    const buf = Buffer.from(await file.arrayBuffer())
    const rand = Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
    const key = `chat/${auth.userId}/${rand}${ext}`

    await getBlobStore().put({ key, body: buf, contentType: file.type })
    return NextResponse.json({ imageUrl: `/api/blob/${key}` })
  } catch (err) {
    console.error('POST /api/chat/upload error:', err)
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 })
  }
}
