import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import ExerciseVideo from '@/models/ExerciseVideo';
import { verifyAuth } from '@/lib/auth';

// GET /api/exercise-videos - Get all exercise videos
// GET /api/exercise-videos?name=Bench%20Press - Get video for specific exercise
export async function GET(request: NextRequest) {
  try {
    await dbConnect();

    const { searchParams } = new URL(request.url);
    const exerciseName = searchParams.get('name');

    if (exerciseName) {
      // Try exact match first
      let video = await ExerciseVideo.findOne({ exerciseName });
      
      // Try case-insensitive match
      if (!video) {
        video = await ExerciseVideo.findOne({ 
          exerciseName: { $regex: new RegExp(`^${exerciseName}$`, 'i') } 
        });
      }

      if (!video) {
        return NextResponse.json({ video: null }, { status: 200 });
      }

      return NextResponse.json({ video });
    }

    // Return all videos
    const videos = await ExerciseVideo.find({}).sort({ exerciseName: 1 });
    return NextResponse.json({ 
      videos: videos.map(v => ({
        exerciseName: v.exerciseName,
        videoUrl: v.videoUrl,
        thumbnailUrl: v.thumbnailUrl || null,
        isPlaceholder: v.isPlaceholder || false,
      }))
    });
  } catch (error) {
    console.error('Error fetching exercise videos:', error);
    return NextResponse.json(
      { error: 'Failed to fetch exercise videos' },
      { status: 500 }
    );
  }
}

// POST /api/exercise-videos - Create or update exercise video (requires auth)
export async function POST(request: NextRequest) {
  try {
    const authResult = await verifyAuth(request);
    if (!authResult.success) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

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
        thumbnailUrl: thumbnailUrl || null,
        isPlaceholder: isPlaceholder ?? true 
      },
      { upsert: true, new: true }
    );

    return NextResponse.json({ video, created: true });
  } catch (error) {
    console.error('Error creating exercise video:', error);
    return NextResponse.json(
      { error: 'Failed to create exercise video' },
      { status: 500 }
    );
  }
}
