/**
 * The local `exp` check — the only session check that works offline.
 *
 * It mirrors webapp/components/AuthGuard.tsx: a token whose `exp` has passed,
 * one that carries no `exp`, and one that cannot be decoded are all treated as
 * expired. Everything else is trusted without asking the server.
 */
import { decodeJwtPayload, isJwtExpired, jwtExpiresAtMs } from "@/lib/auth/jwt";

const NOW = Date.UTC(2026, 8, 29, 12, 0, 0);

function jwt(payload: Record<string, unknown>): string {
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString(
    "base64url",
  );
  return `eyJhbGciOiJIUzI1NiJ9.${body}.sig`;
}

describe("decodeJwtPayload", () => {
  it("reads a base64url payload, padding and all", () => {
    // `~` and `?` push the encoding into the - and _ characters plain base64
    // never produces; a decoder that forgets them drops valid sessions.
    const payload = { userId: "u1", email: "jo+n@example.com", nudge: "??~~~" };
    const token = jwt(payload);
    // Sanity check on the fixture: if this payload did not encode with the
    // URL-safe characters, the assertion below would prove nothing.
    expect(token.split(".")[1]).toMatch(/[-_]/);
    expect(decodeJwtPayload(token)).toEqual(payload);
  });

  it("reads non-ASCII claims as UTF-8", () => {
    expect(decodeJwtPayload(jwt({ name: "Jón Dòn 🏋" }))).toEqual({
      name: "Jón Dòn 🏋",
    });
  });

  it("returns null instead of throwing on junk", () => {
    expect(decodeJwtPayload("not-a-jwt")).toBeNull();
    expect(decodeJwtPayload("a.!!!!.c")).toBeNull();
    expect(decodeJwtPayload("")).toBeNull();
  });
});

describe("jwtExpiresAtMs", () => {
  it("converts the seconds claim to milliseconds", () => {
    expect(jwtExpiresAtMs(jwt({ exp: 1800000000 }))).toBe(1800000000000);
  });

  it("is null when there is no usable exp", () => {
    expect(jwtExpiresAtMs(jwt({ userId: "u1" }))).toBeNull();
    expect(jwtExpiresAtMs(jwt({ exp: "soon" }))).toBeNull();
  });
});

describe("isJwtExpired", () => {
  it("is false while the token still has time on it", () => {
    expect(isJwtExpired(jwt({ exp: NOW / 1000 + 60 }), NOW)).toBe(false);
  });

  it("is true at and after the exp instant", () => {
    expect(isJwtExpired(jwt({ exp: NOW / 1000 }), NOW)).toBe(true);
    expect(isJwtExpired(jwt({ exp: NOW / 1000 - 1 }), NOW)).toBe(true);
  });

  it("treats a token with no exp, or an unreadable one, as expired", () => {
    expect(isJwtExpired(jwt({ userId: "u1" }), NOW)).toBe(true);
    expect(isJwtExpired("header.payload.signature", NOW)).toBe(true);
  });
});
