import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import User, { ISavedProgram } from '@/models/User';
import Program from '@/models/Program';
import { verifyAuth } from '@/lib/auth';

// GET saved programs for the current user
export async function GET(request: NextRequest) {
  try {
    const authResult = await verifyAuth(request);
    if (!authResult.success) {
      return NextResponse.json({ error: authResult.error ?? 'Unauthorized' }, { status: 401 });
    }
    const decoded = { userId: authResult.userId!, email: authResult.email! };

    await dbConnect();
    
    const user = await User.findById(decoded.userId).lean();
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const savedPrograms = user.savedPrograms || [];
    
    // Get program IDs in order
    const sortedSaved = [...savedPrograms].sort((a, b) => a.order - b.order);
    const programIds = sortedSaved.map(sp => sp.programId);
    
    // Fetch program details
    const programs = await Program.find(
      { program_id: { $in: programIds } },
      { program_id: 1, name: 1, description: 1, duration_weeks: 1, training_days_per_week: 1, target_user: 1, tags: 1, phases: 1 }
    ).lean();
    
    // Create a map for quick lookup
    const programMap = new Map(programs.map(p => [p.program_id, p]));
    
    // Return programs in saved order with savedAt info
    const orderedPrograms = sortedSaved
      .map(sp => {
        const program = programMap.get(sp.programId);
        if (program) {
          return {
            ...program,
            savedAt: sp.savedAt,
            order: sp.order
          };
        }
        return null;
      })
      .filter(Boolean);

    return NextResponse.json({ savedPrograms: orderedPrograms });
  } catch (error) {
    console.error('Error fetching saved programs:', error);
    return NextResponse.json(
      { error: 'Failed to fetch saved programs' },
      { status: 500 }
    );
  }
}

// POST to save a program
export async function POST(request: NextRequest) {
  try {
    const authResult = await verifyAuth(request);
    if (!authResult.success) {
      return NextResponse.json({ error: authResult.error ?? 'Unauthorized' }, { status: 401 });
    }
    const decoded = { userId: authResult.userId!, email: authResult.email! };

    const { programId } = await request.json();
    if (!programId) {
      return NextResponse.json({ error: 'Program ID required' }, { status: 400 });
    }

    await dbConnect();
    
    // Verify program exists
    const program = await Program.findOne({ program_id: programId });
    if (!program) {
      return NextResponse.json({ error: 'Program not found' }, { status: 404 });
    }

    const user = await User.findById(decoded.userId);
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Check if already saved
    const savedPrograms = user.savedPrograms as ISavedProgram[] | undefined;
    const alreadySaved = savedPrograms?.some(sp => sp.programId === programId);
    if (alreadySaved) {
      return NextResponse.json({ error: 'Program already saved' }, { status: 400 });
    }

    // Add to saved programs at the end
    const maxOrder = savedPrograms?.reduce((max, sp) => Math.max(max, sp.order), -1) ?? -1;
    
    await User.findByIdAndUpdate(decoded.userId, {
      $push: {
        savedPrograms: {
          programId,
          savedAt: new Date(),
          order: maxOrder + 1
        }
      }
    });

    return NextResponse.json({ success: true, message: 'Program saved' });
  } catch (error) {
    console.error('Error saving program:', error);
    return NextResponse.json(
      { error: 'Failed to save program' },
      { status: 500 }
    );
  }
}

// DELETE to unsave a program
export async function DELETE(request: NextRequest) {
  try {
    const authResult = await verifyAuth(request);
    if (!authResult.success) {
      return NextResponse.json({ error: authResult.error ?? 'Unauthorized' }, { status: 401 });
    }
    const decoded = { userId: authResult.userId!, email: authResult.email! };

    const { programId } = await request.json();
    if (!programId) {
      return NextResponse.json({ error: 'Program ID required' }, { status: 400 });
    }

    await dbConnect();

    await User.findByIdAndUpdate(decoded.userId, {
      $pull: { savedPrograms: { programId } }
    });

    return NextResponse.json({ success: true, message: 'Program removed from saved' });
  } catch (error) {
    console.error('Error removing saved program:', error);
    return NextResponse.json(
      { error: 'Failed to remove program' },
      { status: 500 }
    );
  }
}

// PATCH to reorder saved programs
export async function PATCH(request: NextRequest) {
  try {
    const authResult = await verifyAuth(request);
    if (!authResult.success) {
      return NextResponse.json({ error: authResult.error ?? 'Unauthorized' }, { status: 401 });
    }
    const decoded = { userId: authResult.userId!, email: authResult.email! };

    const { programIds } = await request.json();
    if (!Array.isArray(programIds)) {
      return NextResponse.json({ error: 'Program IDs array required' }, { status: 400 });
    }

    await dbConnect();

    const user = await User.findById(decoded.userId);
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Update order based on new array position
    const savedProgramsArray = user.savedPrograms as ISavedProgram[] | undefined;
    const updatedSavedPrograms = programIds.map((programId, index) => {
      const existing = savedProgramsArray?.find(sp => sp.programId === programId);
      return {
        programId,
        savedAt: existing?.savedAt || new Date(),
        order: index
      };
    });

    await User.findByIdAndUpdate(decoded.userId, {
      $set: { savedPrograms: updatedSavedPrograms }
    });

    return NextResponse.json({ success: true, message: 'Order updated' });
  } catch (error) {
    console.error('Error reordering programs:', error);
    return NextResponse.json(
      { error: 'Failed to reorder programs' },
      { status: 500 }
    );
  }
}
