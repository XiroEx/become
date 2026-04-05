import { NextRequest } from 'next/server'
import { verifyAuth } from '@/lib/auth'
import connectDB from '@/lib/mongodb'
import User from '@/models/User'

export interface AdminAuthResult {
  success: boolean
  userId?: string
  email?: string
  error?: string
  status?: number
}

export async function verifyAdmin(request: NextRequest): Promise<AdminAuthResult> {
  const authResult = await verifyAuth(request)

  if (!authResult.success || !authResult.userId) {
    return { success: false, error: 'Unauthorized', status: 401 }
  }

  try {
    await connectDB()
    const user = await User.findById(authResult.userId).lean()

    if (!user) {
      return { success: false, error: 'User not found', status: 401 }
    }

    if (user.role !== 'admin') {
      return { success: false, error: 'Forbidden: admin access required', status: 403 }
    }

    return { success: true, userId: authResult.userId, email: authResult.email }
  } catch (error) {
    console.error('verifyAdmin error:', error)
    return { success: false, error: 'Internal server error', status: 500 }
  }
}
