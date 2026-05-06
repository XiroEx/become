import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import ProgramModel from '@/models/Program';
import { hydratePrograms, dehydrateProgram } from '@/lib/hydrateExercises';
import { verifyAuth } from '@/lib/auth';
import { requireAdmin } from '@/lib/adminAuth';

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

    // Strip ownership/custom flags so an admin can't plant a program into
    // another user's "My Programs" list by stuffing the request body.
    delete body.isCustom;
    delete body.createdBy;

    // Convert exercise names to slugs for DB storage
    const dehydrated = await dehydrateProgram(body);

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

    const program = await ProgramModel.create(dehydrated);
    return NextResponse.json(program, { status: 201 });
  } catch (error) {
    console.error('Error creating program:', error);
    return NextResponse.json(
      { error: 'Failed to create program' },
      { status: 500 }
    );
  }
}
