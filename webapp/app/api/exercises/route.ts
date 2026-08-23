import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/auth';
import { requireAdmin } from '@/lib/adminAuth';
import connectDB from '@/lib/mongodb';
import Exercise from '@/models/Exercise';
import { invalidateExerciseCache } from '@/lib/hydrateExercises';
import { visibleExerciseFilter } from '@/lib/exerciseVisibility';

// GET /api/exercises
//   ?q=<text>           — text/regex search across name/aliases
//   &category=<cat>     — filter by category
//   &movement=<pattern> — filter by movement pattern
//   &bodyRegion=<r>     — filter by body region
//   &page=1&limit=50    — pagination
export async function GET(request: NextRequest) {
  try {
    const auth = await verifyAuth(request);
    if (!auth.success) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await connectDB();

    const { searchParams } = new URL(request.url);
    const q = searchParams.get('q')?.trim() ?? '';
    const category = searchParams.get('category')?.trim() ?? '';
    const movement = searchParams.get('movement')?.trim() ?? '';
    const bodyRegion = searchParams.get('bodyRegion')?.trim() ?? '';
    const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10));
    const limit = Math.min(200, Math.max(1, parseInt(searchParams.get('limit') ?? '50', 10)));

    // Catalog exercises + this user's own customs + any custom exercise an
    // admin has approved as universal — never someone else's unreviewed one.
    const clauses: Record<string, unknown>[] = [visibleExerciseFilter(auth.userId)];
    if (q) {
      clauses.push({
        $or: [
          { name: { $regex: q, $options: 'i' } },
          { slug: { $regex: q, $options: 'i' } },
          { aliases: { $elemMatch: { $regex: q, $options: 'i' } } },
        ],
      });
    }
    const filter: Record<string, unknown> = clauses.length > 1 ? { $and: clauses } : clauses[0];
    if (category) filter.category = category;
    if (movement) filter.movementPatterns = movement;
    if (bodyRegion) filter.bodyRegion = bodyRegion;

    const skip = (page - 1) * limit;
    const [total, exercises] = await Promise.all([
      Exercise.countDocuments(filter),
      Exercise.find(filter)
        .sort({ name: 1 })
        .skip(skip)
        .limit(limit)
        .lean(),
    ]);

    return NextResponse.json({
      exercises,
      total,
      page,
      pages: Math.ceil(total / limit),
    });
  } catch (error) {
    console.error('Error listing exercises:', error);
    return NextResponse.json({ error: 'Failed to list exercises' }, { status: 500 });
  }
}

// POST /api/exercises — create new exercise (admin only)
export async function POST(request: NextRequest) {
  const gate = await requireAdmin(request);
  if (!gate.ok) return gate.response;

  try {
    await connectDB();
    const body = await request.json();

    if (!body.name || typeof body.name !== 'string') {
      return NextResponse.json({ error: 'name is required' }, { status: 400 });
    }

    // Auto-generate slug if not provided
    let slug: string = body.slug?.trim();
    if (!slug) {
      slug = body.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
    }

    // Ensure uniqueness
    const existing = await Exercise.findOne({ slug });
    if (existing) {
      return NextResponse.json(
        { error: `An exercise with slug "${slug}" already exists` },
        { status: 409 }
      );
    }

    const exercise = await Exercise.create({
      ...body,
      slug,
      isCustom: false,
    });

    invalidateExerciseCache();

    return NextResponse.json({ exercise }, { status: 201 });
  } catch (error) {
    console.error('Error creating exercise:', error);
    const message = error instanceof Error ? error.message : 'Failed to create exercise';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
