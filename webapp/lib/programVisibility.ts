// "Can this member open this program?" — the ONE rule, so every route that
// loads a program by id answers it the same way.
//
// A catalogue program (isCustom falsy) is browsable by any authenticated
// member. A custom program belongs to whoever made it, and is visible to the
// members a trainer/admin shared it with (Program.sharedWith, written only by
// POST /api/programs/[programId]/share). Everybody else gets a 404, not a 403:
// the id itself should not confirm that the program exists.
//
// The rule was written out inline in GET /api/programs/[programId] and POST
// /api/programs/enroll (which keeps its own equivalent copy today), and was
// missing altogether from POST /api/share: that route loaded any program by
// `program_id` and published a public snapshot of it at
// /share/[shareId]. A custom program id is `custom-<user suffix>-<slug>-<base36
// timestamp>` (app/api/programs/custom/route.ts): hard to guess, never secret —
// it is in the URL of every program page the owner opens, and a member the
// program was shared with keeps it after the share is revoked. So any member
// holding one could make someone else's private program permanently public.
//
// A member can share only what they can open. Import this rather than writing
// the check again, so the next read path cannot quietly disagree with the rest.

/** The only fields the decision reads. Satisfied by a lean() doc or a full one. */
export interface ProgramVisibility {
  isCustom?: boolean | null
  createdBy?: { toString(): string } | string | null
  sharedWith?: ({ toString(): string } | string | null)[] | null
}

export function canMemberOpenProgram(
  program: ProgramVisibility,
  userId?: string | null,
): boolean {
  // Catalogue programs are the shared library — visible to every member.
  if (!program.isCustom) return true
  if (!userId) return false
  if (program.createdBy != null && program.createdBy.toString() === userId) return true
  return (program.sharedWith ?? []).some((id) => id != null && id.toString() === userId)
}
