import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import ExerciseVideo from '@/models/ExerciseVideo';
import Exercise from '@/models/Exercise';
import { verifyAuth } from '@/lib/auth';
import { requireAdmin } from '@/lib/adminAuth';
import mongoose from 'mongoose';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET /api/exercise-videos/[id] — fetch by Mongo _id (any authed user)
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const auth = await verifyAuth(request);
    if (!auth.success) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
    }

    await dbConnect();
    const video = await ExerciseVideo.findById(id).lean();
    if (!video) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    return NextResponse.json({ video });
  } catch (error) {
    console.error('Error fetching exercise video:', error);
    return NextResponse.json({ error: 'Failed to fetch video' }, { status: 500 });
  }
}

// PUT /api/exercise-videos/[id] — update (admin only)
export async function PUT(request: NextRequest, { params }: RouteParams) {
  const gate = await requireAdmin(request);
  if (!gate.ok) return gate.response;

  try {
    const { id } = await params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
    }

    await dbConnect();
    const body = await request.json();

    const update: Record<string, unknown> = {};
    for (const key of ['exerciseName', 'videoUrl', 'thumbnailUrl', 'isPlaceholder', 'slug'] as const) {
      if (key in body) update[key] = body[key];
    }

    // If exerciseName is changing and slug wasn't explicitly set, try to
    // re-resolve the slug from the new exercise name so the canonical key
    // stays consistent with the displayed name.
    if ('exerciseName' in body && !('slug' in body)) {
      const exercise = await Exercise.findOne({
        $or: [{ name: body.exerciseName }, { aliases: body.exerciseName }],
      })
        .select('slug')
        .lean<{ slug: string } | null>();
      if (exercise?.slug) {
        update.slug = exercise.slug;
      }
    }

    const video = await ExerciseVideo.findByIdAndUpdate(
      id,
      { $set: update },
      { new: true, runValidators: true }
    );
    if (!video) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    return NextResponse.json({ video });
  } catch (error) {
    console.error('Error updating exercise video:', error);
    const message = error instanceof Error ? error.message : 'Failed to update video';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// DELETE /api/exercise-videos/[id] — remove (admin only)
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const gate = await requireAdmin(request);
  if (!gate.ok) return gate.response;

  try {
    const { id } = await params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json({ error: 'Invalid id' }, { status: 400 });
    }

    await dbConnect();
    const video = await ExerciseVideo.findByIdAndDelete(id);
    if (!video) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    return NextResponse.json({ message: 'Video deleted' });
  } catch (error) {
    console.error('Error deleting exercise video:', error);
    return NextResponse.json({ error: 'Failed to delete video' }, { status: 500 });
  }
}
