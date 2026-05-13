import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/auth';
import { requireAdmin } from '@/lib/adminAuth';
import connectDB from '@/lib/mongodb';
import Exercise from '@/models/Exercise';
import { invalidateExerciseCache } from '@/lib/hydrateExercises';

interface RouteParams {
  params: Promise<{ slug: string }>;
}

// GET /api/exercises/[slug] — fetch single exercise (any authed user)
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const auth = await verifyAuth(request);
    if (!auth.success) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { slug } = await params;
    await connectDB();

    const exercise = await Exercise.findOne({ slug }).lean<{
      isCustom?: boolean
      createdBy?: string
    } & Record<string, unknown> | null>();
    if (!exercise) {
      return NextResponse.json({ error: 'Exercise not found' }, { status: 404 });
    }

    // Custom exercises are owner-private. Hide other users' customs (slugs are
    // partially guessable: custom-<userIdSuffix>-<name>-<ts>).
    if (exercise.isCustom && exercise.createdBy?.toString() !== auth.userId) {
      return NextResponse.json({ error: 'Exercise not found' }, { status: 404 });
    }

    return NextResponse.json({ exercise });
  } catch (error) {
    console.error('Error fetching exercise:', error);
    return NextResponse.json({ error: 'Failed to fetch exercise' }, { status: 500 });
  }
}

async function applyUpdate(request: NextRequest, slug: string) {
  await connectDB();
  const body = await request.json();

  // Prevent slug overwrite to a colliding value
  if (body.slug && body.slug !== slug) {
    const collision = await Exercise.findOne({ slug: body.slug });
    if (collision) {
      return NextResponse.json(
        { error: `Slug "${body.slug}" already in use` },
        { status: 409 }
      );
    }
  }

  // Whitelist updatable fields (all the meaningful Exercise fields)
  const allowed = [
    'name',
    'slug',
    'aliases',
    'description',
    'category',
    'mechanics',
    'role',
    'movementPatterns',
    'laterality',
    'difficulty',
    'primaryMuscles',
    'secondaryMuscles',
    'stabilizers',
    'equipment',
    'optionalEquipment',
    'trackingType',
    'cardioMetrics',
    'defaultSets',
    'defaultReps',
    'defaultRest',
    'defaultDuration',
    'defaultTempo',
    'instructions',
    'cues',
    'commonMistakes',
    'prerequisites',
    'variations',
    'alternatives',
    'videoUrl',
    'thumbnailUrl',
    'videoWidth',
    'videoHeight',
    // NB: framing edits go through PATCH /api/exercises/[slug]/framing (which
    // also mirrors to the ExerciseVideo row). We intentionally do NOT include
    // 'videoFraming' here — keeping the dedicated endpoint as the single
    // write path avoids a stale-overwrite bug where the form holds an older
    // copy and pushes it back on an unrelated save.
    'tags',
    'bodyRegion',
    'isActive',
  ] as const;

  const update: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in body) update[key] = body[key];
  }

  // Custom exercises are owner-managed via /api/exercises/custom — admins must
  // NOT mutate them through this admin endpoint.
  const exercise = await Exercise.findOneAndUpdate(
    { slug, isCustom: { $ne: true } },
    { $set: update },
    { new: true, runValidators: true }
  );

  if (!exercise) {
    return NextResponse.json({ error: 'Exercise not found' }, { status: 404 });
  }

  invalidateExerciseCache();
  return NextResponse.json({ exercise });
}

// PUT /api/exercises/[slug] — update exercise (admin only)
export async function PUT(request: NextRequest, { params }: RouteParams) {
  const gate = await requireAdmin(request);
  if (!gate.ok) return gate.response;

  try {
    const { slug } = await params;
    return await applyUpdate(request, slug);
  } catch (error) {
    console.error('Error updating exercise:', error);
    const message = error instanceof Error ? error.message : 'Failed to update exercise';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// PATCH /api/exercises/[slug] — partial update (admin only)
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const gate = await requireAdmin(request);
  if (!gate.ok) return gate.response;

  try {
    const { slug } = await params;
    return await applyUpdate(request, slug);
  } catch (error) {
    console.error('Error patching exercise:', error);
    const message = error instanceof Error ? error.message : 'Failed to update exercise';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// DELETE /api/exercises/[slug] — remove exercise (admin only)
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const gate = await requireAdmin(request);
  if (!gate.ok) return gate.response;

  try {
    const { slug } = await params;
    await connectDB();

    // Custom exercises are owner-managed via /api/exercises/custom.
    const result = await Exercise.findOneAndDelete({ slug, isCustom: { $ne: true } });
    if (!result) {
      return NextResponse.json({ error: 'Exercise not found' }, { status: 404 });
    }

    invalidateExerciseCache();
    return NextResponse.json({ message: 'Exercise deleted' });
  } catch (error) {
    console.error('Error deleting exercise:', error);
    return NextResponse.json({ error: 'Failed to delete exercise' }, { status: 500 });
  }
}
