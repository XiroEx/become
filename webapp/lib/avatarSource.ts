// ---------------------------------------------------------------------------
// What an <Avatar> should actually draw, decided from `profileIcon` +
// `avatarUrl` alone. Pure, so the whole rule is unit-testable without a DOM,
// a network or an image that has to fail on cue.
//
// Why this exists
// ---------------
// `profileIcon: 'custom'` is a POINTER at an object in the blob store, and a
// pointer can outlive the thing it points at. George's avatar was uploaded on
// 2026-06-03; the object is in neither MinIO today, so
// `/api/blob/avatars/<id>/<rand>.jpg` answers 404 and `<Image>` rendered the
// browser's broken-image box on every surface that shows an avatar at once —
// TopNav, the profile card, the icon picker's preview and the picker's own
// "custom" slot. Four broken images and no way to tell what went wrong.
//
// A member's row can name an image that cannot be drawn for reasons the app
// does not control: the object was lost, the host is down, a Google avatar URL
// 403s once the token behind it rotates. None of them may render as a broken
// image, so `src` is treated as a HINT and the caller always has a glyph to
// fall back to.
// ---------------------------------------------------------------------------

/** The id `profileIcon` carries when the member equipped an uploaded photo. */
export const CUSTOM_ICON = 'custom'

/**
 * The image an avatar should try, or null when there is nothing to try and the
 * preset glyph is the answer outright.
 */
export function avatarImageSrc(
  icon: string | null | undefined,
  imageUrl: string | null | undefined,
): string | null {
  if (icon !== CUSTOM_ICON) return null
  const src = typeof imageUrl === 'string' ? imageUrl.trim() : ''
  return src ? src : null
}

/**
 * Did the member equip a photo, whether or not it can be drawn? Decides which
 * glyph stands in when the image is unusable: a member who never chose a photo
 * falls back to THEIR preset, while one whose photo is missing gets a neutral
 * "no picture" glyph rather than a preset they never picked.
 */
export function equippedCustomAvatar(icon: string | null | undefined): boolean {
  return icon === CUSTOM_ICON
}

/**
 * May this src go through the Next image optimizer?
 *
 * Only a same-origin path may. `next/image` validates a REMOTE src against
 * `images.remotePatterns` and THROWS at render when the host is not listed —
 * an exception, not an `onError`, so no fallback below it can ever run. The
 * app stores remote avatar URLs it never configured a pattern for:
 * `lib/authBridge.ts` backfills `https://lh3.googleusercontent.com/…` on a
 * Google sign-in, and `PATCH /api/profile` accepts an `avatarUrl` outright.
 * Those render unoptimized, which skips the host check entirely and cannot
 * throw — and if the URL is still bad, it fails as a load error, which IS
 * recoverable.
 *
 * Same-origin `/api/blob/…` keeps the optimizer, deliberately: the blob route
 * serves `avatars/` unauthenticated precisely because the optimizer re-fetches
 * with no cookies (see lib/blobAccess.ts), and that arrangement is unchanged.
 */
export function canOptimizeAvatarSrc(src: string): boolean {
  return src.startsWith('/') && !src.startsWith('//')
}
