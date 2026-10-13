// The opt-out behind every engagement email's "Unsubscribe" link.
//
// PUBLIC, and deliberately so: CAN-SPAM requires the opt-out to work without
// a sign-in, and middleware.ts matches /dashboard/:path* only, so nothing
// intercepts it. Auth is the HMAC on the link (lib/emailUnsubscribe.ts). It is
// NOT under /api/me because there is no session here.
//
// GET is what a human clicks; POST is what a mail client sends for RFC 8058
// one-click unsubscribe (the List-Unsubscribe-Post header). Both flip the same
// boolean. GET mutating state is the exception this app makes for exactly one
// route, because a link in an email cannot POST — and it flips a preference
// that the member can flip back in Settings, never anything that cannot be
// undone.

import { NextRequest, NextResponse } from 'next/server'
import mongoose from 'mongoose'
import dbConnect from '@/lib/mongodb'
import User from '@/models/User'
import { verifyUnsubscribe } from '@/lib/emailUnsubscribe'
import { LEGAL_CONTACT_EMAIL } from '@/lib/legal'

export const dynamic = 'force-dynamic'

function page(title: string, body: string, status: number) {
  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;background:#fafafa;color:#18181b;margin:0;padding:48px 20px;">
<div style="max-width:480px;margin:0 auto;background:#fff;border:1px solid #e4e4e7;border-radius:12px;padding:32px;">
<h1 style="font-size:20px;margin:0 0 12px;">${title}</h1>
<p style="font-size:15px;line-height:1.6;color:#3f3f46;margin:0;">${body}</p>
</div></body></html>`
  return new NextResponse(html, { status, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } })
}

async function handle(request: NextRequest) {
  const userId = request.nextUrl.searchParams.get('u') ?? ''
  const token = request.nextUrl.searchParams.get('t') ?? ''
  if (!mongoose.isValidObjectId(userId) || !(await verifyUnsubscribe(userId, token))) {
    return page(
      'This link is not valid',
      `The unsubscribe link is incomplete or has been altered. Email ${LEGAL_CONTACT_EMAIL} and we will turn these emails off for you.`,
      400,
    )
  }
  await dbConnect()
  await User.updateOne({ _id: userId }, { $set: { 'emailPreferences.engagement': false } })
  return page(
    "You're unsubscribed",
    'You will not get streak or milestone emails from Become any more. Sign-in links still arrive, because you cannot get in without them. You can turn these back on any time in Settings.',
    200,
  )
}

export async function GET(request: NextRequest) {
  try {
    return await handle(request)
  } catch (error) {
    console.error('[email] unsubscribe failed:', error)
    return page('Something went wrong', `Please try again, or email ${LEGAL_CONTACT_EMAIL}.`, 500)
  }
}

export async function POST(request: NextRequest) {
  return GET(request)
}
