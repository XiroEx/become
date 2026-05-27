/**
 * Pure parsers for verify-magic-link deep links.
 *
 * Supported shapes:
 *   - `become://verify?token=ABC&mode=login`
 *   - `become://verify?token=ABC&mode=register`
 *   - `https://become.redbtn.io/verify?token=ABC&mode=login` (Universal Link)
 *
 * Returns `null` for any URL that is not a recognisable verify link.
 */
export type VerifyMode = "login" | "register";

export interface VerifyDeepLink {
  token: string;
  mode: VerifyMode;
}

const ALLOWED_HOSTS = new Set(["become.redbtn.io"]);

export function parseVerifyDeepLink(url: string): VerifyDeepLink | null {
  if (!url || typeof url !== "string") return null;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  // Custom scheme: become://verify?token=...&mode=...
  // Universal link: https://become.redbtn.io/verify?token=...&mode=...
  const scheme = parsed.protocol.replace(":", "");
  if (scheme === "become") {
    if (parsed.hostname !== "verify" && parsed.pathname !== "/verify") return null;
  } else if (scheme === "https") {
    if (!ALLOWED_HOSTS.has(parsed.hostname)) return null;
    if (parsed.pathname !== "/verify") return null;
  } else {
    return null;
  }
  const token = parsed.searchParams.get("token");
  const mode = parsed.searchParams.get("mode");
  if (!token) return null;
  if (mode !== "login" && mode !== "register") return null;
  return { token, mode };
}
