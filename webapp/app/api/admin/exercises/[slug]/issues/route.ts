// GET /api/admin/exercises/[slug]/issues — the specific reasons this exercise
// trips the Duplicates / No Video / Broken audit tabs (lib/exerciseAudit.ts),
// surfaced on the admin edit page so an admin isn't left guessing which field
// is missing after clicking in from the "Broken" tab.

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/adminAuth';
import connectDB from '@/lib/mongodb';
import Exercise from '@/models/Exercise';
import { visibleExerciseFilter } from '@/lib/exerciseVisibility';
import { describeExerciseIssues, findDuplicateGroups, normalizeExerciseName } from '@/lib/exerciseAudit';

interface RouteParams {
  params: Promise<{ slug: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  const gate = await requireAdmin(request);
  if (!gate.ok) return gate.response;

  const { slug } = await params;
  await connectDB();

  const exercise = await Exercise.findOne(
    { slug },
    { slug: 1, name: 1, videoUrl: 1, instructions: 1, primaryMuscles: 1 }
  ).lean<{
    slug: string;
    name: string;
    videoUrl?: string | null;
    instructions?: string[];
    primaryMuscles?: string[];
  } | null>();

  if (!exercise) {
    return NextResponse.json({ error: 'Exercise not found' }, { status: 404 });
  }

  const catalog = await Exercise.find(
    visibleExerciseFilter(gate.userId),
    { slug: 1, name: 1 }
  ).lean<{ slug: string; name: string }[]>();

  const duplicateGroup = findDuplicateGroups(catalog).get(normalizeExerciseName(exercise.name)) ?? [];
  const duplicateNames = duplicateGroup.filter((e) => e.slug !== exercise.slug).map((e) => e.name);

  const issues = describeExerciseIssues(exercise, duplicateNames);

  return NextResponse.json({ issues });
}
