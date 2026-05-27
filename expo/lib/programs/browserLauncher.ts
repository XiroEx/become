import * as WebBrowser from "expo-web-browser";

/**
 * Tier-3 deep-link helper: opens a webapp URL in an in-app browser so
 * heavy editors stay web-only without booting the user out of the native app.
 *
 * Pluggable for tests via the `launcher` arg.
 */
export type BrowserLauncher = (url: string) => Promise<unknown>;

export const defaultBrowserLauncher: BrowserLauncher = (url) =>
  WebBrowser.openBrowserAsync(url);

export const WEBAPP_BASE_URL = "https://become.redbtn.io";

export function programEditUrl(programId: string): string {
  return `${WEBAPP_BASE_URL}/dashboard/programming/${encodeURIComponent(programId)}/edit`;
}

export async function openProgramEditInBrowser(
  programId: string,
  launcher: BrowserLauncher = defaultBrowserLauncher,
): Promise<void> {
  await launcher(programEditUrl(programId));
}
