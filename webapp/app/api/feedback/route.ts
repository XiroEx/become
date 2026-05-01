import { NextRequest, NextResponse } from 'next/server'
import { verifyAuth } from '@/lib/auth'
import dbConnect from '@/lib/mongodb'
import Feedback from '@/models/Feedback'
import { sendEmail } from '@/lib/email'

const appName = process.env.NEXT_PUBLIC_APP_NAME || 'Become'

export async function POST(request: NextRequest) {
  const auth = await verifyAuth(request)
  if (!auth.success) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { type, message } = await request.json()

    if (!message?.trim()) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 })
    }

    await dbConnect()

    const feedbackType = type || 'general'
    const trimmedMessage = message.trim()

    const feedback = await Feedback.create({
      userId: auth.userId,
      email: auth.email,
      type: feedbackType,
      message: trimmedMessage,
    })

    // Email notification (fire-and-forget)
    const typeLabel = feedbackType.charAt(0).toUpperCase() + feedbackType.slice(1)
    sendEmail({
      to: 'george@redbtn.io',
      from: '"BECOME" <agent@redbtn.io>',
      subject: `[${appName}] New ${typeLabel} Feedback from ${auth.email}`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: #18181b; padding: 24px; border-radius: 12px 12px 0 0;">
            <h2 style="color: #fff; margin: 0; font-size: 18px;">${appName} Feedback</h2>
          </div>
          <div style="background: #fff; padding: 24px; border: 1px solid #e4e4e7; border-top: none; border-radius: 0 0 12px 12px;">
            <p style="margin: 0 0 8px; font-size: 14px; color: #71717a;">
              <strong>Type:</strong> ${typeLabel}
            </p>
            <p style="margin: 0 0 16px; font-size: 14px; color: #71717a;">
              <strong>From:</strong> ${auth.email}
            </p>
            <div style="background: #f4f4f5; padding: 16px; border-radius: 8px; font-size: 14px; color: #27272a; white-space: pre-wrap;">${trimmedMessage}</div>
          </div>
        </div>
      `,
    }).catch(err => console.error('Failed to send feedback email:', err))

    return NextResponse.json({ success: true, id: feedback._id })
  } catch (error) {
    console.error('Error saving feedback:', error)
    return NextResponse.json({ error: 'Failed to save feedback' }, { status: 500 })
  }
}
