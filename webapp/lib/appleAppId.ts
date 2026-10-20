// NP-205: Safari's `apple-itunes-app` smart-banner meta tag needs just the
// numeric App Store id, not a whole URL. config.app.ios.storeUrl (NP-041,
// lib/runtimeConfig.ts) already carries the id inside an apps.apple.com URL —
// pulling it out here means the id lives in exactly one place instead of two
// that could drift apart. Fails open (undefined) when the URL has no id yet,
// e.g. a placeholder set before the app is actually listed: no id means no
// meta tag, never a banner pointing at a page that does not exist.

export function extractAppleAppId(storeUrl: string | null | undefined): string | undefined {
  if (!storeUrl) return undefined
  const match = /\/id(\d{6,})(?:[/?#]|$)/.exec(storeUrl)
  return match?.[1]
}
