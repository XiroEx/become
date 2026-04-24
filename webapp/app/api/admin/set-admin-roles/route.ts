import { NextRequest, NextResponse } from 'next/server'
import connectDB from '@/lib/mongodb'
import User from '@/models/User'

const ONE_TIME_TOKEN = 'become-admin-setup-2026'

export async function POST(request: NextRequest) {
  const token = request.headers.get('x-bootstrap-token')
  if (token !== ONE_TIME_TOKEN) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  await connectDB()

  const emails = [
    'george8794@gmail.com',
    'george@redbtn.io',
    'jondon27500@gmail.com',
  ]

  const results: Record<string, string> = {}

  for (const email of emails) {
    const user = await User.findOneAndUpdate(
      { email },
      { $set: { role: 'admin' } },
      { new: true }
    ).lean()
    results[email] = user ? 'promoted to admin' : 'not found'
  }

  return NextResponse.json({ results })
}
