import { NextRequest, NextResponse } from "next/server";
import { verifyAuth } from "@/lib/auth";
import connectDB from "@/lib/mongodb";
import Exercise from "@/models/Exercise";

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

  const exercises = await Exercise.find(
    {
      isActive: true,
      isCustom: { $ne: true }, // custom exercises are fetched separately
      $or: [
        { name: { $regex: q, $options: "i" } },
        { aliases: { $elemMatch: { $regex: q, $options: "i" } } },
      ],
    },
    { slug: 1, name: 1, trackingType: 1 }
  )
    .limit(limit)
    .lean<{ slug: string; name: string; trackingType: string }[]>();

  return NextResponse.json({ exercises });
}
