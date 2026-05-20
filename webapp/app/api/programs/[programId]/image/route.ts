import { NextRequest, NextResponse } from 'next/server'
import sharp from 'sharp'
import dbConnect from '@/lib/mongodb'
import ProgramModel from '@/models/Program'
import ProgramImage from '@/models/ProgramImage'
import { verifyAuth } from '@/lib/auth'

const MAX_RAW_BYTES = 25 * 1024 * 1024

// Read a Mongoose Buffer field reliably whether the driver returns a Node
// Buffer or a MongoDB Binary object. `new Uint8Array(binary)` silently
// produces an empty array, which is what broke this endpoint in production.
function toBytes(data: unknown): Uint8Array | null {
  if (!data) return null
  if (Buffer.isBuffer(data)) return new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
  // MongoDB Binary type — has a .buffer (Node Buffer) property
  const maybeBinary = data as { buffer?: Buffer; _bsontype?: string }
  if (maybeBinary.buffer && Buffer.isBuffer(maybeBinary.buffer)) {
    const b = maybeBinary.buffer
    return new Uint8Array(b.buffer, b.byteOffset, b.byteLength)
  }
  if (data instanceof Uint8Array) return data
  return null
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ programId: string }> }
) {
  try {
    await dbConnect()
    const { programId } = await params

    const img = await ProgramImage.findOne({ programId }).lean<{
      contentType: string
      data: unknown
    } | null>()

    if (!img) {
      return NextResponse.json({ error: 'Image not found' }, { status: 404 })
    }

    const bytes = toBytes(img.data)
    if (!bytes || bytes.byteLength === 0) {
      return NextResponse.json({ error: 'Image not found' }, { status: 404 })
    }

    return new NextResponse(bytes as unknown as BodyInit, {
      status: 200,
      headers: {
        'Content-Type': img.contentType || 'image/jpeg',
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    })
  } catch (error) {
    console.error('Error fetching program image:', error)
    return NextResponse.json({ error: 'Failed to fetch image' }, { status: 500 })
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ programId: string }> }
) {
  try {
    const authResult = await verifyAuth(request)
    if (!authResult.success) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (authResult.role !== 'admin') {
      return NextResponse.json({ error: 'Admin only' }, { status: 403 })
    }

    await dbConnect()
    const { programId } = await params

    // Use exists() instead of fetching the full document — we don't need to
    // load (and later re-validate) every phase/workout/exercise just to write
    // one field. Many legacy programs have exercises missing the required
    // exerciseSlug, which would make `program.save()` reject the whole upload.
    const programExists = await ProgramModel.exists({ program_id: programId })
    if (!programExists) {
      return NextResponse.json({ error: 'Program not found' }, { status: 404 })
    }

    const contentType = request.headers.get('content-type') || ''
    let raw: Buffer | null = null

    if (contentType.startsWith('multipart/form-data')) {
      const form = await request.formData()
      const file = form.get('image')
      if (!file || typeof file === 'string') {
        return NextResponse.json({ error: 'No image file provided' }, { status: 400 })
      }
      const ab = await (file as File).arrayBuffer()
      if (ab.byteLength > MAX_RAW_BYTES) {
        return NextResponse.json({ error: 'Image too large' }, { status: 413 })
      }
      raw = Buffer.from(ab)
    } else if (contentType.startsWith('image/')) {
      const ab = await request.arrayBuffer()
      if (ab.byteLength > MAX_RAW_BYTES) {
        return NextResponse.json({ error: 'Image too large' }, { status: 413 })
      }
      raw = Buffer.from(ab)
    } else {
      return NextResponse.json({ error: 'Unsupported content type' }, { status: 415 })
    }

    if (!raw || raw.length === 0) {
      return NextResponse.json({ error: 'Empty image' }, { status: 400 })
    }

    let processed: Buffer
    try {
      processed = await sharp(raw)
        .rotate()
        .resize(1600, 900, { fit: 'cover', withoutEnlargement: true })
        .jpeg({ quality: 85, mozjpeg: true })
        .toBuffer()
    } catch (err) {
      return NextResponse.json({
        error: `Could not decode image. Try a JPG or PNG. (${err instanceof Error ? err.message : 'unknown'})`,
      }, { status: 415 })
    }

    if (!processed || processed.length === 0) {
      return NextResponse.json({ error: 'Image processing produced empty output' }, { status: 500 })
    }

    await ProgramImage.findOneAndUpdate(
      { programId },
      { programId, contentType: 'image/jpeg', data: processed },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    )

    const coverImage = `/api/programs/${programId}/image?v=${Date.now()}`
    // updateOne bypasses full-document validation — only the coverImage
    // field is written. Required-field validators on phases/workouts/
    // exercises do not fire here.
    await ProgramModel.updateOne(
      { program_id: programId },
      { $set: { coverImage } },
    )

    return NextResponse.json({ success: true, coverImage })
  } catch (error) {
    console.error('Error uploading program image:', error)
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Failed to upload image',
    }, { status: 500 })
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ programId: string }> }
) {
  try {
    const authResult = await verifyAuth(request)
    if (!authResult.success) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    if (authResult.role !== 'admin') {
      return NextResponse.json({ error: 'Admin only' }, { status: 403 })
    }

    await dbConnect()
    const { programId } = await params

    const programExists = await ProgramModel.exists({ program_id: programId })
    if (!programExists) {
      return NextResponse.json({ error: 'Program not found' }, { status: 404 })
    }

    await ProgramImage.deleteOne({ programId })
    // Same rationale as POST — use $unset to avoid re-validating the
    // entire program document just to clear a single field.
    await ProgramModel.updateOne(
      { program_id: programId },
      { $unset: { coverImage: '' } },
    )

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting program image:', error)
    return NextResponse.json({ error: 'Failed to delete image' }, { status: 500 })
  }
}
