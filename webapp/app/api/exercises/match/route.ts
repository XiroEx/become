import { NextRequest, NextResponse } from "next/server";
import { verifyAuth } from "@/lib/auth";
import connectDB from "@/lib/mongodb";
import { matchExerciseNames } from "@/lib/hydrateExercises";

// POST /api/exercises/match
// Body: { names: string[] }
// Returns: { known: string[] } — the lowercased/trimmed subset of `names`
// that matches a real Exercise document by name or alias. Used by the
// program-import review flow to flag exercises that would be created as new
// (see lib/workout/importProgram.ts's flagImportedProgram()).

const MAX_NAMES = 200;

export async function POST(req: NextRequest) {
  const auth = await verifyAuth(req);
  if (!auth.success) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { names?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const names = Array.isArray(body.names)
    ? body.names.filter((n): n is string => typeof n === "string").slice(0, MAX_NAMES)
    : [];
  if (names.length === 0) return NextResponse.json({ known: [] });

  await connectDB();
  const known = await matchExerciseNames(names);
  return NextResponse.json({ known: Array.from(known) });
}
