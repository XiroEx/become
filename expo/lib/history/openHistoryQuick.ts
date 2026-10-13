/**
 * REOPEN A COMPLETED QUICK SESSION FROM HISTORY (NP-112).
 *
 * Native port of the history row's tap path in
 * `webapp/app/dashboard/history/HistoryClient.tsx` (l.212-225) combined with
 * the hub's `openSession` (`webapp/app/dashboard/workout/hub/HubClient.tsx`
 * l.322-379):
 *
 *   - a completed quick session reopens as a REPEAT under a FRESH sessionId
 *     (`stashQuickSession` with `sourceSessionId` + `favorite` carried over),
 *     so finishing the repeat can never overwrite the historical log it was
 *     copied from. The overview opens WITHOUT `saved=1` — the draft does not
 *     exist server-side under this id.
 *   - a log with no stored exercises (a very old log) falls back to
 *     generating a fresh session from its focus — the hub's old behaviour,
 *     kept so the row always opens something.
 *   - an INCOMPLETE quick session is a resume, not a repeat: the draft is
 *     rebuilt under its OWN sessionId (`rebuildQuickSession`, the native port
 *     of `continueQuickSession`) and the overview opens WITH `saved=1` +
 *     `started=1`, so finishing consumes the same log.
 *
 * Fail-soft like the web: null, never a throw.
 */

import type { DraftExercise } from "@become/core";
import {
  quickSessionOverviewHref,
  stashQuickSession,
  type DraftSession,
} from "@/lib/quickSession/store";
import { rebuildQuickSession } from "@/lib/quickSession/rebuild";
import {
  defaultSessionParams,
  generateSession,
} from "@/lib/programs/generate";

export interface HistoryQuickLog {
  sessionId?: string;
  title: string;
  focus?: string;
  favorite?: boolean;
  completed?: boolean;
  exercises?: DraftExercise[] | null;
}

export interface OpenHistoryQuickDeps {
  /** Fetch implementation, threaded through to the generate call (tests). */
  fetchImpl?: typeof fetch;
  baseUrl?: string;
  getToken?: () => string | undefined;
}

function isFocusKey(value: unknown): value is string {
  return (
    typeof value === "string" &&
    [
      "full_body",
      "upper",
      "lower",
      "push",
      "pull",
      "legs",
      "glutes",
      "core",
      "arms",
      "chest",
      "back",
      "shoulders",
      "cardio",
    ].includes(value)
  );
}

function draftFor(log: HistoryQuickLog): DraftSession {
  return {
    title: log.title || "Quick Session",
    ...(isFocusKey(log.focus) ? { focus: log.focus } : {}),
    exercises: (log.exercises ?? []) as DraftExercise[],
    source: "saved",
  };
}

/**
 * Open a quick session from the history list. Returns the overview href to
 * push, or null when there is nothing to open.
 */
export async function openHistoryQuickSession(
  log: HistoryQuickLog,
  deps: OpenHistoryQuickDeps = {},
): Promise<string | null> {
  try {
    // Incomplete: resume the same log (the web's `continueQuickSession`).
    if (!log.completed) {
      if (!log.sessionId) return null;
      const rebuilt = await rebuildQuickSession(log.sessionId, {
        ...(deps.baseUrl ? { baseUrl: deps.baseUrl } : {}),
        ...(deps.getToken ? { getToken: deps.getToken } : {}),
        ...(deps.fetchImpl ? { fetchImpl: deps.fetchImpl } : {}),
      });
      if (!rebuilt) return null;
      return quickSessionOverviewHref(log.sessionId, {
        saved: true,
        started: true,
      });
    }

    // Completed with exercises on the log: reopen THAT session as a repeat.
    if (log.exercises?.length) {
      const id = await stashQuickSession(draftFor(log), {
        needsName: false,
        ...(log.sessionId ? { sourceSessionId: log.sessionId } : {}),
        ...(log.favorite ? { favorite: true } : {}),
      });
      return quickSessionOverviewHref(id);
    }

    // Legacy log with no stored exercises: generate a fresh session from its
    // focus (the hub's fallback), opened as an unnamed draft.
    const generated = await generateSession(
      {
        ...defaultSessionParams(),
        focus: isFocusKey(log.focus) ? log.focus : "full_body",
      },
      {
        ...(deps.fetchImpl ? { fetchImpl: deps.fetchImpl } : {}),
        ...(deps.baseUrl ? { baseUrl: deps.baseUrl } : {}),
        ...(deps.getToken ? { getToken: deps.getToken } : {}),
      },
    );
    const session = generated?.session;
    if (!session) return null;
    const id = await stashQuickSession(
      {
        title: session.title,
        ...(isFocusKey(session.focus) ? { focus: session.focus } : {}),
        exercises: (session.exercises ?? []) as DraftExercise[],
      },
      { needsName: true },
    );
    return quickSessionOverviewHref(id);
  } catch {
    return null;
  }
}
