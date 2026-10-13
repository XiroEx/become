import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import ProgramModel from '@/models/Program';
import { hydratePrograms, dehydrateProgram } from '@/lib/hydrateExercises';
import { verifyAuth } from '@/lib/auth';
import { requireAdmin } from '@/lib/adminAuth';
import { pickAdminProgramFields } from '@/lib/programFields';
import { createStrict } from '@/lib/strictCreate';

// GET all programs (any authed user — read-only browsing)
export async function GET(request: NextRequest) {
  try {
    const authResult = await verifyAuth(request);
    if (!authResult.success) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await dbConnect();
    // Filter customs OUT for everyone except the creator (don't leak users'
    // custom programs to other users via the catalog list).
    const programs = await ProgramModel.find({
      $or: [
        { isCustom: { $ne: true } },
        { createdBy: authResult.userId },
      ],
    }).lean();
    const hydrated = await hydratePrograms(programs);
    return NextResponse.json(hydrated);
  } catch (error) {
    console.error('Error fetching programs:', error);
    return NextResponse.json(
      { error: 'Failed to fetch programs' },
      { status: 500 }
    );
  }
}

// POST create new program (admin only)
export async function POST(request: NextRequest) {
  const gate = await requireAdmin(request);
  if (!gate.ok) return gate.response;

  try {
    await dbConnect();
    const body = await request.json();

    // ALLOWLIST, not a deny-list — see lib/programFields.ts. This route used to
    // strip `isCustom` and `createdBy` and create the model from everything
    // else, which is how `sharedWith` (the grant that plants a program in
    // another member's "My Programs" list) reached the sibling custom-create
    // path. Admin-gated, so it was never an escalation; it is the same shape,
    // and the shape is what keeps coming back.
    const dehydrated = await dehydrateProgram(pickAdminProgramFields(body));

    // Generate program_id from name if not provided
    if (!dehydrated.program_id) {
      dehydrated.program_id = dehydrated.name
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .substring(0, 50);
    }

    // Check if program_id already exists
    const existing = await ProgramModel.findOne({ program_id: dehydrated.program_id });
    if (existing) {
      // Append a random suffix
      dehydrated.program_id = `${dehydrated.program_id}-${Date.now().toString(36)}`;
    }

    const program = await createStrict(ProgramModel, dehydrated);
    return NextResponse.json(program, { status: 201 });
  } catch (error) {
    console.error('Error creating program:', error);
    return NextResponse.json(
      { error: 'Failed to create program' },
      { status: 500 }
    );
  }
}
