import { NextRequest, NextResponse } from 'next/server'
import sharp from 'sharp'
import dbConnect from '@/lib/mongodb'
import Meal from '@/models/Meal'
import MealImage from '@/models/MealImage'
import { verifyAuth } from '@/lib/auth'

const MAX_RAW_BYTES = 25 * 1024 * 1024 // 25MB hard cap on incoming payload

// ---------------------------------------------------------------------------
// GET /api/meals/[id]/image
// Returns the meal's stored image bytes. Public — meals can be public/verified.
// Cache aggressively: the URL embeds an updatedAt cache-busting `v` param, so
// any image change forces a new URL, making `immutable` safe.
// ---------------------------------------------------------------------------
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await dbConnect()
    const { id } = await params

    const img = await MealImage.findOne({ mealId: id }).lean<{
      contentType: string
      data: unknown
    } | null>()

    if (!img) {
      return NextResponse.json({ error: 'Image not found' }, { status: 404 })
    }

    // Mongoose `.lean()` on a Buffer field can return a MongoDB Binary object
    // rather than a Node Buffer; `new Uint8Array(binary)` silently yields an
    // empty array. Unwrap defensively.
    let bytes: Uint8Array | null = null
    if (Buffer.isBuffer(img.data)) {
      bytes = new Uint8Array(img.data.buffer, img.data.byteOffset, img.data.byteLength)
    } else if (img.data instanceof Uint8Array) {
      bytes = img.data
    } else {
      const b = (img.data as { buffer?: Buffer })?.buffer
      if (b && Buffer.isBuffer(b)) {
        bytes = new Uint8Array(b.buffer, b.byteOffset, b.byteLength)
      }
    }
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
    console.error('Error fetching meal image:', error)
    return NextResponse.json({ error: 'Failed to fetch image' }, { status: 500 })
  }
}

// ---------------------------------------------------------------------------
// POST /api/meals/[id]/image
//
// Accepts:
//   - `multipart/form-data` with field `image` (preferred from <input type=file>)
//   - raw `image/*` body (e.g. fetch with body=blob)
//
// Server-side downsamples via sharp to max 1200×1200 JPEG quality 80, then
// upserts into MealImage and updates Meal.imageUrl with a cache-busted URL.
//
// Owner or admin only.
// ---------------------------------------------------------------------------
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await verifyAuth(request)
    if (!authResult.success) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    await dbConnect()

    const { id } = await params
    const meal = await Meal.findById(id)
    if (!meal) {
      return NextResponse.json({ error: 'Meal not found' }, { status: 404 })
    }

    const isOwner = meal.createdBy?.toString() === authResult.userId
    const isAdmin = authResult.role === 'admin'
    if (!isOwner && !isAdmin) {
      return NextResponse.json({ error: 'Not authorized to update this meal' }, { status: 403 })
    }

    // Resolve raw image bytes from either multipart form or raw body.
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

    // Resize + recompress. rotate() respects EXIF so iPhone shots aren't sideways.
    const processed = await sharp(raw)
      .rotate()
      .resize(1200, 1200, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 80, mozjpeg: true })
      .toBuffer()

    // Upsert (one image per meal — replace on re-upload).
    await MealImage.findOneAndUpdate(
      { mealId: meal._id },
      { mealId: meal._id, contentType: 'image/jpeg', data: processed },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    )

    // Touch meal so updatedAt advances; build cache-busted imageUrl.
    meal.imageUrl = `/api/meals/${meal._id}/image?v=${Date.now()}`
    await meal.save()

    return NextResponse.json({
      success: true,
      imageUrl: meal.imageUrl,
    })
  } catch (error) {
    console.error('Error uploading meal image:', error)
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Failed to upload image',
    }, { status: 500 })
  }
}

// ---------------------------------------------------------------------------
// DELETE /api/meals/[id]/image
// Removes the stored image and clears Meal.imageUrl. Owner or admin only.
// ---------------------------------------------------------------------------
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await verifyAuth(request)
    if (!authResult.success) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    await dbConnect()

    const { id } = await params
    const meal = await Meal.findById(id)
    if (!meal) {
      return NextResponse.json({ error: 'Meal not found' }, { status: 404 })
    }

    const isOwner = meal.createdBy?.toString() === authResult.userId
    const isAdmin = authResult.role === 'admin'
    if (!isOwner && !isAdmin) {
      return NextResponse.json({ error: 'Not authorized to update this meal' }, { status: 403 })
    }

    await MealImage.deleteOne({ mealId: meal._id })
    meal.imageUrl = undefined
    await meal.save()

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting meal image:', error)
    return NextResponse.json({ error: 'Failed to delete image' }, { status: 500 })
  }
}
