// GET /api/programs/share-candidates?q=jane — trainer/admin only. Searches
// members (role 'user') by name/email for the "share this program" picker.
import { NextRequest, NextResponse } from 'next/server'
import dbConnect from '@/lib/mongodb'
import User from '@/models/User'
import { requireTrainerOrAdmin } from '@/lib/adminAuth'

export async function GET(request: NextRequest) {
  const gate = await requireTrainerOrAdmin(request)
  if (!gate.ok) return gate.response

  const { searchParams } = new URL(request.url)
  const q = (searchParams.get('q') ?? '').trim()
  if (q.length < 2) return NextResponse.json({ members: [] })

  await dbConnect()
  const regex = { $regex: q, $options: 'i' }
  const members = await User.find(
    { role: 'user', $or: [{ name: regex }, { email: regex }] },
    { name: 1, email: 1 },
  )
    .limit(20)
    .lean()

  return NextResponse.json({
    members: members.map((m) => ({ id: m._id.toString(), name: m.name, email: m.email })),
  })
}
