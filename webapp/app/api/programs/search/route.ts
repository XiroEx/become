import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import Program from '@/models/Program';
import { hydratePrograms } from '@/lib/hydrateExercises';

// GET programs with search, filtering, and pagination
export async function GET(request: NextRequest) {
  try {
    await dbConnect();

    const searchParams = request.nextUrl.searchParams;
    const query = searchParams.get('q') || '';
    const tags = searchParams.getAll('tag');
    const targetUser = searchParams.get('level');
    const minWeeks = searchParams.get('minWeeks');
    const maxWeeks = searchParams.get('maxWeeks');
    const daysPerWeek = searchParams.get('days');
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const skip = (page - 1) * limit;

    // Build filter query
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const filter: any = {};

    // Text search with priority scoring
    if (query) {
      // Use $or with regex for priority-based searching
      // This gives us more control than text search for ordering
      const searchRegex = new RegExp(query, 'i');
      filter.$or = [
        { name: searchRegex },
        { tags: searchRegex },
        { description: searchRegex },
        { goal: searchRegex }
      ];
    }

    // Tag filtering (match any of the provided tags)
    if (tags.length > 0) {
      filter.tags = { $in: tags.map(t => new RegExp(t, 'i')) };
    }

    // Target user level
    if (targetUser) {
      filter.target_user = targetUser;
    }

    // Duration filtering
    if (minWeeks || maxWeeks) {
      filter.duration_weeks = {};
      if (minWeeks) filter.duration_weeks.$gte = parseInt(minWeeks);
      if (maxWeeks) filter.duration_weeks.$lte = parseInt(maxWeeks);
    }

    // Days per week filtering
    if (daysPerWeek) {
      filter.training_days_per_week = parseInt(daysPerWeek);
    }

    // Get total count for pagination
    const total = await Program.countDocuments(filter);

    // Fetch programs with projection (exclude full phase details for listing)
    let programs = await Program.find(filter, {
      program_id: 1,
      name: 1,
      description: 1,
      duration_weeks: 1,
      training_days_per_week: 1,
      goal: 1,
      target_user: 1,
      equipment: 1,
      tags: 1,
      'phases.phase': 1,
      'phases.weeks': 1,
      'phases.focus': 1
    })
      .skip(skip)
      .limit(limit)
      .lean();

    // If there's a search query, sort by relevance (name match first, then tags, then description)
    if (query) {
      const searchLower = query.toLowerCase();
      programs = programs.sort((a, b) => {
        const aNameMatch = a.name.toLowerCase().includes(searchLower) ? 0 : 1;
        const bNameMatch = b.name.toLowerCase().includes(searchLower) ? 0 : 1;
        if (aNameMatch !== bNameMatch) return aNameMatch - bNameMatch;

        const aTagMatch = a.tags?.some((t: string) => t.toLowerCase().includes(searchLower)) ? 0 : 1;
        const bTagMatch = b.tags?.some((t: string) => t.toLowerCase().includes(searchLower)) ? 0 : 1;
        if (aTagMatch !== bTagMatch) return aTagMatch - bTagMatch;

        return 0;
      });
    }

    // Get all unique tags for filter options
    const allTags = await Program.distinct('tags');

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
