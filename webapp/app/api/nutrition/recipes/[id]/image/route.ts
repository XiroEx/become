import { NextRequest, NextResponse } from 'next/server'
import sharp from 'sharp'
import dbConnect from '@/lib/mongodb'
import Recipe from '@/models/Recipe'
import RecipeImage from '@/models/RecipeImage'
import { verifyAuth } from '@/lib/auth'

const MAX_RAW_BYTES = 25 * 1024 * 1024

// Mongoose `.lean()` on a Buffer field can return a MongoDB Binary object
// rather than a Node Buffer; `new Uint8Array(binary)` silently yields an
// empty array. Defensive unwrap matches meals + programs image routes.
function toBytes(data: unknown): Uint8Array | null {
  if (!data) return null
  if (Buffer.isBuffer(data)) return new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
  const maybeBinary = data as { buffer?: Buffer; _bsontype?: string }
  if (maybeBinary.buffer && Buffer.isBuffer(maybeBinary.buffer)) {
    const b = maybeBinary.buffer
    return new Uint8Array(b.buffer, b.byteOffset, b.byteLength)
  }
  if (data instanceof Uint8Array) return data
  return null
}

// GET — public read. Recipes can be public/private but the image proxy is
// gated by the URL only embedding existing recipeIds, same pattern as meals.
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await dbConnect()
    const { id } = await params

    const img = await RecipeImage.findOne({ recipeId: id }).lean<{
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
    console.error('Error fetching recipe image:', error)
    return NextResponse.json({ error: 'Failed to fetch image' }, { status: 500 })
  }
}

// POST — owner or admin only. Accepts multipart (image field) or raw image/* body.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const authResult = await verifyAuth(request)
    if (!authResult.success) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    await dbConnect()
    const { id } = await params

    const recipe = await Recipe.findById(id)
    if (!recipe) {
      return NextResponse.json({ error: 'Recipe not found' }, { status: 404 })
    }

    const isOwner = recipe.createdBy?.toString() === authResult.userId
    const isAdmin = authResult.role === 'admin'
    if (!isOwner && !isAdmin) {
      return NextResponse.json({ error: 'Not authorized to update this recipe' }, { status: 403 })
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
        .resize(1200, 1200, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 80, mozjpeg: true })
        .toBuffer()
    } catch (err) {
      return NextResponse.json({
        error: `Could not decode image. Try a JPG or PNG. (${err instanceof Error ? err.message : 'unknown'})`,
      }, { status: 415 })
    }

    if (!processed || processed.length === 0) {
      return NextResponse.json({ error: 'Image processing produced empty output' }, { status: 500 })
    }

    await RecipeImage.findOneAndUpdate(
      { recipeId: recipe._id },
      { recipeId: recipe._id, contentType: 'image/jpeg', data: processed },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    )

    recipe.imageUrl = `/api/nutrition/recipes/${recipe._id}/image?v=${Date.now()}`
    await recipe.save()

    return NextResponse.json({ success: true, imageUrl: recipe.imageUrl })
  } catch (error) {
    console.error('Error uploading recipe image:', error)
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Failed to upload image',
    }, { status: 500 })
  }
}

// DELETE — owner or admin only.
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const authResult = await verifyAuth(request)
    if (!authResult.success) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    await dbConnect()
    const { id } = await params

    const recipe = await Recipe.findById(id)
    if (!recipe) {
      return NextResponse.json({ error: 'Recipe not found' }, { status: 404 })
    }

    const isOwner = recipe.createdBy?.toString() === authResult.userId
    const isAdmin = authResult.role === 'admin'
    if (!isOwner && !isAdmin) {
      return NextResponse.json({ error: 'Not authorized to update this recipe' }, { status: 403 })
    }

    await RecipeImage.deleteOne({ recipeId: recipe._id })
    recipe.imageUrl = undefined
    await recipe.save()

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting recipe image:', error)
    return NextResponse.json({ error: 'Failed to delete image' }, { status: 500 })
  }
}
