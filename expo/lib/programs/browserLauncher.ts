import * as WebBrowser from "expo-web-browser";

// Single source of truth lives in lib/config.ts; re-exported here for
// back-compat with existing imports of WEBAPP_BASE_URL from this module.
import { WEBAPP_BASE_URL } from "@/lib/config";

/**
 * Tier-3 deep-link helper: opens a webapp URL in an in-app browser so
 * heavy editors stay web-only without booting the user out of the native app.
 *
 * Pluggable for tests via the `launcher` arg.
 */
export type BrowserLauncher = (url: string) => Promise<unknown>;

export const defaultBrowserLauncher: BrowserLauncher = (url) =>
  WebBrowser.openBrowserAsync(url);

export { WEBAPP_BASE_URL };

export function programEditUrl(programId: string): string {
  return `${WEBAPP_BASE_URL}/dashboard/programming/${encodeURIComponent(programId)}/edit`;
}

export async function openProgramEditInBrowser(
  programId: string,
  launcher: BrowserLauncher = defaultBrowserLauncher,
): Promise<void> {
  await launcher(programEditUrl(programId));
}
