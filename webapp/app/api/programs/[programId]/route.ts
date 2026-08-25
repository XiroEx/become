import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import ProgramModel from '@/models/Program';
import { hydrateProgram, dehydrateProgram } from '@/lib/hydrateExercises';
import { verifyAuth } from '@/lib/auth';
import { requireAdmin } from '@/lib/adminAuth';

interface RouteParams {
  params: Promise<{ programId: string }>;
}

// GET single program (any authed user)
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const authResult = await verifyAuth(request);
    if (!authResult.success) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { programId } = await params;
    await dbConnect();

    const program = await ProgramModel.findOne({ program_id: programId }).lean();

    if (!program) {
      return NextResponse.json(
        { error: 'Program not found' },
        { status: 404 }
      );
    }

    // Custom programs are owner-private, unless a trainer/admin shared this
    // one with the requesting user. Deny enumeration by everyone else.
    if (program.isCustom) {
      const ownerId = program.createdBy?.toString();
      const isSharedWithUser = (program.sharedWith ?? []).some((id) => id.toString() === authResult.userId);
      if (ownerId !== authResult.userId && !isSharedWithUser) {
        return NextResponse.json(
          { error: 'Program not found' },
          { status: 404 }
        );
      }
    }

    const hydrated = await hydrateProgram(program);
    return NextResponse.json(hydrated);
  } catch (error) {
    console.error('Error fetching program:', error);
    return NextResponse.json(
      { error: 'Failed to fetch program' },
      { status: 500 }
    );
  }
}

async function applyUpdate(request: NextRequest, programId: string) {
  await dbConnect();
  const body = await request.json();

  // Convert exercise names to slugs for DB storage (program editor sends names)
  const dehydrated = await dehydrateProgram(body);

  // Whitelist fields we allow updating
  const update: Record<string, unknown> = {};
  const allowed = [
    'name',
    'description',
    'duration_weeks',
    'training_days_per_week',
    'goal',
    'target_user',
    'equipment',
    'tags',
    'phases',
    'coverParallax',
    'coverZoom',
    'coverPositionX',
    'coverPositionY',
  ] as const;
  for (const key of allowed) {
    if (key in dehydrated) update[key] = (dehydrated as Record<string, unknown>)[key];
  }

  // Custom programs are owner-managed via /api/programs/custom/[id] — admins
  // must NOT mutate them through this admin endpoint.
  const program = await ProgramModel.findOneAndUpdate(
    { program_id: programId, isCustom: { $ne: true } },
    { $set: update },
    { new: true, runValidators: true }
  );

  if (!program) {
    return NextResponse.json({ error: 'Program not found' }, { status: 404 });
  }

  return NextResponse.json(program);
}

// PUT update program (admin only)
export async function PUT(request: NextRequest, { params }: RouteParams) {
  const gate = await requireAdmin(request);
  if (!gate.ok) return gate.response;

  try {
    const { programId } = await params;
    return await applyUpdate(request, programId);
  } catch (error) {
    console.error('Error updating program:', error);
    return NextResponse.json(
      { error: 'Failed to update program' },
      { status: 500 }
    );
  }
}

// PATCH update program (admin only) — alias of PUT
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const gate = await requireAdmin(request);
  if (!gate.ok) return gate.response;

  try {
    const { programId } = await params;
    return await applyUpdate(request, programId);
  } catch (error) {
    console.error('Error patching program:', error);
    return NextResponse.json(
      { error: 'Failed to update program' },
      { status: 500 }
    );
  }
}

// DELETE program (admin only)
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const gate = await requireAdmin(request);
  if (!gate.ok) return gate.response;

  try {
    const { programId } = await params;
    await dbConnect();

    // Custom programs are owner-managed via /api/programs/custom/[id].
    const program = await ProgramModel.findOneAndDelete({
      program_id: programId,
      isCustom: { $ne: true },
    });

    if (!program) {
      return NextResponse.json(
        { error: 'Program not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ message: 'Program deleted successfully' });
  } catch (error) {
    console.error('Error deleting program:', error);
    return NextResponse.json(
      { error: 'Failed to delete program' },
      { status: 500 }
    );
  }
}
