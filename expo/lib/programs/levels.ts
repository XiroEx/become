/**
 * The five `target_user` values the web's level filter (and now every
 * program-browse card) recognises. Shared here so native code that narrows a
 * raw `target_user` string — the filter panel in ProgramsCatalog.tsx AND the
 * browse-card mapping in programSummary.ts — can't drift apart on which
 * values are "known".
 *
 * NP-278: the mapping used to recognise only 3 of these 5 ("Beginner",
 * "Intermediate", "Advanced"), so any program whose `target_user` was
 * "Beginner to Intermediate" or "Intermediate to Advanced" had its level line
 * silently dropped on native while the web rendered it unconditionally.
 */
export const BROWSE_LEVELS = [
  "Beginner",
  "Intermediate",
  "Advanced",
  "Beginner to Intermediate",
  "Intermediate to Advanced",
] as const;

export type BrowseLevel = (typeof BROWSE_LEVELS)[number];
