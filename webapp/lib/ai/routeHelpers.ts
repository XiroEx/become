// Shared helpers for the /api/ai/* routes. These are thin authed proxies in
// front of the become-ai graph: they verify the caller, shape a compact grounding
// context (so the client can't make the graph do arbitrary work), then call the
// graph with a deterministic-friendly result. The webhook secret + read-back
// token live only in lib/ai/becomeGraph.ts (server env) and never reach here.

import { NextRequest, NextResponse } from 'next/server'
import jwt from 'jsonwebtoken'
import { verifyAuth } from '@/lib/auth'
import { assembleUserContext } from './userContext'

const JWT_SECRET = process.env.JWT_SECRET || ''

/**
 * Mint a SHORT-LIVED (15 min) token scoped to this user for the graph to call
 * back into Become on the user's behalf (MCP/data tools). Deliberately short
 * because it rides in the webhook body, which lands in run state (Redis ~1h).
 * It verifies through the normal verifyAuth (userId) and only ever reaches GET
 * data endpoints via the become MCP tools, so it's effectively read-scoped; the
 * `scope` claim is there for future server-side enforcement.
 */
export function mintToolToken(userId: string, email?: string): string | undefined {
  if (!JWT_SECRET || !userId) return undefined
  try {
    return jwt.sign({ userId, email, scope: 'ai-tools' }, JWT_SECRET, { expiresIn: '15m' })
  } catch {
    return undefined
  }
}

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

/**
 * Build the `user` grounding for a graph call: a server-assembled, per-user
 * context summary (authoritative) merged with any extra fields the client sent.
 * This is the Layer-1 "push" — every AI call gets a cheap baseline of who the
 * user is without the model having to tool-call for it.
 */
export async function userGrounding(
  userId: string,
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const client = (body.grounding && typeof body.grounding === 'object' ? body.grounding : {}) as Record<string, unknown>
  try {
    const ctx = await assembleUserContext(userId)
    return { ...ctx, ...client }
  } catch {
    return client
  }
}
