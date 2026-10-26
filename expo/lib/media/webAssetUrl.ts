import { WEBAPP_BASE_URL } from "@/lib/config";

/**
 * A PUBLIC asset URL the web app stored as a site-relative path, made loadable
 * by React Native.
 *
 * The web stores some image URLs relative to its own origin — a program's
 * uploaded cover is `/api/programs/<id>/image?v=…` — which a browser resolves
 * against the page and `<Image source={{ uri }}>` cannot resolve at all: the
 * image silently never loads. So a path starting with `/` gets the Become
 * origin in front of it; an absolute URL (a CDN, a data: URL) passes through.
 *
 * Only for PUBLIC assets. A per-member image (`/api/blob/…`) needs the session
 * and goes through `AuthedImage` instead.
 */
export function webAssetUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("//")) return `https:${trimmed}`;
  if (trimmed.startsWith("/")) return `${WEBAPP_BASE_URL}${trimmed}`;
  return trimmed;
}
