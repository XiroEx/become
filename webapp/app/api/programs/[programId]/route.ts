import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import ProgramModel from '@/models/Program';
import { hydrateProgram } from '@/lib/hydrateExercises';
import { verifyAuth } from '@/lib/auth';

interface RouteParams {
  params: Promise<{ programId: string }>;
}

// GET single program
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { programId } = await params;
    await dbConnect();
    
    const program = await ProgramModel.findOne({ program_id: programId }).lean();
    
    if (!program) {
      return NextResponse.json(
        { error: 'Program not found' },
        { status: 404 }
      );
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

// PUT update program (requires admin)
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const authResult = await verifyAuth(request);
    if (!authResult.success) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (authResult.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { programId } = await params;
    await dbConnect();

    const body = await request.json();
    const { name, description, duration_weeks, training_days_per_week, goal, target_user, equipment, tags, phases } = body;

    const program = await ProgramModel.findOneAndUpdate(
      { program_id: programId },
      { $set: { name, description, duration_weeks, training_days_per_week, goal, target_user, equipment, tags, phases } },
      { new: true, runValidators: true }
    );

    if (!program) {
      return NextResponse.json(
        { error: 'Program not found' },
        { status: 404 }
      );
    }

    return NextResponse.json(program);
  } catch (error) {
    console.error('Error updating program:', error);
    return NextResponse.json(
      { error: 'Failed to update program' },
      { status: 500 }
    );
  }
}

// DELETE program (requires admin)
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const authResult = await verifyAuth(request);
    if (!authResult.success) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (authResult.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { programId } = await params;
    await dbConnect();

    const program = await ProgramModel.findOneAndDelete({ program_id: programId });

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
