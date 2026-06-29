import { NextRequest, NextResponse } from 'next/server'
import { verifyAuth } from '@/lib/auth'
import dbConnect from '@/lib/mongodb'
import Feedback from '@/models/Feedback'
import { sendEmail } from '@/lib/email'

const appName = process.env.NEXT_PUBLIC_APP_NAME || 'BECOME'

interface ImagePayload {
  name: string
  dataUrl: string // "data:image/png;base64,..."
}

const ALLOWED_TYPES = new Set(['bug', 'feature', 'general', 'nutrition_generation'])

function sanitizeMetadata(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  try {
    const json = JSON.stringify(value)
    if (json.length > 12000) {
      return { truncated: true, reason: 'metadata_too_large' }
    }
    return JSON.parse(json) as Record<string, unknown>
  } catch {
    return { dropped: true, reason: 'metadata_not_serializable' }
  }
}

function typeLabel(type: string): string {
  return type
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

export async function POST(request: NextRequest) {
  const auth = await verifyAuth(request)
  if (!auth.success) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { type, message, images, metadata } = await request.json() as {
      type?: string
      message?: string
      images?: ImagePayload[]
      metadata?: unknown
    }

    if (!message?.trim()) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 })
    }

    await dbConnect()

    const feedbackType = type && ALLOWED_TYPES.has(type) ? type : 'general'
    const trimmedMessage = message.trim()
    const safeMetadata = sanitizeMetadata(metadata)

    const feedback = await Feedback.create({
      userId: auth.userId,
      email: auth.email,
      type: feedbackType,
      message: trimmedMessage,
      ...(safeMetadata ? { metadata: safeMetadata } : {}),
    })

    // Build nodemailer CID attachments from base64 data URLs
    const validImages = (images ?? []).slice(0, 3).filter(
      (img) => typeof img.dataUrl === 'string' && img.dataUrl.startsWith('data:image/')
    )

    const attachments = validImages.map((img, i) => {
      const [meta, b64] = img.dataUrl.split(',')
      const mimeMatch = meta.match(/data:([^;]+);/)
      const contentType = mimeMatch?.[1] ?? 'image/png'
      const ext = contentType.split('/')[1] ?? 'png'
      return {
        filename: img.name || `screenshot-${i + 1}.${ext}`,
        content: Buffer.from(b64, 'base64'),
        contentType,
        cid: `feedback-image-${i}`,
      }
    })

    const inlineImagesHtml = attachments.length
      ? `<div style="margin-top:16px;">${attachments
          .map(
            (a) =>
              `<img src="cid:${a.cid}" alt="${a.filename}" style="max-width:100%;max-height:400px;border-radius:8px;margin-bottom:8px;display:block;" />`
          )
          .join('')}</div>`
      : ''

    const label = typeLabel(feedbackType)

    sendEmail({
      to: 'george@redbtn.io',
      from: '"BECOME" <agent@redbtn.io>',
      subject: `[${appName}] New ${label} Feedback from ${auth.email}`,
      attachments,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: #18181b; padding: 24px; border-radius: 12px 12px 0 0;">
            <h2 style="color: #fff; margin: 0; font-size: 18px;">${appName} Feedback</h2>
          </div>
          <div style="background: #fff; padding: 24px; border: 1px solid #e4e4e7; border-top: none; border-radius: 0 0 12px 12px;">
            <p style="margin: 0 0 8px; font-size: 14px; color: #71717a;">
              <strong>Type:</strong> ${label}
            </p>
            <p style="margin: 0 0 16px; font-size: 14px; color: #71717a;">
              <strong>From:</strong> ${auth.email}
            </p>
            <div style="background: #f4f4f5; padding: 16px; border-radius: 8px; font-size: 14px; color: #27272a; white-space: pre-wrap;">${trimmedMessage}</div>
            ${inlineImagesHtml}
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
