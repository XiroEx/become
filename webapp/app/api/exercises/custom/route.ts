import { NextRequest, NextResponse } from "next/server";
import { verifyAuth } from "@/lib/auth";
import { requireFeature } from "@/lib/entitlements";
import { requireQuota } from "@/lib/entitlementGuards";
import connectDB from "@/lib/mongodb";
import Exercise, { IExerciseDefinition } from "@/models/Exercise";
import { buildCustomExerciseTags } from "@/lib/customExerciseTags";
import {
  isValidCustomTrackingType,
  resolveCustomExerciseMuscles,
  resolveCustomExerciseCategory,
  resolveCustomExerciseRole,
  resolveCustomDifficulty,
  resolveCustomEquipment,
  resolveCustomLaterality,
  resolveCustomMechanics,
  resolveCustomMovementPatterns,
  resolveCustomMuscleList,
} from "@/lib/customExerciseFields";
import { getBlobStore } from "@/lib/blobStorage";
import { invalidateExerciseCache } from "@/lib/hydrateExercises";

type LeanExercise = Pick<IExerciseDefinition,
  "slug" | "name" | "trackingType" | "primaryMuscles" | "bodyRegion" | "category" |
  "secondaryMuscles" | "stabilizers" | "mechanics" | "movementPatterns" | "laterality" |
  "defaultSets" | "defaultReps" | "defaultDuration" | "equipment" | "role" | "difficulty" |
  "tags" | "videoUrl" | "thumbnailUrl" | "videoWidth" | "videoHeight" | "videoFraming" |
  "videoTrim" | "createdAt" | "isUniversal" | "reviewStatus" | "submittedAt" | "reviewNote"
>;

// ─── GET /api/exercises/custom ────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const auth = await verifyAuth(req);
  if (!auth?.userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await connectDB();

  // Media fields are returned so a custom exercise's own demo renders
  // everywhere a catalog one does — the library card, the swap modal, the
  // workout view. Without them a user could upload a video and never see it.
  // createdAt/isUniversal/reviewStatus/submittedAt/reviewNote drive the
  // library's sort/filter tabs and its "Submit to Universal" status.
  const exercises = await Exercise.find(
    { isCustom: true, createdBy: auth.userId },
    { slug: 1, name: 1, trackingType: 1, primaryMuscles: 1, secondaryMuscles: 1,
      stabilizers: 1, mechanics: 1, movementPatterns: 1, laterality: 1, bodyRegion: 1, category: 1,
      defaultSets: 1, defaultReps: 1, defaultDuration: 1, equipment: 1, role: 1, difficulty: 1,
      tags: 1, videoUrl: 1, thumbnailUrl: 1, videoWidth: 1, videoHeight: 1, videoFraming: 1,
      videoTrim: 1, createdAt: 1, isUniversal: 1, reviewStatus: 1, submittedAt: 1, reviewNote: 1 }
  ).lean<LeanExercise[]>();

  return NextResponse.json({ exercises });
}

// ─── POST /api/exercises/custom ───────────────────────────────────────────────

// CREATE is quota-gated (free tier: 3 owned custom exercises, counted live).
// Every other verb on a custom exercise — PATCH, DELETE, submit, video, trim —
// stays on requireFeature so a member sitting at 3/3 can still fix, re-record
// and delete what they already have. Capping edits would lock them out of
// their own data with no way back under the cap.
export async function POST(req: NextRequest) {
  const gate = await requireQuota(req, "custom-exercises");
  if (!gate.ok) return gate.response;
  const auth = { userId: gate.userId };

  const body = await req.json();
  const {
    name, trackingType, muscleGroup, category, role, defaultSets, defaultReps,
    primaryMuscles: exactPrimaryMuscles, secondaryMuscles, stabilizers, equipment,
    mechanics, movementPatterns, laterality, difficulty,
  } = body;

  if (!name?.trim()) return NextResponse.json({ error: "Name is required" }, { status: 400 });

  if (!isValidCustomTrackingType(trackingType)) {
    return NextResponse.json({ error: "Invalid tracking type" }, { status: 400 });
  }

  const muscleData = resolveCustomExerciseMuscles(exactPrimaryMuscles, muscleGroup);
  const resolvedSecondaryMuscles = resolveCustomMuscleList(secondaryMuscles);
  const resolvedStabilizers = resolveCustomMuscleList(stabilizers);
  const resolvedEquipment = resolveCustomEquipment(equipment);
  const resolvedMechanics = resolveCustomMechanics(mechanics);
  const resolvedMovementPatterns = resolveCustomMovementPatterns(movementPatterns);
  const resolvedLaterality = resolveCustomLaterality(laterality);
  const resolvedDifficulty = resolveCustomDifficulty(difficulty);
  const resolvedCategory = resolveCustomExerciseCategory(category);
  const resolvedRole = resolveCustomExerciseRole(role);

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
    mechanics: resolvedMechanics,
    role: resolvedRole,
    movementPatterns: resolvedMovementPatterns,
    laterality: resolvedLaterality,
    difficulty: resolvedDifficulty,
    primaryMuscles: muscleData.primaryMuscles,
    secondaryMuscles: resolvedSecondaryMuscles,
    stabilizers: resolvedStabilizers,
    equipment: resolvedEquipment,
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
      equipment: resolvedEquipment,
      extra: [
        ...muscleData.primaryMuscles,
        ...resolvedMovementPatterns.filter((pattern) => pattern !== "n/a"),
        ...(Array.isArray(body.tags) ? body.tags.filter((tag: unknown): tag is string => typeof tag === "string") : []),
      ],
    }),
    bodyRegion: muscleData.bodyRegion,
    isActive: true,
    isCustom: true,
    createdBy: auth.userId.toString(),
    isUniversal: false,
    reviewStatus: "none",
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
      secondaryMuscles: exercise.secondaryMuscles,
      stabilizers: exercise.stabilizers,
      bodyRegion: exercise.bodyRegion,
      category: exercise.category,
      equipment: exercise.equipment,
      mechanics: exercise.mechanics,
      movementPatterns: exercise.movementPatterns,
      laterality: exercise.laterality,
      role: exercise.role,
      difficulty: exercise.difficulty,
      defaultSets: exercise.defaultSets,
      defaultReps: exercise.defaultReps,
      tags: exercise.tags,
      // Always null on create — echoed so callers can hold one shape for a
      // custom exercise whether it came from POST or GET.
      videoUrl: exercise.videoUrl ?? null,
      thumbnailUrl: exercise.thumbnailUrl ?? null,
      createdAt: exercise.createdAt,
      isUniversal: exercise.isUniversal ?? false,
      reviewStatus: exercise.reviewStatus ?? "none",
      submittedAt: exercise.submittedAt ?? null,
      reviewNote: exercise.reviewNote ?? null,
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
