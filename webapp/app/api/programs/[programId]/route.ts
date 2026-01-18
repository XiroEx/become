import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import ProgramModel from '@/models/Program';

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
    
    return NextResponse.json(program);
  } catch (error) {
    console.error('Error fetching program:', error);
    return NextResponse.json(
      { error: 'Failed to fetch program' },
      { status: 500 }
    );
  }
}

// PUT update program
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const { programId } = await params;
    await dbConnect();
    
    const body = await request.json();
    
    const program = await ProgramModel.findOneAndUpdate(
      { program_id: programId },
      body,
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

// DELETE program
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
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
