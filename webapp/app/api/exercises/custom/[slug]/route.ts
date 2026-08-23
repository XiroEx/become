// ---------------------------------------------------------------------------
// PATCH /api/exercises/custom/[slug] — edit a custom exercise you own.
//
// Same field set and validation as POST /api/exercises/custom (name,
// trackingType, muscleGroup, category, defaultSets, defaultReps) via
// lib/customExerciseFields, so create and edit can never drift into
// accepting different shapes. Tags are rebuilt from the new
// category/muscleGroup/trackingType — a custom exercise that used to be a
// "reps_weight" chest lift and gets edited to "time_distance" cardio must not
// keep carrying its old tags.
// ---------------------------------------------------------------------------

import { NextRequest, NextResponse } from "next/server";
import { requireFeature } from "@/lib/entitlements";
import connectDB from "@/lib/mongodb";
import Exercise from "@/models/Exercise";
import { buildCustomExerciseTags } from "@/lib/customExerciseTags";
import {
  isValidCustomTrackingType,
  resolveCustomExerciseMuscleData,
  resolveCustomExerciseCategory,
} from "@/lib/customExerciseFields";
import { invalidateExerciseCache } from "@/lib/hydrateExercises";

interface RouteParams {
  params: Promise<{ slug: string }>;
}

export async function PATCH(req: NextRequest, { params }: RouteParams) {
  const gate = await requireFeature(req, "custom-exercises");
  if (!gate.ok) return gate.response;

  const { slug } = await params;
  const body = await req.json();
  const { name, trackingType, muscleGroup, category, defaultSets, defaultReps } = body;

  if (!name?.trim()) return NextResponse.json({ error: "Name is required" }, { status: 400 });

  if (!isValidCustomTrackingType(trackingType)) {
    return NextResponse.json({ error: "Invalid tracking type" }, { status: 400 });
  }

  const muscleData = resolveCustomExerciseMuscleData(muscleGroup);
  const resolvedCategory = resolveCustomExerciseCategory(category);

  await connectDB();

  const exercise = await Exercise.findOne({
    slug,
    isCustom: true,
    createdBy: gate.userId.toString(),
  });
  if (!exercise) {
    return NextResponse.json({ error: "Not found or not yours" }, { status: 404 });
  }

  exercise.name = name.trim();
  exercise.trackingType = trackingType;
  exercise.category = resolvedCategory;
  exercise.primaryMuscles = muscleData.primaryMuscles;
  exercise.bodyRegion = muscleData.bodyRegion;
  exercise.defaultSets = defaultSets ? parseInt(defaultSets) : undefined;
  exercise.defaultReps = defaultReps ? String(defaultReps) : undefined;
  exercise.tags = buildCustomExerciseTags({
    category,
    muscleGroup,
    trackingType,
    equipment: exercise.equipment,
  });
  await exercise.save();

  invalidateExerciseCache();

  return NextResponse.json({
    exercise: {
      slug: exercise.slug,
      name: exercise.name,
      trackingType: exercise.trackingType,
      primaryMuscles: exercise.primaryMuscles,
      bodyRegion: exercise.bodyRegion,
      category: exercise.category,
      equipment: exercise.equipment,
      role: exercise.role,
      difficulty: exercise.difficulty,
      defaultSets: exercise.defaultSets,
      defaultReps: exercise.defaultReps,
      tags: exercise.tags,
      videoUrl: exercise.videoUrl ?? null,
      thumbnailUrl: exercise.thumbnailUrl ?? null,
    },
  });
}
