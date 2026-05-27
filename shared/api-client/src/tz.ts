/**
 * Date-scoped API paths receive an automatic `tz=<IANA>` query param so the
 * server can render the user's local day window. Mirrors the per-route
 * `tz=` audit landed in PRs #315 / #316.
 */
const DATE_SCOPED_PREFIXES = [
  '/api/weight',
  '/api/mood',
  '/api/workouts',
  '/api/schedule',
  '/api/progress',
  '/api/streak',
  '/api/mind',
  '/api/nutrition',
];

export function isDateScopedPath(path: string): boolean {
  const justPath = path.split('?')[0]?.split('#')[0] ?? path;
  return DATE_SCOPED_PREFIXES.some(
    (p) => justPath === p || justPath.startsWith(p + '/'),
  );
}

export function detectTimezone(): string | undefined {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return tz || undefined;
  } catch {
    return undefined;
  }
}

export function appendTz(url: string, tz: string | undefined): string {
  if (!tz) return url;
  const [pathQuery = '', hash = ''] = url.split('#');
  const [path = '', query = ''] = pathQuery.split('?');
  if (!isDateScopedPath(path)) return url;
  const params = new URLSearchParams(query);
  if (params.has('tz')) return url;
  params.set('tz', tz);
  const rebuilt = `${path}?${params.toString()}`;
  return hash ? `${rebuilt}#${hash}` : rebuilt;
}
