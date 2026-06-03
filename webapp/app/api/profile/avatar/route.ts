// POST /api/profile/avatar — upload a custom profile picture.
// Accepts multipart/form-data with a `file` image, stores it in the blob store,
// sets the user's avatarUrl (served same-origin via /api/blob/<key>) and equips
// it (profileIcon = 'custom'). Returns { avatarUrl }.

import { NextRequest, NextResponse } from 'next/server'
import { verifyAuth } from '@/lib/auth'
import dbConnect from '@/lib/mongodb'
import User from '@/models/User'
import { getBlobStore } from '@/lib/blobStorage'

const ALLOWED: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
}
const MAX_BYTES = 5 * 1024 * 1024 // 5MB

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
    const key = `avatars/${auth.userId}/${rand}${ext}`

    const store = getBlobStore()
    await store.put({ key, body: buf, contentType: file.type })

    // Serve same-origin through the blob proxy (no MinIO host exposure; works
    // with next/image as a local path).
    const avatarUrl = `/api/blob/${key}`

    await dbConnect()
    await User.findByIdAndUpdate(auth.userId, { $set: { avatarUrl, profileIcon: 'custom' } })

    return NextResponse.json({ avatarUrl })
  } catch (err) {
    console.error('POST /api/profile/avatar error:', err)
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 })
  }
}
