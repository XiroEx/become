import { parseVerifyDeepLink } from "@/lib/auth/deepLinkHandler";

describe("parseVerifyDeepLink", () => {
  it("parses become://verify?token=...&mode=login", () => {
    expect(
      parseVerifyDeepLink("become://verify?token=abc123&mode=login"),
    ).toEqual({ token: "abc123", mode: "login" });
  });

  it("parses become://verify?token=...&mode=register", () => {
    expect(
      parseVerifyDeepLink("become://verify?token=xyz&mode=register"),
    ).toEqual({ token: "xyz", mode: "register" });
  });

  it("parses https://become.redbtn.io/verify Universal Link", () => {
    expect(
      parseVerifyDeepLink(
        "https://become.redbtn.io/verify?token=zzz&mode=login",
      ),
    ).toEqual({ token: "zzz", mode: "login" });
  });

  it("returns null when token is missing", () => {
    expect(parseVerifyDeepLink("become://verify?mode=login")).toBeNull();
  });

  it("returns null when mode is missing", () => {
    expect(parseVerifyDeepLink("become://verify?token=abc")).toBeNull();
  });

  it("returns null when mode is unknown", () => {
    expect(
      parseVerifyDeepLink("become://verify?token=abc&mode=evil"),
    ).toBeNull();
  });

  it("returns null for the wrong custom scheme", () => {
    expect(
      parseVerifyDeepLink("someotherapp://verify?token=abc&mode=login"),
    ).toBeNull();
  });

  it("returns null for an https Universal Link on the wrong host", () => {
    expect(
      parseVerifyDeepLink(
        "https://attacker.example.com/verify?token=abc&mode=login",
      ),
    ).toBeNull();
  });

  it("returns null for malformed input", () => {
    expect(parseVerifyDeepLink("not a url")).toBeNull();
    expect(parseVerifyDeepLink("")).toBeNull();
  });
});
