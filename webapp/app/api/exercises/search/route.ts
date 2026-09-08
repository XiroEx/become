import { NextRequest, NextResponse } from "next/server";
import { verifyAuth } from "@/lib/auth";
import connectDB from "@/lib/mongodb";
import Exercise from "@/models/Exercise";
import { visibleExerciseFilter } from "@/lib/exerciseVisibility";
import { nameBoundaryPattern, matchingMuscleGroups, sortByMatchTier } from "@/lib/exerciseSearchRanking";

// GET /api/exercises/search?q=bench+press&limit=8
// Text search across exercise name/aliases, plus a body-part fallback via
// muscle group. Returns slug, name, trackingType, plus enough classification
// fields for the exercise-swap modal to render a full-catalog match without a
// second round-trip.
// Used by the program builder's exercise autocomplete and the swap modal.

// Candidates are pulled unranked, then scored and cut down to `limit` in
// lib/exerciseSearchRanking — comfortably above the catalog's real size, so a
// good name match never gets pushed out by Mongo's own (unranked) cursor
// order before ranking gets a look at it.
const CANDIDATE_POOL = 300;

export async function GET(req: NextRequest) {
  const auth = await verifyAuth(req);
  if (!auth.success) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim() ?? "";
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "8"), 20);

  if (!q || q.length < 2) return NextResponse.json({ exercises: [] });

  try {
    await connectDB();

    // The caller's own customs are fetched separately by most callers, but a
    // universal (admin-approved) custom exercise from any user must surface
    // here too — this endpoint feeds every "search to add"/"search to swap" flow.
    // `q` is escaped before it reaches $regex — an unescaped '(' or '[' from a
    // partially-typed exercise name (e.g. "Curl (EZ") used to throw and take
    // the whole route down with it. The pattern is anchored to a word
    // boundary (start of string, or right after a space/hyphen/slash) so
    // "back" can't match the "back" hiding inside "Kickback" — see
    // lib/exerciseSearchRanking for the ranking this feeds.
    const pattern = nameBoundaryPattern(q);
    const muscleGroups = matchingMuscleGroups(q);

    const or: Record<string, unknown>[] = [
      { name: { $regex: pattern, $options: "i" } },
      { aliases: { $elemMatch: { $regex: pattern, $options: "i" } } },
    ];
    // "the part of the body that is being done" — an exercise whose name
    // doesn't mention the query at all still surfaces if it trains a muscle
    // the query names (e.g. "back" → a lat pulldown), ranked below every name
    // match by sortByMatchTier.
    if (muscleGroups.length > 0) {
      or.push({ primaryMuscles: { $in: muscleGroups } }, { secondaryMuscles: { $in: muscleGroups } });
    }

    const candidates = await Exercise.find(
      {
        isActive: true,
        $and: [visibleExerciseFilter(auth.userId), { $or: or }],
      },
      {
        slug: 1, name: 1, aliases: 1, trackingType: 1, equipment: 1, laterality: 1, movementPatterns: 1,
        primaryMuscles: 1, secondaryMuscles: 1, category: 1, bodyRegion: 1, role: 1, difficulty: 1,
        videoUrl: 1, isCustom: 1,
      }
    )
      .limit(CANDIDATE_POOL)
      .lean();

    const exercises = sortByMatchTier(candidates, q).slice(0, limit);

    return NextResponse.json({ exercises });
  } catch (error) {
    // A bad query should read as "no matches", not take the caller's whole
    // add/swap flow down with a 500 — see the try/catch note above.
    console.error("Error searching exercises:", error);
    return NextResponse.json({ exercises: [] });
  }
}
