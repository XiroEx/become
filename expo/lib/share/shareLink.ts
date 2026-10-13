/**
 * ─── SHARE A PROGRAM, WORKOUT OR SESSION THROUGH THE SYSTEM SHEET (NP-165) ──
 *
 * Native port of `webapp/components/share/ShareButton.tsx`'s create half.
 * The web creates a public, read-only snapshot (`POST /api/share` →
 * `{ shareId, url }`) and offers copy + JSON export; natively the link goes
 * through React Native's `Share` (Messages, Mail and copy on iOS and
 * Android) and the public page stays on the web. JSON export stays web-only.
 *
 * The route answers `url` RELATIVE (`/share/<shareId>`); the sheet needs the
 * absolute URL on the web's domain, so `shareViewerUrl` prefixes
 * `WEBAPP_BASE_URL`. The public page needs no session — the link opens in a
 * browser signed out.
 *
 * `canShareProgram` is the client-side half of the visibility rule
 * (`webapp/lib/programVisibility.ts`): catalogue programs, the member's own
 * custom ones, and ones shared with them. The server re-checks and answers
 * 404 otherwise — the gate here only decides whether the button renders.
 */

import { Share } from "react-native";
import { apiFetch, ShareCreateResponseSchema } from "@become/api-client";
import type { ShareCreateRequest } from "@become/api-client";
import { WEBAPP_BASE_URL } from "@/lib/config";

export type ShareKind = ShareCreateRequest["kind"];

/** A program the visibility decision can read — the lean-doc subset. */
export interface ShareableProgram {
  isCustom?: boolean | null;
  /** ObjectId serialises to a string over the wire; populated docs nest it. */
  createdBy?: string | { toString(): string } | null;
  sharedWith?: (string | { toString(): string } | null)[] | null;
}

/**
 * "Can this member open this program?" — the client mirror of
 * `canMemberOpenProgram` (`webapp/lib/programVisibility.ts`). Catalogue
 * programs are the shared library (visible to every member); a custom
 * program belongs to whoever made it plus the members it was shared with.
 * Unknown shape (no detail loaded yet) reads as not-shareable so the button
 * never flashes on a program the member cannot see.
 */
export function canShareProgram(
  program: ShareableProgram | null | undefined,
  userId?: string | null,
): boolean {
  if (!program) return false;
  if (!program.isCustom) return true;
  if (!userId) return false;
  if (program.createdBy != null && program.createdBy.toString() === userId)
    return true;
  return (program.sharedWith ?? []).some(
    (id) => id != null && id.toString() === userId,
  );
}

/**
 * The absolute public URL for a `POST /api/share` relative `url`
 * (`/share/<shareId>`). Pass-through when the server already answered
 * absolute, so a future server change cannot double the origin.
 */
export function shareViewerUrl(relativeOrAbsoluteUrl: string): string {
  if (/^https?:\/\//i.test(relativeOrAbsoluteUrl)) return relativeOrAbsoluteUrl;
  const path = relativeOrAbsoluteUrl.startsWith("/")
    ? relativeOrAbsoluteUrl
    : `/${relativeOrAbsoluteUrl}`;
  return `${WEBAPP_BASE_URL.replace(/\/$/, "")}${path}`;
}

export interface ShareLinkDeps {
  baseUrl?: string;
  getToken?: () => string | undefined | Promise<string | undefined>;
  /** `Share.share` seam — the real sheet in the app, a spy in tests. */
  shareImpl?: typeof Share.share;
}

/**
 * Create the snapshot and open the system share sheet with the absolute
 * public URL. Returns the URL that was shared; throws the `apiFetch` error
 * (notably the server's 404 for a program the member cannot open) when the
 * create fails. A dismissed sheet is not an error — it resolves silently.
 */
export async function shareLink(
  body: ShareCreateRequest,
  deps: ShareLinkDeps = {},
): Promise<string> {
  const created = await apiFetch("/api/share", ShareCreateResponseSchema, {
    method: "POST",
    body,
    baseUrl: deps.baseUrl ?? WEBAPP_BASE_URL,
    ...(deps.getToken ? { getToken: deps.getToken } : {}),
  });
  const url = shareViewerUrl(created.url);
  const share = deps.shareImpl ?? Share.share;
  await share({ message: url, url });
  return url;
}
