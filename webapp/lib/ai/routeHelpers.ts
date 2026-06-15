// Shared helpers for the /api/ai/* routes. These are thin authed proxies in
// front of the become-ai graph: they verify the caller, shape a compact grounding
// context (so the client can't make the graph do arbitrary work), then call the
// graph with a deterministic-friendly result. The webhook secret + read-back
// token live only in lib/ai/becomeGraph.ts (server env) and never reach here.

import { NextRequest, NextResponse } from 'next/server'
import { verifyAuth } from '@/lib/auth'

export interface AiUser {
  userId: string
  email?: string
}

/** Auth gate for every AI route. Returns null + a 401 response when unauthed. */
export async function requireAiUser(
  request: NextRequest,
): Promise<{ user: AiUser } | { user: null; res: NextResponse }> {
  const auth = await verifyAuth(request)
  if (!auth.success || !auth.userId) {
    return { user: null, res: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  }
  return { user: { userId: auth.userId, email: auth.email } }
}

/** Clamp a chat history to the last N turns and strip it to {role,text}. */
export function trimHistory(
  history: unknown,
  max = 6,
): Array<{ role: string; text: string }> {
  if (!Array.isArray(history)) return []
  return history
    .filter((h): h is { role?: string; text?: string } => !!h && typeof h === 'object')
    .map((h) => ({
      role: h.role === 'assistant' || h.role === 'coach' ? 'assistant' : 'user',
      text: String(h.text ?? '').slice(0, 800),
    }))
    .filter((h) => h.text.trim().length > 0)
    .slice(-max)
}

/** Coerce an arbitrary client value to a bounded string. */
export function asText(v: unknown, max = 2000): string {
  return typeof v === 'string' ? v.slice(0, max) : ''
}
