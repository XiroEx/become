/**
 * Safari's `apple-itunes-app` meta tag (NP-205): the native top-of-page smart
 * banner iOS draws for a site that has a matching App Store listing. Needs
 * the numeric App Store id, which this repo has never stored as its own
 * config field — `runtimeConfig.app.ios.storeUrl` (NP-041) already holds the
 * full `https://apps.apple.com/.../id<digits>` URL, so this just reads the
 * id back out of it rather than adding a second place that id can drift from.
 */

const APPLE_APP_ID_PATTERN = /\/id(\d{6,15})(?:[/?#]|$)/i

/** Pulls the numeric App Store id out of an App Store URL. Pure. */
export function extractAppleAppId(storeUrl: string | null | undefined): string | null {
  if (!storeUrl) return null
  const match = storeUrl.match(APPLE_APP_ID_PATTERN)
  return match ? match[1] : null
}

/**
 * The tag's `content` attribute: `app-id=<id>, app-argument=<url>`.
 * `null` when there is no App Store id to point at yet — a tag with a blank
 * id would still trigger Safari's banner and send a tapping member nowhere.
 */
export function appleItunesAppContent(
  storeUrl: string | null | undefined,
  appArgument: string,
): string | null {
  const appId = extractAppleAppId(storeUrl)
  if (!appId) return null
  return `app-id=${appId}, app-argument=${appArgument}`
}
