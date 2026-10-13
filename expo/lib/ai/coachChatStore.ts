/**
 * ─── COACH CHAT THREAD PERSISTENCE (NP-155) ────────────────────────────────
 *
 * Web equivalent: `webapp/components/ai/CoachChat.tsx:62-98` persists the
 * thread (messages + in-flight runId) to `localStorage` under
 * `become.chat.<persistKey>` — keyed by CHAT ONLY, so two members signed in
 * on the same browser share a thread.
 *
 * Native fixes that: the key is scoped to the signed-in MEMBER as well as the
 * chat (`become.chat.<memberId>.<persistKey>`), and the whole family of keys
 * is swept on sign-out (`clearAllCoachChats`, called from
 * `lib/auth/AuthProvider.tsx`'s sign-out cleanup) — a member who signs out
 * and another signs in on the same phone never resumes a thread that was not
 * theirs.
 *
 * A thread that cannot be attributed to a member (anonymous / no token yet)
 * is not persisted at all — there is nothing durable to key it by, and
 * writing it under a shared "anon" bucket would reproduce the exact bug this
 * exists to fix.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import type { AsyncStorageLike } from "@/lib/query/persistor";

export const COACH_CHAT_KEY_PREFIX = "become.chat.";

export interface ChatMessage {
  role: "user" | "assistant";
  text: string;
}

export interface PersistedCoachChat {
  messages: ChatMessage[];
  pendingRunId: string | null;
}

/** `become.chat.<memberId>.<persistKey>` — null for an unattributable thread. */
export function coachChatStorageKey(
  persistKey: string,
  memberId: string | null | undefined,
): string | null {
  if (!memberId) return null;
  return `${COACH_CHAT_KEY_PREFIX}${memberId}.${persistKey}`;
}

function isPersistedCoachChat(v: unknown): v is PersistedCoachChat {
  if (!v || typeof v !== "object") return false;
  const r = v as Record<string, unknown>;
  return (
    Array.isArray(r.messages) &&
    (r.pendingRunId === null || typeof r.pendingRunId === "string" || r.pendingRunId === undefined)
  );
}

export async function loadCoachChat(
  persistKey: string,
  memberId: string | null | undefined,
  storage: AsyncStorageLike = AsyncStorage,
): Promise<PersistedCoachChat | null> {
  const key = coachChatStorageKey(persistKey, memberId);
  if (!key) return null;
  try {
    const raw = await storage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!isPersistedCoachChat(parsed) || parsed.messages.length === 0) return null;
    return {
      messages: parsed.messages,
      pendingRunId: typeof parsed.pendingRunId === "string" ? parsed.pendingRunId : null,
    };
  } catch {
    return null;
  }
}

export async function saveCoachChat(
  persistKey: string,
  memberId: string | null | undefined,
  data: PersistedCoachChat,
  storage: AsyncStorageLike = AsyncStorage,
): Promise<void> {
  const key = coachChatStorageKey(persistKey, memberId);
  if (!key) return;
  try {
    await storage.setItem(key, JSON.stringify(data));
  } catch {
    // Storage quota / unavailable — non-fatal, same as the web's try/catch.
  }
}

export async function clearCoachChat(
  persistKey: string,
  memberId: string | null | undefined,
  storage: AsyncStorageLike = AsyncStorage,
): Promise<void> {
  const key = coachChatStorageKey(persistKey, memberId);
  if (!key) return;
  try {
    await storage.removeItem(key);
  } catch {
    // Fail soft.
  }
}

/** Does this key belong to a coach chat thread? Used by the sign-out sweep. */
export function isCoachChatKey(key: string): boolean {
  return key.startsWith(COACH_CHAT_KEY_PREFIX);
}

/**
 * Wipe every coach chat thread on this device, for every member. Called from
 * the sign-out cleanup (`AuthProvider.tsx`) so the next person to sign in on
 * this phone never opens somebody else's conversation with their coach.
 */
export async function clearAllCoachChats(
  storage: AsyncStorageLike = AsyncStorage,
): Promise<void> {
  try {
    if (typeof storage.getAllKeys === "function") {
      const keys = await storage.getAllKeys();
      const mine = keys.filter(isCoachChatKey);
      if (mine.length === 0) return;
      if (typeof storage.multiRemove === "function") {
        await storage.multiRemove(mine);
        return;
      }
      await Promise.all(mine.map((k) => storage.removeItem(k).catch(() => {})));
    }
  } catch {
    // Fail soft.
  }
}
