/**
 * Tiny class-name joiner. Filters falsy values and joins with a single space.
 * Intentionally dependency-free — we don't need clsx/tailwind-merge for our usage.
 */
export function cn(...args: (string | undefined | false | null)[]): string {
  return args.filter(Boolean).join(" ");
}

export default cn;
