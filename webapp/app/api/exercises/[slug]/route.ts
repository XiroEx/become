import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/auth';
import { requireAdmin } from '@/lib/adminAuth';
import connectDB from '@/lib/mongodb';
import Exercise from '@/models/Exercise';
import ExerciseVideo from '@/models/ExerciseVideo';
import { invalidateExerciseCache } from '@/lib/hydrateExercises';

interface RouteParams {
  params: Promise<{ slug: string }>;
}

/** A URL field counts as "set" only when it has non-whitespace content. */
function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.trim().length > 0;
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
  const unset: Record<string, ''> = {};
  for (const key of allowed) {
    if (key in body) update[key] = body[key];
  }

  // Clearing the Video URL field has to actually clear the video. Previously
  // the form sent `undefined` for an emptied input, `JSON.stringify` dropped
  // the key, and this loop never saw it — so the save reported success while
  // the old URL stayed on the document. The form now sends an explicit `null`;
  // treat null/'' as "remove the primary video" and take the dependent media
  // fields with it, since dimensions, framing and trim all describe a file
  // that is no longer attached.
  const clearingVideo = 'videoUrl' in update && !isNonEmptyString(update.videoUrl);
  if (clearingVideo) {
    update.videoUrl = null;
    update.videoWidth = null;
    update.videoHeight = null;
    unset.videoFraming = '';
    unset.videoTrim = '';
    // `videoStorageKey` is deliberately kept. The bytes stay in the bucket so
    // this is undoable by pasting the URL back, and the next upload still
    // knows which object to reap. Use DELETE /api/exercises/[slug]/video for
    // the hard delete that also drops the blob.
  }
  if ('thumbnailUrl' in update && !isNonEmptyString(update.thumbnailUrl)) {
    update.thumbnailUrl = null;
  }

  // Custom exercises are owner-managed via /api/exercises/custom — admins must
  // NOT mutate them through this admin endpoint.
  const exercise = await Exercise.findOneAndUpdate(
    { slug, isCustom: { $ne: true } },
    Object.keys(unset).length ? { $set: update, $unset: unset } : { $set: update },
    { new: true, runValidators: true }
  );

  if (!exercise) {
    return NextResponse.json({ error: 'Exercise not found' }, { status: 404 });
  }

  // Retire the linked ExerciseVideo row too. Without this the name-keyed
  // fallback in `lib/data/exerciseVideos.ts` resurrects the video the admin
  // just removed, which reads as "it didn't save".
  //
  // `retired` rather than a delete: plenty of exercises got their video from a
  // seed script that only ever wrote the ExerciseVideo row and never
  // denormalized onto the Exercise, so a null `Exercise.videoUrl` cannot by
  // itself mean "no video". The explicit status is what separates "never had a
  // primary" (keep falling back) from "an admin took this one off" (don't).
  // The row stays visible + restorable in the Linked ExerciseVideos list.
  if (clearingVideo) {
    await ExerciseVideo.updateMany(
      { $or: [{ slug }, { slug: { $exists: false }, exerciseName: exercise.name }] },
      { $set: { status: 'retired' }, $unset: { framing: '', trim: '' } }
    );
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
