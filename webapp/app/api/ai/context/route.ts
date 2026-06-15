// GET /api/ai/context
// Returns the compact per-user context summary the AI layer grounds on (streak,
// last workout, adherence, mood trend, program, nutrition vs goals, identity,
// mission, recent wins). Same assembler the AI routes push into the graph and the
// Become MCP server will expose as `become_get_context`. Strictly scoped to the
// authenticated user.

import { NextRequest, NextResponse } from 'next/server'
import { assembleUserContext } from '@/lib/ai/userContext'
import { requireAiUser } from '@/lib/ai/routeHelpers'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const gate = await requireAiUser(request)
  if (!gate.user) return gate.res
  const context = await assembleUserContext(gate.user.userId)
  return NextResponse.json({ ok: true, context })
}
