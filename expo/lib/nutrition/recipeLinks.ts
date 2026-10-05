import { WEBAPP_BASE_URL } from "@/lib/programs/browserLauncher";

/**
 * Recipe deep links, for anything that still addresses the web.
 *
 * NP-012 builds every unported surface natively for v1: create and edit are
 * native screens (`/(tabs)/nutrition/recipes/new`,
 * `/(tabs)/nutrition/recipes/[id]/edit`), so nothing member-facing opens
 * these URLs anymore. The helpers stay for parity surfaces that genuinely
 * need a web address (notifications, shared links) and point at the pages
 * that exist — `/dashboard/recipes/...`, never the
 * `/dashboard/nutrition/recipes/...` paths that never did.
 */

export function recipeViewUrl(recipeId: string): string {
  return `${WEBAPP_BASE_URL}/dashboard/recipes/${encodeURIComponent(recipeId)}`;
}

export function recipeCreateUrl(): string {
  return `${WEBAPP_BASE_URL}/dashboard/recipes/new`;
}

export function recipeEditUrl(recipeId: string): string {
  return `${WEBAPP_BASE_URL}/dashboard/recipes/${encodeURIComponent(recipeId)}/edit`;
}
