import { NextRequest, NextResponse } from 'next/server';
import dbConnect from '@/lib/mongodb';
import User from '@/models/User';
import { verifyAuth } from '@/lib/auth';
import type { IUserProfile } from '@/models/User';

// GET /api/profile — returns the current user's profile
export async function GET(request: NextRequest) {
  try {
    const authResult = await verifyAuth(request);
    if (!authResult.success) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await dbConnect();
    const user = await User.findById(authResult.userId)
      .select('name email profile onboardingCompleted')
      .lean();

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    return NextResponse.json({
      profile: user.profile ?? {},
      // undefined (old users without the field) serialises to absent in JSON,
      // so the AuthGuard's strict `=== false` check won't fire for them.
      onboardingCompleted: user.onboardingCompleted,
      name: user.name,
      email: user.email,
    });
  } catch (error) {
    console.error('Error fetching profile:', error);
    return NextResponse.json({ error: 'Failed to fetch profile' }, { status: 500 });
  }
}

// PATCH /api/profile — partial update of profile, onboardingCompleted, and/or name
export async function PATCH(request: NextRequest) {
  try {
    const authResult = await verifyAuth(request);
    if (!authResult.success) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await dbConnect();
    const body = await request.json() as {
      profile?: Partial<IUserProfile>;
      onboardingCompleted?: boolean;
      name?: string;
    };

    // Build the update object using dot-notation for nested profile fields
    // so we don't overwrite the entire profile sub-document
    const update: Record<string, unknown> = {};

    if (body.name !== undefined) {
      update['name'] = body.name;
    }
    if (body.onboardingCompleted !== undefined) {
      update['onboardingCompleted'] = body.onboardingCompleted;
    }
    if (body.profile !== undefined) {
      for (const [key, value] of Object.entries(body.profile)) {
        update[`profile.${key}`] = value;
      }
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    const updatedUser = await User.findByIdAndUpdate(
      authResult.userId,
      { $set: update },
      { new: true }
    )
      .select('name email profile onboardingCompleted')
      .lean();

    if (!updatedUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    return NextResponse.json({
      profile: updatedUser.profile ?? {},
      onboardingCompleted: updatedUser.onboardingCompleted,
      name: updatedUser.name,
      email: updatedUser.email,
    });
  } catch (error) {
    console.error('Error updating profile:', error);
    return NextResponse.json({ error: 'Failed to update profile' }, { status: 500 });
  }
}
