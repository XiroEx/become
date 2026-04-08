import { NextRequest, NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import Exercise from "@/models/Exercise";

// One-time upsert endpoint for adding missing exercises to production.
// Protected by a secret header — remove this file after use.

const EXERCISES = [
  {
    slug: "belt-squat",
    name: "Belt Squat",
    aliases: ["Belt Squat Machine"],
    description: "",
    category: "strength",
    mechanics: "compound",
    role: "secondary",
    movementPatterns: ["squat"],
    laterality: "bilateral",
    difficulty: "intermediate",
    primaryMuscles: ["quads"],
    secondaryMuscles: ["glutes"],
    stabilizers: [],
    equipment: ["belt_squat_machine"],
    optionalEquipment: [],
    trackingType: "reps_weight",
    defaultSets: 3,
    defaultReps: "10-12",
    defaultRest: "2 min",
    instructions: [],
    cues: [],
    commonMistakes: [],
    prerequisites: [],
    variations: [],
    alternatives: ["pendulum-squat", "leg-press", "hack-squat"],
    tags: ["squat", "machine", "spine_friendly"],
    bodyRegion: "lower_body",
    isActive: true,
  },
  {
    slug: "pendulum-squat",
    name: "Pendulum Squat",
    aliases: ["Pendulum Squat Machine"],
    description: "",
    category: "strength",
    mechanics: "compound",
    role: "secondary",
    movementPatterns: ["squat"],
    laterality: "bilateral",
    difficulty: "intermediate",
    primaryMuscles: ["quads"],
    secondaryMuscles: ["glutes"],
    stabilizers: [],
    equipment: ["hack_squat"],
    optionalEquipment: [],
    trackingType: "reps_weight",
    defaultSets: 3,
    defaultReps: "10-12",
    defaultRest: "2 min",
    instructions: [],
    cues: [],
    commonMistakes: [],
    prerequisites: [],
    variations: [],
    alternatives: ["belt-squat", "hack-squat", "leg-press"],
    tags: ["squat", "machine", "spine_friendly"],
    bodyRegion: "lower_body",
    isActive: true,
  },
];

export async function POST(req: NextRequest) {
  const secret = req.headers.get("x-admin-secret");
  if (secret !== process.env.JWT_SECRET) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await connectDB();

  const results = [];
  for (const ex of EXERCISES) {
    const result = await Exercise.updateOne(
      { slug: ex.slug },
      { $set: ex },
      { upsert: true }
    );
    results.push({ slug: ex.slug, upserted: result.upsertedCount, modified: result.modifiedCount });
  }

  return NextResponse.json({ ok: true, results });
}
