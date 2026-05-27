import {
  WEBAPP_BASE_URL,
  defaultBrowserLauncher,
  type BrowserLauncher,
} from "@/lib/programs/browserLauncher";

export function recipeCreateUrl(): string {
  return `${WEBAPP_BASE_URL}/dashboard/nutrition/recipes/create`;
}

export function recipeEditUrl(recipeId: string): string {
  return `${WEBAPP_BASE_URL}/dashboard/nutrition/recipes/${encodeURIComponent(recipeId)}/edit`;
}

export async function openRecipeCreateInBrowser(
  launcher: BrowserLauncher = defaultBrowserLauncher,
): Promise<void> {
  await launcher(recipeCreateUrl());
}

export async function openRecipeEditInBrowser(
  recipeId: string,
  launcher: BrowserLauncher = defaultBrowserLauncher,
): Promise<void> {
  await launcher(recipeEditUrl(recipeId));
}
