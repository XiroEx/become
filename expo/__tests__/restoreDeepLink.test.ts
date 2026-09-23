import { parseRestoreDeepLink } from "@/lib/account/restoreDeepLink";

/**
 * "The restore link works whether it opens in the app or a browser" is one
 * acceptance criterion with three code paths behind it: a Universal Link on
 * iOS, an autoVerify intent filter on Android, and the custom scheme when
 * neither association has been verified yet. All three arrive here as a string.
 *
 * The important cases are the negative ones. A parser that accepted
 * `https://evil.test/account/restore?u=…&t=…` would let any page on the
 * internet hand the app a link to act on.
 */
describe("parseRestoreDeepLink", () => {
  const U = "68f0000000000000000000aa";
  const T = "a".repeat(32);

  it("parses a universal link", () => {
    expect(
      parseRestoreDeepLink(
        `https://become.redbtn.io/account/restore?u=${U}&t=${T}`,
      ),
    ).toEqual({ userId: U, token: T });
  });

  it("parses the custom scheme, in both shapes mail clients mint", () => {
    expect(
      parseRestoreDeepLink(`become://account/restore?u=${U}&t=${T}`),
    ).toEqual({ userId: U, token: T });
    expect(
      parseRestoreDeepLink(`become:///account/restore?u=${U}&t=${T}`),
    ).toEqual({ userId: U, token: T });
  });

  it("accepts the beta and launch hosts, which serve the same app", () => {
    for (const host of [
      "become-beta.redbtn.io",
      "becomeurbest.com",
      "www.becomeurbest.com",
    ]) {
      expect(
        parseRestoreDeepLink(`https://${host}/account/restore?u=${U}&t=${T}`),
      ).toEqual({ userId: U, token: T });
    }
  });

  it("refuses a host we do not own, however right the path looks", () => {
    expect(
      parseRestoreDeepLink(`https://evil.test/account/restore?u=${U}&t=${T}`),
    ).toBeNull();
    // The suffix trick: a host that merely ENDS with ours.
    expect(
      parseRestoreDeepLink(
        `https://become.redbtn.io.evil.test/account/restore?u=${U}&t=${T}`,
      ),
    ).toBeNull();
  });

  it("refuses another path, another scheme, or a missing parameter", () => {
    expect(
      parseRestoreDeepLink(`https://become.redbtn.io/verify?u=${U}&t=${T}`),
    ).toBeNull();
    expect(
      parseRestoreDeepLink(`javascript:/account/restore?u=${U}&t=${T}`),
    ).toBeNull();
    expect(
      parseRestoreDeepLink(`https://become.redbtn.io/account/restore?u=${U}`),
    ).toBeNull();
    expect(
      parseRestoreDeepLink(`https://become.redbtn.io/account/restore?t=${T}`),
    ).toBeNull();
  });

  it("refuses anything that is not a URL at all", () => {
    expect(parseRestoreDeepLink("")).toBeNull();
    expect(parseRestoreDeepLink("not a url")).toBeNull();
    expect(parseRestoreDeepLink(null as unknown as string)).toBeNull();
  });

  it("tolerates a trailing slash, which some clients add", () => {
    expect(
      parseRestoreDeepLink(
        `https://become.redbtn.io/account/restore/?u=${U}&t=${T}`,
      ),
    ).toEqual({ userId: U, token: T });
  });
});
