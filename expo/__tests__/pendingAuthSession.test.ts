import {
  createPendingSessionStore,
  isPendingSessionExpired,
  AUTH_LINK_MAX_AGE_MS,
  type PendingAuthSession,
} from "@/lib/auth/pendingAuthSession";
import { createMemoryTokenStore } from "@/lib/auth/secureStoreToken";

describe("pendingAuthSession", () => {
  describe("createPendingSessionStore", () => {
    it("returns null when no session is stored", async () => {
      const store = createPendingSessionStore(createMemoryTokenStore());
      expect(await store.get()).toBeNull();
    });

    it("round-trips a valid pending session", async () => {
      const memory = createMemoryTokenStore();
      const store = createPendingSessionStore(memory);
      const session: PendingAuthSession = {
        sessionId: "sess-abc-123",
        email: "member@example.com",
        mode: "register",
        startedAt: 1775000000000,
      };

      await store.set(session);
      const retrieved = await store.get();
      expect(retrieved).toEqual(session);
    });

    it("normalizes an ISO string startedAt to a timestamp number", async () => {
      const memory = createMemoryTokenStore();
      const iso = "2026-09-30T12:00:00.000Z";
      await memory.set(
        JSON.stringify({
          sessionId: "sess-iso",
          email: "iso@example.com",
          mode: "login",
          startedAt: iso,
        }),
      );

      const store = createPendingSessionStore(memory);
      const retrieved = await store.get();
      expect(retrieved).toEqual({
        sessionId: "sess-iso",
        email: "iso@example.com",
        mode: "login",
        startedAt: new Date(iso).getTime(),
      });
    });

    it("returns null for malformed JSON or missing fields", async () => {
      const memory = createMemoryTokenStore();
      const store = createPendingSessionStore(memory);

      await memory.set("invalid-json{");
      expect(await store.get()).toBeNull();

      await memory.set(JSON.stringify({ sessionId: "s1" })); // missing email, mode, startedAt
      expect(await store.get()).toBeNull();

      await memory.set(
        JSON.stringify({
          sessionId: "s1",
          email: "a@b.com",
          mode: "invalid-mode",
          startedAt: 12345,
        }),
      );
      expect(await store.get()).toBeNull();
    });

    it("clear() removes the stored session", async () => {
      const memory = createMemoryTokenStore();
      const store = createPendingSessionStore(memory);
      await store.set({
        sessionId: "sess-1",
        email: "a@b.com",
        mode: "login",
        startedAt: Date.now(),
      });
      expect(await store.get()).not.toBeNull();

      await store.clear();
      expect(await store.get()).toBeNull();
      expect(await memory.get()).toBeNull();
    });
  });

  describe("isPendingSessionExpired", () => {
    const startedAt = 1000000;
    const session: PendingAuthSession = {
      sessionId: "s1",
      email: "a@b.com",
      mode: "login",
      startedAt,
    };

    it("is false when within 15 minutes", () => {
      expect(
        isPendingSessionExpired(session, startedAt + AUTH_LINK_MAX_AGE_MS - 1),
      ).toBe(false);
      expect(isPendingSessionExpired(session, startedAt + 60 * 1000)).toBe(
        false,
      );
    });

    it("is true at exactly 15 minutes or later", () => {
      expect(
        isPendingSessionExpired(session, startedAt + AUTH_LINK_MAX_AGE_MS),
      ).toBe(true);
      expect(
        isPendingSessionExpired(session, startedAt + AUTH_LINK_MAX_AGE_MS + 1000),
      ).toBe(true);
    });
  });
});
