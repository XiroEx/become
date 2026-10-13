/**
 * ─── THE LOCAL DRAFT (NP-168) ────────────────────────────────────────────────
 *
 * The web builder mirrors its form into localStorage on every keystroke under
 * `become_user_program_creator_draft` (`DRAFT_KEY_BY_MODE` in
 * `ProgramCreator.tsx`) and restores it on mount, so a reloaded tab does not
 * lose a half-built program. The phone needs the same thing for a harder
 * reason: a backgrounded app is KILLED by the OS without warning and without
 * an unload event, so anything held only in React state is gone.
 *
 * Hence: AsyncStorage, written after every change, read before the first
 * paint, deleted the moment the program is saved to the server.
 *
 * THREE RULES:
 *
 *   • the CREATE draft is restored, the EDIT draft is not — the web does
 *     exactly this (its edit modes bail out of both effects), because on an
 *     edit the server's copy is the truth and a stale local one would quietly
 *     revert a change made on another device.
 *   • a draft is the member's own typing, so it goes with the session:
 *     `clearAllProgramDrafts()` runs from the sign-out cleanup alongside the
 *     live-workout drafts (`AuthProvider`), or the next person to sign in on
 *     this phone is handed someone else's unfinished program.
 *   • every path FAILS SOFT. A full disk, a parse error or a draft from an
 *     older shape all read as "no draft": losing a draft is a disappointment,
 *     and a builder that will not open because of one is a bug.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import type { AsyncStorageLike } from "@/lib/query/persistor";
import {
  type ProgramBuilderState,
  emptyProgramBuilderState,
  fromCustomProgram,
  hasBuilderContent,
} from "@/lib/programs/programBuilder";

/**
 * The web's own key, letter for letter
 * (`webapp/app/dashboard/programs/new/NewProgramClient.tsx` names the same
 * string). One concept, one name, on both clients.
 */
export const PROGRAM_CREATE_DRAFT_KEY = "become_user_program_creator_draft";

/** The web's edit-mode key, scoped per program because the phone has routes. */
export const PROGRAM_EDIT_DRAFT_KEY_PREFIX =
  "become_user_program_creator_draft_edit";

/** Bumped when the stored shape changes; an older envelope reads as no draft. */
export const PROGRAM_DRAFT_VERSION = 1;

export interface ProgramDraftEnvelope {
  v: number;
  savedAt: number;
  state: ProgramBuilderState;
}

export interface ProgramDraft {
  savedAt: number;
  state: ProgramBuilderState;
}

export function programEditDraftKey(programId: string): string {
  return `${PROGRAM_EDIT_DRAFT_KEY_PREFIX}.${programId}`;
}

export function programDraftKey(
  mode: "create" | "edit",
  programId?: string | null,
): string {
  if (mode === "edit" && programId) return programEditDraftKey(programId);
  return PROGRAM_CREATE_DRAFT_KEY;
}

export function serializeProgramDraft(
  state: ProgramBuilderState,
  now: number = Date.now(),
): string {
  const envelope: ProgramDraftEnvelope = {
    v: PROGRAM_DRAFT_VERSION,
    savedAt: now,
    state,
  };
  return JSON.stringify(envelope);
}

/**
 * Read one stored draft. Anything unrecognisable — a different version, a
 * truncated write, the raw form the web stores — comes back as null, except
 * that a bare state object IS accepted: it is what a future writer is most
 * likely to produce, and `fromCustomProgram` normalises it into a state the
 * screen can render regardless.
 */
export function parseProgramDraft(raw: string | null): ProgramDraft | null {
  if (!raw) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const record = parsed as Record<string, unknown>;

  const envelope =
    typeof record.v === "number" && record.state && typeof record.state === "object"
      ? record
      : null;
  if (envelope) {
    if (envelope.v !== PROGRAM_DRAFT_VERSION) return null;
    const state = fromCustomProgram(envelope.state);
    return {
      savedAt: typeof envelope.savedAt === "number" ? envelope.savedAt : 0,
      state,
    };
  }

  // A bare state / program-shaped object.
  if (!Array.isArray(record.phases)) return null;
  return { savedAt: 0, state: fromCustomProgram(record) };
}

export interface ProgramDraftStore {
  key: string;
  load(): Promise<ProgramDraft | null>;
  save(state: ProgramBuilderState): Promise<void>;
  clear(): Promise<void>;
}

/**
 * A draft store over AsyncStorage (or any `AsyncStorageLike`, which is how the
 * tests hand it an in-memory one and then read what survived).
 *
 * `save` writes nothing while the program is still blank — an empty draft is
 * litter, and it would also mean every visit to the builder "restored" one.
 */
export function createProgramDraftStore(
  key: string = PROGRAM_CREATE_DRAFT_KEY,
  storage: AsyncStorageLike = AsyncStorage,
  now: () => number = Date.now,
): ProgramDraftStore {
  /**
   * `clear()` is FINAL for this store. It is called when the program has been
   * saved to the server, and a store lives as long as one visit to the
   * builder, so there is nothing left to protect — while a `save()` can still
   * be in flight behind it (an autosave queued before the response landed).
   * Without the latch that straggler writes the draft back seconds after the
   * program was created, and the next visit restores a copy of a program the
   * member already has.
   */
  let cleared = false;
  return {
    key,
    async load(): Promise<ProgramDraft | null> {
      try {
        return parseProgramDraft(await storage.getItem(key));
      } catch {
        return null;
      }
    },
    async save(state: ProgramBuilderState): Promise<void> {
      if (cleared) return;
      try {
        if (!hasBuilderContent(state)) {
          await storage.removeItem(key).catch(() => {});
          return;
        }
        await storage.setItem(key, serializeProgramDraft(state, now()));
      } catch {
        // Fail soft: a draft that cannot be written must not break the screen.
      }
    },
    async clear(): Promise<void> {
      cleared = true;
      try {
        await storage.removeItem(key);
      } catch {
        // Fail soft.
      }
    },
  };
}

/** Does this key belong to the program builder? Used by the sign-out sweep. */
export function isProgramDraftKey(key: string): boolean {
  return (
    key === PROGRAM_CREATE_DRAFT_KEY ||
    key.startsWith(`${PROGRAM_EDIT_DRAFT_KEY_PREFIX}.`)
  );
}

/**
 * Wipe every builder draft on this device. Called from the sign-out cleanup
 * (rule 2 above). Uses `getAllKeys` when the storage has it so a per-program
 * edit draft is swept too, and falls back to the one key that is always known.
 */
export async function clearAllProgramDrafts(
  storage: AsyncStorageLike = AsyncStorage,
): Promise<void> {
  try {
    if (typeof storage.getAllKeys === "function") {
      const keys = await storage.getAllKeys();
      const mine = keys.filter(isProgramDraftKey);
      if (mine.length === 0) return;
      if (typeof storage.multiRemove === "function") {
        await storage.multiRemove(mine);
        return;
      }
      await Promise.all(mine.map((k) => storage.removeItem(k).catch(() => {})));
      return;
    }
    await storage.removeItem(PROGRAM_CREATE_DRAFT_KEY);
  } catch {
    // Fail soft.
  }
}

/**
 * The state a create-mode builder should open with: the draft when there is
 * one, a blank program otherwise. Separate from the store so the decision is
 * testable without a screen.
 */
export function builderStateFromDraft(
  draft: ProgramDraft | null,
): ProgramBuilderState {
  if (draft && hasBuilderContent(draft.state)) return draft.state;
  return emptyProgramBuilderState();
}
