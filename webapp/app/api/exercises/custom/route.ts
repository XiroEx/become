import { NextRequest, NextResponse } from "next/server";
import { verifyAuth } from "@/lib/auth";
import connectDB from "@/lib/mongodb";
import Exercise, { IExerciseDefinition } from "@/models/Exercise";

// ─── Muscle group → Exercise model fields ─────────────────────────────────────

const MUSCLE_MAP: Record<string, { primaryMuscles: string[]; bodyRegion: string }> = {
  chest:      { primaryMuscles: ["chest"],                          bodyRegion: "upper_body" },
  back:       { primaryMuscles: ["lats", "upper_back"],             bodyRegion: "upper_body" },
  shoulders:  { primaryMuscles: ["front_delts", "side_delts"],      bodyRegion: "upper_body" },
  arms:       { primaryMuscles: ["biceps", "triceps"],              bodyRegion: "upper_body" },
  core:       { primaryMuscles: ["abs", "obliques"],                bodyRegion: "core"       },
  legs:       { primaryMuscles: ["quads", "hamstrings", "glutes"],  bodyRegion: "lower_body" },
  full_body:  { primaryMuscles: ["full_body"],                      bodyRegion: "full_body"  },
};

const CATEGORY_MAP: Record<string, string> = {
  strength:     "strength",
  cardio:       "cardio",
  bodyweight:   "calisthenics",
  conditioning: "conditioning",
};

type LeanExercise = Pick<IExerciseDefinition,
  "slug" | "name" | "trackingType" | "primaryMuscles" | "bodyRegion" | "category" |
  "defaultSets" | "defaultReps" | "defaultDuration" | "equipment" | "role" | "difficulty"
>;

// ─── GET /api/exercises/custom ────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const auth = await verifyAuth(req);
  if (!auth?.userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await connectDB();

  const exercises = await Exercise.find(
    { isCustom: true, createdBy: auth.userId },
    { slug: 1, name: 1, trackingType: 1, primaryMuscles: 1, bodyRegion: 1, category: 1,
      defaultSets: 1, defaultReps: 1, defaultDuration: 1, equipment: 1, role: 1, difficulty: 1 }
  ).lean<LeanExercise[]>();

  return NextResponse.json({ exercises });
}

// ─── POST /api/exercises/custom ───────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const auth = await verifyAuth(req);
  if (!auth?.userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { name, trackingType, muscleGroup, category, defaultSets, defaultReps } = body;

  if (!name?.trim()) return NextResponse.json({ error: "Name is required" }, { status: 400 });

  const validTrackingTypes = ["reps_weight", "reps_bodyweight", "reps_only", "time", "time_distance", "intervals", "none"];
  if (!validTrackingTypes.includes(trackingType)) {
    return NextResponse.json({ error: "Invalid tracking type" }, { status: 400 });
  }

  const muscleData = MUSCLE_MAP[muscleGroup] ?? { primaryMuscles: [], bodyRegion: "full_body" };
  const resolvedCategory = CATEGORY_MAP[category] ?? "strength";

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
    tags: ["custom"],
    bodyRegion: muscleData.bodyRegion,
    isActive: true,
    isCustom: true,
    createdBy: auth.userId.toString(),
    ...(defaultSets && { defaultSets: parseInt(defaultSets) }),
    ...(defaultReps && { defaultReps: String(defaultReps) }),
  });
  await exercise.save();

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
    },
  });
}

// ─── DELETE /api/exercises/custom?slug=xxx ────────────────────────────────────

export async function DELETE(req: NextRequest) {
  const auth = await verifyAuth(req);
  if (!auth?.userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const slug = searchParams.get("slug");
  if (!slug) return NextResponse.json({ error: "slug required" }, { status: 400 });

  await connectDB();

  const result = await Exercise.deleteOne({ slug, isCustom: true, createdBy: auth.userId.toString() });
  if (result.deletedCount === 0) {
    return NextResponse.json({ error: "Not found or not yours" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
