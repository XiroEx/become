import dbConnect from '@/lib/mongodb';
import User from '@/models/User';

export type UserRole = 'user' | 'trainer' | 'admin';

export async function getUserRole(userId: string): Promise<{ role: UserRole; trainerId?: string }> {
  await dbConnect();
  const user = await User.findById(userId).select('role trainerId').lean();
  return {
    role: (user?.role as UserRole) || 'user',
    trainerId: user?.trainerId?.toString(),
  };
}

export function canAccessRoute(role: UserRole, route: string): boolean {
  // Program creation is trainer/admin only
  if (route.startsWith('/dashboard/programming/create')) {
    return role === 'trainer' || role === 'admin';
  }
  return true;
}
