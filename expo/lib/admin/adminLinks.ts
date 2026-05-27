import {
  WEBAPP_BASE_URL,
  defaultBrowserLauncher,
  type BrowserLauncher,
} from "@/lib/programs/browserLauncher";

/**
 * URLs for the admin deep-link surfaces. Native admin shells list data
 * read-only; every edit action routes back to the webapp via expo-web-browser.
 */
export function adminFoodReviewUrl(foodId: string): string {
  return `${WEBAPP_BASE_URL}/dashboard/admin/foods/${encodeURIComponent(foodId)}`;
}

export function adminExerciseEditUrl(slug: string): string {
  return `${WEBAPP_BASE_URL}/dashboard/admin/exercises/${encodeURIComponent(slug)}`;
}

export function adminUsersUrl(): string {
  return `${WEBAPP_BASE_URL}/dashboard/admin/users`;
}

export function adminOnboardingUrl(): string {
  return `${WEBAPP_BASE_URL}/dashboard/admin/onboarding`;
}

export async function openInBrowser(
  url: string,
  launcher: BrowserLauncher = defaultBrowserLauncher,
): Promise<void> {
  await launcher(url);
}
