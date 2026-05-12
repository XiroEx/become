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
      // Prefer the canonical `slug` key (populated by the upload route +
      // migration). Fall back to name/alias matching for unmigrated rows.
      const slugMatch = await ExerciseVideo.findOne({ slug: exerciseSlug }).lean();
      if (slugMatch) {
        return NextResponse.json({ videos: [slugMatch] });
      }

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

    // Resolve slug from the exercise so new rows are written with the
    // canonical key. Best-effort: a video for an unknown exercise name
    // still gets created (slug stays null) for backward compatibility
    // with manual seeding.
    const exercise = await Exercise.findOne({
      $or: [{ name: exerciseName }, { aliases: exerciseName }],
    })
      .select('slug')
      .lean<{ slug: string } | null>();
    const slug = exercise?.slug ?? null;

    // Upsert keyed on slug when we have it (canonical), else fall back to
    // name (legacy behavior) so this endpoint stays usable for un-linked
    // seed data.
    const filter = slug ? { slug } : { exerciseName, slug: null };
    const video = await ExerciseVideo.findOneAndUpdate(
      filter,
      {
        slug,
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
