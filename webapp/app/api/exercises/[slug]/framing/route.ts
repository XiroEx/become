// ---------------------------------------------------------------------------
// PATCH /api/exercises/[slug]/framing — admin-only fine-tune of per-video
// framing overrides (fit / positionX / positionY / zoom).
//
// Body shape:
//   {
//     fit?: 'contain' | 'cover',
//     positionX?: number,  // 0–100
//     positionY?: number,  // 0–100
//     zoom?: number,       // 50–400
//   }
//
// Any field that is `null` (explicit) is REMOVED from the override doc —
// "reset this one field to auto". A completely empty body wipes the whole
// override subdoc (equivalent to "Reset to auto" in the editor UI).
//
// Mirrors writes to both Exercise.videoFraming and the matching ExerciseVideo
// row's `framing` field so reads from either side agree.
// ---------------------------------------------------------------------------

import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/adminAuth'
import connectDB from '@/lib/mongodb'
import Exercise from '@/models/Exercise'
import ExerciseVideo from '@/models/ExerciseVideo'
import { invalidateExerciseCache } from '@/lib/hydrateExercises'

interface RouteParams {
  params: Promise<{ slug: string }>
}

interface FramingBody {
  fit?: 'contain' | 'cover' | null
  positionX?: number | null
  positionY?: number | null
  zoom?: number | null
}

const VALID_FIT = new Set(['contain', 'cover'])

function clean(body: FramingBody): { framing: Record<string, unknown>; touched: boolean } {
  const out: Record<string, unknown> = {}
  let touched = false

  if ('fit' in body) {
    touched = true
    if (body.fit === null) {
      // omit (reset this field)
    } else if (typeof body.fit === 'string' && VALID_FIT.has(body.fit)) {
      out.fit = body.fit
    } else {
      throw new Error('fit must be "contain", "cover", or null')
    }
  }
  if ('positionX' in body) {
    touched = true
    if (body.positionX === null) {
      // omit
    } else if (Number.isFinite(body.positionX) && (body.positionX as number) >= 0 && (body.positionX as number) <= 100) {
      out.positionX = Math.round(body.positionX as number)
    } else {
      throw new Error('positionX must be between 0 and 100, or null')
    }
  }
  if ('positionY' in body) {
    touched = true
    if (body.positionY === null) {
      // omit
    } else if (Number.isFinite(body.positionY) && (body.positionY as number) >= 0 && (body.positionY as number) <= 100) {
      out.positionY = Math.round(body.positionY as number)
    } else {
      throw new Error('positionY must be between 0 and 100, or null')
    }
  }
  if ('zoom' in body) {
    touched = true
    if (body.zoom === null) {
      // omit
    } else if (Number.isFinite(body.zoom) && (body.zoom as number) >= 50 && (body.zoom as number) <= 400) {
      out.zoom = Math.round(body.zoom as number)
    } else {
      throw new Error('zoom must be between 50 and 400, or null')
    }
  }

  return { framing: out, touched }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const gate = await requireAdmin(request)
  if (!gate.ok) return gate.response

  const { slug } = await params

  let body: FramingBody = {}
  try {
    body = (await request.json()) as FramingBody
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  let cleaned: ReturnType<typeof clean>
  try {
    cleaned = clean(body)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Invalid body'
    return NextResponse.json({ error: msg }, { status: 400 })
  }

  try {
    await connectDB()
    // Admin-mutable exercises only (mirror /api/exercises/[slug]/video).
    const exercise = await Exercise.findOne({ slug, isCustom: { $ne: true } })
    if (!exercise) {
      return NextResponse.json({ error: 'Exercise not found' }, { status: 404 })
    }

    // Empty body = explicit "reset everything to auto". Wipe the subdoc.
    const isEmpty = Object.keys(cleaned.framing).length === 0
    if (isEmpty) {
      exercise.videoFraming = undefined
    } else {
      exercise.videoFraming = cleaned.framing as typeof exercise.videoFraming
    }
    await exercise.save()

    // Mirror to ExerciseVideo row. We rewrite the whole subdoc rather than
    // merging because the per-field reset semantics are already collapsed
    // into `cleaned.framing` above.
    await ExerciseVideo.findOneAndUpdate(
      { slug },
      isEmpty
        ? { $unset: { framing: '' } }
        : { $set: { framing: cleaned.framing } }
    )

    invalidateExerciseCache()
    return NextResponse.json({
      ok: true,
      videoFraming: isEmpty ? null : cleaned.framing,
    })
  } catch (error) {
    console.error('Framing PATCH failed:', error)
    const message = error instanceof Error ? error.message : 'Failed to save framing'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
