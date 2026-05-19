import { NextRequest, NextResponse } from 'next/server'
import sharp from 'sharp'
import dbConnect from '@/lib/mongodb'
import ProgramModel from '@/models/Program'
import ProgramImage from '@/models/ProgramImage'
import { verifyAuth } from '@/lib/auth'

const MAX_RAW_BYTES = 25 * 1024 * 1024

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ programId: string }> }
) {
  try {
    await dbConnect()
    const { programId } = await params

    const img = await ProgramImage.findOne({ programId }).lean<{
      contentType: string
      data: Buffer
    } | null>()

    if (!img) {
      return NextResponse.json({ error: 'Image not found' }, { status: 404 })
    }

    return new NextResponse(new Uint8Array(img.data), {
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

    const program = await ProgramModel.findOne({ program_id: programId })
    if (!program) {
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

    const processed = await sharp(raw)
      .rotate()
      .resize(1600, 900, { fit: 'cover', withoutEnlargement: true })
      .jpeg({ quality: 85, mozjpeg: true })
      .toBuffer()

    await ProgramImage.findOneAndUpdate(
      { programId },
      { programId, contentType: 'image/jpeg', data: processed },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    )

    program.coverImage = `/api/programs/${programId}/image?v=${Date.now()}`
    await program.save()

    return NextResponse.json({ success: true, coverImage: program.coverImage })
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

    const program = await ProgramModel.findOne({ program_id: programId })
    if (!program) {
      return NextResponse.json({ error: 'Program not found' }, { status: 404 })
    }

    await ProgramImage.deleteOne({ programId })
    program.coverImage = undefined
    await program.save()

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting program image:', error)
    return NextResponse.json({ error: 'Failed to delete image' }, { status: 500 })
  }
}
