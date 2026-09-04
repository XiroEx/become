import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/auth';
import { requireAdmin } from '@/lib/adminAuth';
import connectDB from '@/lib/mongodb';
import Exercise from '@/models/Exercise';
import { invalidateExerciseCache } from '@/lib/hydrateExercises';
import { visibleExerciseFilter } from '@/lib/exerciseVisibility';
import { escapeRegExp, findDuplicateSlugs, isBrokenExercise, isMissingVideo, type AuditableExercise } from '@/lib/exerciseAudit';

interface AuditRow extends AuditableExercise {
  category?: string;
  movementPatterns?: string[];
  bodyRegion?: string;
}

const ISSUE_TYPES = ['duplicate', 'noVideo', 'broken'] as const;
type IssueType = (typeof ISSUE_TYPES)[number];

// GET /api/exercises
//   ?q=<text>           — text/regex search across name/aliases
//   &category=<cat>     — filter by category
//   &movement=<pattern> — filter by movement pattern
//   &bodyRegion=<r>     — filter by body region
//   &issue=duplicate|noVideo|broken — admin data-quality filter (lib/exerciseAudit.ts)
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
    const issueParam = searchParams.get('issue')?.trim() ?? '';
    const issue = (ISSUE_TYPES as readonly string[]).includes(issueParam) ? (issueParam as IssueType) : null;
    const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10));
    const limit = Math.min(200, Math.max(1, parseInt(searchParams.get('limit') ?? '50', 10)));

    if (issue) {
      // Duplicate/broken/no-video detection has to see the whole visible
      // catalog to cross-reference names against each other, not just one
      // paginated page — so this branch fetches everything, flags in
      // memory, then paginates the flagged subset. The catalog is a few
      // hundred rows, not millions.
      const all = await Exercise.find(
        visibleExerciseFilter(auth.userId),
        { slug: 1, name: 1, category: 1, movementPatterns: 1, bodyRegion: 1, videoUrl: 1, instructions: 1, primaryMuscles: 1 }
      ).lean<AuditRow[]>();

      const flaggedSlugs = issue === 'duplicate'
        ? findDuplicateSlugs(all)
        : new Set(all.filter(issue === 'noVideo' ? isMissingVideo : isBrokenExercise).map((e) => e.slug));

      const qLower = q.toLowerCase();
      const flagged = all
        .filter((e) => {
          if (!flaggedSlugs.has(e.slug)) return false;
          if (q && !e.name.toLowerCase().includes(qLower) && !e.slug.toLowerCase().includes(qLower)) return false;
          if (category && e.category !== category) return false;
          if (movement && !(e.movementPatterns ?? []).includes(movement)) return false;
          if (bodyRegion && e.bodyRegion !== bodyRegion) return false;
          return true;
        })
        .sort((a, b) => a.name.localeCompare(b.name));

      const total = flagged.length;
      const skip = (page - 1) * limit;
      const exercises = flagged.slice(skip, skip + limit);

      return NextResponse.json({
        exercises,
        total,
        page,
        pages: Math.max(1, Math.ceil(total / limit)),
      });
    }

    // Catalog exercises + this user's own customs + any custom exercise an
    // admin has approved as universal — never someone else's unreviewed one.
    const clauses: Record<string, unknown>[] = [visibleExerciseFilter(auth.userId)];
    if (q) {
      const pattern = escapeRegExp(q);
      clauses.push({
        $or: [
          { name: { $regex: pattern, $options: 'i' } },
          { slug: { $regex: pattern, $options: 'i' } },
          { aliases: { $elemMatch: { $regex: pattern, $options: 'i' } } },
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
