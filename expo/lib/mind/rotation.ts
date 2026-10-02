import { dayOfYear } from "@become/core";

export { dayOfYear };

/** Index into a pool of `len`, rotating by day (+ salt to vary across systems). */
export function dailyIndex(len: number, salt = 0): number {
  if (len <= 0) return 0;
  return (dayOfYear() + salt) % len;
}

/** Today's deterministic pick from a pool. */
export function dailyPick<T>(arr: T[], salt = 0): T | undefined {
  if (!arr.length) return undefined;
  return arr[dailyIndex(arr.length, salt)];
}
