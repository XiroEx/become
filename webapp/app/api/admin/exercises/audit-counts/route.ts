// GET /api/admin/exercises/audit-counts — counts backing the admin Exercises
// page's Duplicates / No Video / Broken filter tabs. Cheap enough to compute
// on every page load: the visible catalog is a few hundred rows.

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/adminAuth';
import connectDB from '@/lib/mongodb';
import Exercise from '@/models/Exercise';
import { visibleExerciseFilter } from '@/lib/exerciseVisibility';
import { findDuplicateSlugs, isBrokenExercise, isMissingVideo, type AuditableExercise } from '@/lib/exerciseAudit';

export async function GET(request: NextRequest) {
  const gate = await requireAdmin(request);
  if (!gate.ok) return gate.response;

  await connectDB();

  const all = await Exercise.find(
    visibleExerciseFilter(gate.userId),
    { slug: 1, name: 1, videoUrl: 1, instructions: 1, primaryMuscles: 1 }
  ).lean<AuditableExercise[]>();

  return NextResponse.json({
    duplicate: findDuplicateSlugs(all).size,
    noVideo: all.filter(isMissingVideo).length,
    broken: all.filter(isBrokenExercise).length,
  });
}
