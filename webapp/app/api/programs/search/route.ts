import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import Program from '@/models/Program';
import { hydratePrograms } from '@/lib/hydrateExercises';
import { verifyAuth } from '@/lib/auth';
import {
  buildProgramSearchFilter,
  buildProgramSearchPipeline,
  buildProgramVisibilityClause,
} from '@/lib/programSearch';

// hydratePrograms imported for parity with the rest of the API surface
// even though this route only returns projected summaries.
void hydratePrograms;

// GET programs with search, filtering, and pagination
export async function GET(request: NextRequest) {
  try {
    // Best-effort auth so we can include the user's own customs in results
    // (catalog lists hide other users' customs).
    const authResult = await verifyAuth(request);
    const authUserId = authResult.success ? authResult.userId : null;

    await dbConnect();

    const searchParams = request.nextUrl.searchParams;
    const query = searchParams.get('q') || '';
    const tags = searchParams.getAll('tag');
    const targetUser = searchParams.get('level');
    const minWeeks = searchParams.get('minWeeks');
    const maxWeeks = searchParams.get('maxWeeks');
    const daysPerWeek = searchParams.get('days');
    const rawPage = parseInt(searchParams.get('page') || '1', 10);
    const page = Number.isNaN(rawPage) || rawPage < 1 ? 1 : rawPage;
    const rawLimit = parseInt(searchParams.get('limit') || '20', 10);
    const limit = Number.isNaN(rawLimit) || rawLimit < 1 ? 20 : rawLimit;
    const skip = (page - 1) * limit;

    const filter = buildProgramSearchFilter({
      authUserId,
      query,
      tags,
      targetUser,
      minWeeks,
      maxWeeks,
      daysPerWeek,
    });

    // Get total count for pagination
    const total = await Program.countDocuments(filter);

    const pipeline = buildProgramSearchPipeline({
      authUserId,
      query,
      tags,
      targetUser,
      minWeeks,
      maxWeeks,
      daysPerWeek,
      page,
      limit,
    });

    // Fetch programs with database-level relevance ranking, total deterministic sort, and projection
    const programs = await Program.aggregate(pipeline);

    // Get all unique tags for filter options — scoped to programs the caller
    // can actually see, otherwise other users' custom-program tags leak into
    // the public filter dropdown and yield zero hits when selected.
    const visibilityClause = buildProgramVisibilityClause(authUserId);
    const allTags = await Program.distinct('tags', visibilityClause);

    return NextResponse.json({
      programs,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasMore: skip + programs.length < total
      },
      availableTags: allTags.filter(Boolean).sort()
    });
  } catch (error) {
    console.error('Error searching programs:', error);
    return NextResponse.json(
      { error: 'Failed to search programs' },
      { status: 500 }
    );
  }
}
