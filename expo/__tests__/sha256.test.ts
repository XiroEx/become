/**
 * THE ONE HASH THE NATIVE SIGN-IN RESTS ON (NP-126).
 *
 * The challenge the app sends is the SHA-256 of a verifier it keeps, and the
 * server compares it against the SHA-256 it computes with Node's crypto
 * (webapp/models/AppAuthCode.ts#hashAppAuthVerifier). If the two disagree by one
 * byte, every Google sign-in from the app ends in 400 and nothing says why. So
 * this drives the plain-TypeScript implementation against:
 *
 *   1. the published FIPS 180-4 / NIST vectors;
 *   2. NODE'S OWN crypto, on random inputs and on every length that exercises
 *      the padding boundaries (55, 56, 63, 64, 119, 120 bytes) — which is where
 *      a hand-written SHA-256 goes wrong, and quietly.
 *
 * Node's crypto is available here because Jest runs on Node; it is NOT available
 * on a phone, which is the whole reason this implementation exists.
 */
import crypto from "crypto";
import {
  bytesToBase64Url,
  bytesToHex,
  sha256Base64Url,
  sha256Bytes,
  utf8Bytes,
} from "@/lib/auth/sha256";

const nodeHex = (input: string): string =>
  crypto.createHash("sha256").update(input, "utf8").digest("hex");
const nodeBase64Url = (input: string): string =>
  crypto.createHash("sha256").update(input, "utf8").digest("base64url");

describe("sha256", () => {
  it("matches the published vectors", () => {
    expect(bytesToHex(sha256Bytes(""))).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
    expect(bytesToHex(sha256Bytes("abc"))).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
    expect(
      bytesToHex(
        sha256Bytes(
          "abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq",
        ),
      ),
    ).toBe("248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1");
  });

  it("agrees with Node's crypto on the padding boundaries", () => {
    // 55/56 and 119/120 are where the 64-byte block and the 8-byte length field
    // collide. A wrong block count passes every short test and fails here.
    for (const length of [0, 1, 54, 55, 56, 57, 63, 64, 65, 118, 119, 120, 121, 1000]) {
      const input = "a".repeat(length);
      expect(bytesToHex(sha256Bytes(input))).toBe(nodeHex(input));
    }
  });

  it("agrees with Node's crypto on random inputs", () => {
    for (let i = 0; i < 25; i += 1) {
      const input = crypto.randomBytes(1 + (i % 97)).toString("base64url");
      expect(bytesToHex(sha256Bytes(input))).toBe(nodeHex(input));
    }
  });

  it("hashes text that is not ASCII the same way too", () => {
    for (const input of ["héllo", "日本語", "a👍b", "\u0000\u007f"]) {
      expect(bytesToHex(sha256Bytes(input))).toBe(nodeHex(input));
    }
  });

  it("encodes UTF-8 including surrogate pairs", () => {
    expect([...utf8Bytes("A")]).toEqual([0x41]);
    expect([...utf8Bytes("é")]).toEqual([0xc3, 0xa9]);
    expect([...utf8Bytes("€")]).toEqual([0xe2, 0x82, 0xac]);
    // U+1F44D, one code point written as a surrogate pair in JS.
    expect([...utf8Bytes("👍")]).toEqual([0xf0, 0x9f, 0x91, 0x8d]);
  });
});

describe("base64url", () => {
  it("is Node's base64url, padding and all three remainders", () => {
    for (let length = 0; length <= 40; length += 1) {
      const bytes = crypto.randomBytes(length);
      expect(bytesToBase64Url(new Uint8Array(bytes))).toBe(
        bytes.toString("base64url"),
      );
    }
  });

  it("never emits padding or a character that changes meaning in a URL", () => {
    for (let i = 0; i < 50; i += 1) {
      const encoded = bytesToBase64Url(new Uint8Array(crypto.randomBytes(32)));
      expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
      expect(encoded).toHaveLength(43);
    }
  });
});

describe("the challenge the server will check", () => {
  it("is exactly what hashAppAuthVerifier produces", () => {
    // The literal in webapp/tests/unit/auth/appAuthCode.test.ts, hashed here.
    expect(sha256Base64Url("become-np-126")).toBe(nodeBase64Url("become-np-126"));
    for (let i = 0; i < 20; i += 1) {
      const verifier = crypto.randomBytes(32).toString("base64url");
      expect(sha256Base64Url(verifier)).toBe(nodeBase64Url(verifier));
      // 32 bytes of digest in base64url — the shape the server's
      // isAppAuthChallenge() accepts, and nothing else.
      expect(sha256Base64Url(verifier)).toMatch(/^[A-Za-z0-9_-]{43}$/);
    }
  });
});
