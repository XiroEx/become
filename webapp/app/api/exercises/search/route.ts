import { NextRequest, NextResponse } from "next/server";
import { verifyAuth } from "@/lib/auth";
import connectDB from "@/lib/mongodb";
import Exercise from "@/models/Exercise";
import { visibleExerciseFilter } from "@/lib/exerciseVisibility";

// GET /api/exercises/search?q=bench+press&limit=8
// Text search across exercise name/aliases. Returns slug, name, trackingType.
// Used by the program builder's exercise name autocomplete.

export async function GET(req: NextRequest) {
  const auth = await verifyAuth(req);
  if (!auth.success) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim() ?? "";
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "8"), 20);

  if (!q || q.length < 2) return NextResponse.json({ exercises: [] });

  await connectDB();

  // The caller's own customs are fetched separately by most callers, but a
  // universal (admin-approved) custom exercise from any user must surface
  // here too — this endpoint feeds every "search to add" flow in the app.
  const exercises = await Exercise.find(
    {
      isActive: true,
      $and: [
        visibleExerciseFilter(auth.userId),
        {
          $or: [
            { name: { $regex: q, $options: "i" } },
            { aliases: { $elemMatch: { $regex: q, $options: "i" } } },
          ],
        },
      ],
    },
    { slug: 1, name: 1, trackingType: 1, equipment: 1, laterality: 1, movementPatterns: 1 }
  )
    .limit(limit)
    .lean<{ slug: string; name: string; trackingType: string; equipment?: string[]; laterality?: string; movementPatterns?: string[] }[]>();

  return NextResponse.json({ exercises });
}
