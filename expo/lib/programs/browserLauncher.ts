// Single source of truth lives in lib/config.ts; re-exported here for
// back-compat with existing imports of WEBAPP_BASE_URL from this module.
import { WEBAPP_BASE_URL } from "@/lib/config";

/**
 * Tier-3 deep-link helper: opens a webapp URL in an in-app browser so
 * heavy editors stay web-only without booting the user out of the native app.
 *
 * Pluggable for tests via the `launcher` arg.
 *
 * @deprecated Import from `@/lib/web/browserLauncher` (the type and the
 * default launcher) and `@/lib/config` (WEBAPP_BASE_URL) instead. The
 * program-editor links moved to `@/lib/programs/customPrograms` and open
 * signed-in through `openWebSignedIn` (NP-121). This module stays until its
 * last importer moves; `programEditUrl` / `openProgramEditInBrowser` below
 * point at a route that does not exist.
 */
import {
  defaultBrowserLauncher,
  type BrowserLauncher,
} from "@/lib/web/browserLauncher";

export { defaultBrowserLauncher, type BrowserLauncher, WEBAPP_BASE_URL };

/**
 * @deprecated Use `customProgramEditPath` from
 * `@/lib/programs/customPrograms` with `openWebSignedIn` instead. Kept so
 * existing imports keep compiling until they move.
 */
export function programEditUrl(programId: string): string {
  return `${WEBAPP_BASE_URL}/dashboard/programs/${encodeURIComponent(programId)}/edit`;
}

/**
 * @deprecated Use `openWebSignedIn` with `customProgramEditPath` from
 * `@/lib/programs/customPrograms` instead. Kept so existing imports keep
 * compiling until they move.
 */
export async function openProgramEditInBrowser(
  programId: string,
  launcher: BrowserLauncher = defaultBrowserLauncher,
): Promise<void> {
  await launcher(programEditUrl(programId));
}
