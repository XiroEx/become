import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import ProgramModel from '@/models/Program';

// GET all programs
export async function GET() {
  try {
    await dbConnect();
    const programs = await ProgramModel.find({}).lean();
    return NextResponse.json(programs);
  } catch (error) {
    console.error('Error fetching programs:', error);
    return NextResponse.json(
      { error: 'Failed to fetch programs' },
      { status: 500 }
    );
  }
}

// POST create new program
export async function POST(request: NextRequest) {
  try {
    await dbConnect();
    const body = await request.json();
    
    // Generate program_id from name if not provided
    if (!body.program_id) {
      body.program_id = body.name
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .substring(0, 50);
    }
    
    // Check if program_id already exists
    const existing = await ProgramModel.findOne({ program_id: body.program_id });
    if (existing) {
      // Append a random suffix
      body.program_id = `${body.program_id}-${Date.now().toString(36)}`;
    }
    
    const program = await ProgramModel.create(body);
    return NextResponse.json(program, { status: 201 });
  } catch (error) {
    console.error('Error creating program:', error);
    return NextResponse.json(
      { error: 'Failed to create program' },
      { status: 500 }
    );
  }
}
