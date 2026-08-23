import { NextRequest, NextResponse } from "next/server";
import { verifyAuth } from "@/lib/auth";
import { requireFeature } from "@/lib/entitlements";
import connectDB from "@/lib/mongodb";
import Exercise, { IExerciseDefinition } from "@/models/Exercise";
import { buildCustomExerciseTags } from "@/lib/customExerciseTags";
import {
  isValidCustomTrackingType,
  resolveCustomExerciseMuscleData,
  resolveCustomExerciseCategory,
} from "@/lib/customExerciseFields";
import { getBlobStore } from "@/lib/blobStorage";
import { invalidateExerciseCache } from "@/lib/hydrateExercises";

type LeanExercise = Pick<IExerciseDefinition,
  "slug" | "name" | "trackingType" | "primaryMuscles" | "bodyRegion" | "category" |
  "defaultSets" | "defaultReps" | "defaultDuration" | "equipment" | "role" | "difficulty" |
  "tags" | "videoUrl" | "thumbnailUrl" | "videoWidth" | "videoHeight" | "videoFraming" |
  "videoTrim"
>;

// ─── GET /api/exercises/custom ────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const auth = await verifyAuth(req);
  if (!auth?.userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await connectDB();

  // Media fields are returned so a custom exercise's own demo renders
  // everywhere a catalog one does — the library card, the swap modal, the
  // workout view. Without them a user could upload a video and never see it.
  const exercises = await Exercise.find(
    { isCustom: true, createdBy: auth.userId },
    { slug: 1, name: 1, trackingType: 1, primaryMuscles: 1, bodyRegion: 1, category: 1,
      defaultSets: 1, defaultReps: 1, defaultDuration: 1, equipment: 1, role: 1, difficulty: 1,
      tags: 1, videoUrl: 1, thumbnailUrl: 1, videoWidth: 1, videoHeight: 1, videoFraming: 1,
      videoTrim: 1 }
  ).lean<LeanExercise[]>();

  return NextResponse.json({ exercises });
}

// ─── POST /api/exercises/custom ───────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const gate = await requireFeature(req, "custom-exercises");
  if (!gate.ok) return gate.response;
  const auth = { userId: gate.userId };

  const body = await req.json();
  const { name, trackingType, muscleGroup, category, defaultSets, defaultReps } = body;

  if (!name?.trim()) return NextResponse.json({ error: "Name is required" }, { status: 400 });

  if (!isValidCustomTrackingType(trackingType)) {
    return NextResponse.json({ error: "Invalid tracking type" }, { status: 400 });
  }

  const muscleData = resolveCustomExerciseMuscleData(muscleGroup);
  const resolvedCategory = resolveCustomExerciseCategory(category);

  await connectDB();

  const namePart = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const userPart = auth.userId.toString().slice(-6);
  const slug = `custom-${userPart}-${namePart}-${Date.now()}`;

  const exercise = new Exercise({
    slug,
    name: name.trim(),
    aliases: [],
    description: "",
    category: resolvedCategory,
    mechanics: "n/a",
    role: "accessory",
    movementPatterns: ["n/a"],
    laterality: "bilateral",
    difficulty: "intermediate",
    primaryMuscles: muscleData.primaryMuscles,
    secondaryMuscles: [],
    stabilizers: [],
    equipment: ["none"],
    optionalEquipment: [],
    trackingType,
    instructions: [],
    cues: [],
    commonMistakes: [],
    prerequisites: [],
    variations: [],
    alternatives: [],
    tags: buildCustomExerciseTags({
      category,
      muscleGroup,
      trackingType,
      equipment: ["none"],
      extra: Array.isArray(body.tags) ? body.tags : undefined,
    }),
    bodyRegion: muscleData.bodyRegion,
    isActive: true,
    isCustom: true,
    createdBy: auth.userId.toString(),
    ...(defaultSets && { defaultSets: parseInt(defaultSets) }),
    ...(defaultReps && { defaultReps: String(defaultReps) }),
  });
  await exercise.save();

  // hydrateExercises caches every exercise by slug; without this the new
  // exercise resolves to its raw slug in any program that references it until
  // the next cold start.
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
      // Always null on create — echoed so callers can hold one shape for a
      // custom exercise whether it came from POST or GET.
      videoUrl: exercise.videoUrl ?? null,
      thumbnailUrl: exercise.thumbnailUrl ?? null,
    },
  });
}

// ─── DELETE /api/exercises/custom?slug=xxx ────────────────────────────────────

export async function DELETE(req: NextRequest) {
  const gate = await requireFeature(req, "custom-exercises");
  if (!gate.ok) return gate.response;
  const auth = { userId: gate.userId };

  const { searchParams } = new URL(req.url);
  const slug = searchParams.get("slug");
  if (!slug) return NextResponse.json({ error: "slug required" }, { status: 400 });

  await connectDB();

  // Read first so we know which blob to reap — deleteOne gives us nothing back,
  // and without this every custom exercise that had a video leaves its bytes in
  // the bucket with no remaining reference to them.
  const doomed = await Exercise.findOneAndDelete({
    slug,
    isCustom: true,
    createdBy: auth.userId.toString(),
  });
  if (!doomed) {
    return NextResponse.json({ error: "Not found or not yours" }, { status: 404 });
  }

  if (doomed.videoStorageKey) {
    // Non-fatal: the exercise is already gone, and failing the request here
    // would tell the user the delete didn't work when it did.
    try {
      await getBlobStore().delete(doomed.videoStorageKey);
    } catch (err) {
      console.warn("Failed to delete custom exercise blob (continuing):", err);
    }
  }

  invalidateExerciseCache();
  return NextResponse.json({ ok: true });
}
