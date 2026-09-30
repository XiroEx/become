import { NextRequest, NextResponse } from "next/server";
import { verifyAuth } from "@/lib/auth";
import connectDB from "@/lib/mongodb";
import { hydrateWorkout } from "@/lib/hydrateExercises";
import type { VideoFramingOverride } from "@/lib/videoFraming";
import type { VideoTrimOverride } from "@/lib/videoTrim";

// POST /api/exercises/hydrate
// Body: { exercises: Array<{ exerciseSlug?: string; name?: string }> }
// Returns: { exercises: Array<{ videoUrl?, thumbnailUrl?, videoWidth?, videoHeight?, videoFraming?, videoTrim? }> }
//   — one entry per input exercise, same order, video fields only.
//
// A program gets these fields denormalized server-side via hydrateWorkout()
// before the client ever sees it (see /api/programs/current-workout). A
// quick/custom session has no program to hydrate through, so
// lib/quickSession/hydrateVideos.ts calls this once per session load to
// resolve the same slug → video mapping.

const MAX_EXERCISES = 60;

interface HydrateRequestExercise {
  exerciseSlug?: string;
  name?: string;
}

interface HydratableStub {
  exerciseSlug?: string;
  name?: string;
  videoUrl?: string;
  thumbnailUrl?: string;
  videoWidth?: number;
  videoHeight?: number;
  videoFraming?: VideoFramingOverride;
  videoTrim?: VideoTrimOverride;
}

export async function POST(req: NextRequest) {
  const auth = await verifyAuth(req);
  if (!auth.success) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { exercises?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const input = Array.isArray(body.exercises)
    ? (body.exercises as HydrateRequestExercise[]).slice(0, MAX_EXERCISES)
    : [];
  if (input.length === 0) return NextResponse.json({ exercises: [] });

  await connectDB();
  const hydrated = await hydrateWorkout<{ exercises: HydratableStub[] }>({
    exercises: input.map((e) => ({
      exerciseSlug: typeof e.exerciseSlug === "string" ? e.exerciseSlug : undefined,
      name: typeof e.name === "string" ? e.name : undefined,
    })),
  });

  const exercises = hydrated.exercises.map((ex) => ({
    videoUrl: ex.videoUrl,
    thumbnailUrl: ex.thumbnailUrl,
    videoWidth: ex.videoWidth,
    videoHeight: ex.videoHeight,
    videoFraming: ex.videoFraming,
    videoTrim: ex.videoTrim,
  }));

  return NextResponse.json({ exercises });
}
