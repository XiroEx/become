import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import ExerciseVideo from '@/models/ExerciseVideo';
import Exercise from '@/models/Exercise';
import { verifyAuth } from '@/lib/auth';
import { requireAdmin } from '@/lib/adminAuth';

// GET /api/exercise-videos
//   ?name=Bench Press   — return single video by exact-then-CI name (back-compat)
//   ?exercise=<slug>    — return all videos linked to an exercise (by slug or its name)
//   (default)           — list all videos
export async function GET(request: NextRequest) {
  try {
    await dbConnect();

    const { searchParams } = new URL(request.url);
    const exerciseName = searchParams.get('name');
    const exerciseSlug = searchParams.get('exercise');

    if (exerciseName) {
      // Try exact match first
      let video = await ExerciseVideo.findOne({ exerciseName });
      if (!video) {
        video = await ExerciseVideo.findOne({
          exerciseName: { $regex: new RegExp(`^${exerciseName}$`, 'i') },
        });
      }
      if (!video) {
        return NextResponse.json({ video: null }, { status: 200 });
      }
      return NextResponse.json({ video });
    }

    if (exerciseSlug) {
      // Look up the exercise to find its name (since videos key on exerciseName)
      const exercise = await Exercise.findOne({ slug: exerciseSlug })
        .select('name aliases')
        .lean<{ name: string; aliases?: string[] }>();
      if (!exercise) {
        return NextResponse.json({ videos: [] });
      }
      const candidates = [exercise.name, ...(exercise.aliases ?? [])];
      const videos = await ExerciseVideo.find({
        exerciseName: { $in: candidates.map((n) => new RegExp(`^${escapeRegex(n)}$`, 'i')) },
      })
        .sort({ exerciseName: 1 })
        .lean();
      return NextResponse.json({ videos });
    }

    const videos = await ExerciseVideo.find({}).sort({ exerciseName: 1 }).lean();
    return NextResponse.json({ videos });
  } catch (error) {
    console.error('Error fetching exercise videos:', error);
    return NextResponse.json({ error: 'Failed to fetch exercise videos' }, { status: 500 });
  }
}

// POST /api/exercise-videos — create or upsert (admin only)
export async function POST(request: NextRequest) {
  const gate = await requireAdmin(request);
  if (!gate.ok) {
    // Back-compat: if user is authed but not admin, also return 403 (was generic 401 before)
    const auth = await verifyAuth(request);
    if (auth.success) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    return gate.response;
  }

  try {
    await dbConnect();
    const body = await request.json();

    const { exerciseName, videoUrl, thumbnailUrl, isPlaceholder } = body;
    if (!exerciseName || !videoUrl) {
      return NextResponse.json(
        { error: 'exerciseName and videoUrl are required' },
        { status: 400 }
      );
    }

    const video = await ExerciseVideo.findOneAndUpdate(
      { exerciseName },
      {
        exerciseName,
        videoUrl,
        thumbnailUrl: thumbnailUrl ?? null,
        isPlaceholder: isPlaceholder ?? true,
      },
      { upsert: true, new: true }
    );

    return NextResponse.json({ video, created: true });
  } catch (error) {
    console.error('Error creating exercise video:', error);
    return NextResponse.json({ error: 'Failed to create exercise video' }, { status: 500 });
  }
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
