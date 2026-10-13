import type { AuthMode } from "@become/api-client";
import {
  SECURE_STORE_KEYS,
  createSecureStore,
  type TokenStore,
} from "@/lib/auth/secureStoreToken";

/**
 * State persisted when an email magic link is sent.
 * Saved to SecureStore so if iOS terminates the app while the user is in Mail,
 * relaunching restores the waiting state and resumes polling until verified,
 * expired, or 15 minutes old.
 */
export interface PendingAuthSession {
  sessionId: string;
  email: string;
  mode: AuthMode;
  startedAt: number;
}

/**
 * Magic links expire after 15 minutes (mirrors webapp and server).
 */
export const AUTH_LINK_MAX_AGE_MS = 15 * 60 * 1000;

/**
 * Checks whether a pending session is 15 minutes old or older.
 */
export function isPendingSessionExpired(
  session: PendingAuthSession,
  nowMs: number = Date.now(),
): boolean {
  return nowMs - session.startedAt >= AUTH_LINK_MAX_AGE_MS;
}

export interface PendingSessionStore {
  get(): Promise<PendingAuthSession | null>;
  set(session: PendingAuthSession): Promise<void>;
  clear(): Promise<void>;
}

/**
 * Creates a JSON-serializing store around a TokenStore (defaults to SecureStore).
 */
export function createPendingSessionStore(
  tokenStore: TokenStore = createSecureStore(
    SECURE_STORE_KEYS.pendingAuthSession,
  ),
): PendingSessionStore {
  return {
    async get(): Promise<PendingAuthSession | null> {
      try {
        const raw = await tokenStore.get();
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (
          parsed &&
          typeof parsed === "object" &&
          typeof parsed.sessionId === "string" &&
          typeof parsed.email === "string" &&
          (parsed.mode === "login" || parsed.mode === "register") &&
          (typeof parsed.startedAt === "number" ||
            typeof parsed.startedAt === "string")
        ) {
          const startedAt =
            typeof parsed.startedAt === "number"
              ? parsed.startedAt
              : new Date(parsed.startedAt).getTime();
          if (isNaN(startedAt)) return null;
          return {
            sessionId: parsed.sessionId,
            email: parsed.email,
            mode: parsed.mode,
            startedAt,
          };
        }
        return null;
      } catch {
        return null;
      }
    },
    async set(session: PendingAuthSession): Promise<void> {
      try {
        await tokenStore.set(JSON.stringify(session));
      } catch {
        // SecureStore write failed, do not throw
      }
    },
    async clear(): Promise<void> {
      try {
        await tokenStore.clear();
      } catch {
        // SecureStore clear failed, do not throw
      }
    },
  };
}

export const defaultPendingSessionStore = createPendingSessionStore();
