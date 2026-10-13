/**
 * Profile-icon gradients — the single shared source of truth for the branded
 * background behind every preset avatar.
 *
 * The web renders these with `bg-gradient-to-br ${gradient}`
 * (`webapp/components/Avatar.tsx` over `webapp/lib/reward/icons.tsx`), and
 * native renders the same stops at the same angle with `expo-linear-gradient`
 * (`start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}` is `to bottom right`).
 * NativeWind cannot render gradient classes, so the hex stops live here as
 * plain data both platforms can consume.
 *
 * Keep `gradient` (the tailwind class string) character-identical to the
 * web's `PRESET_ICONS` entries: `profileIcons.test.ts` fails if they drift.
 */

export interface ProfileIconGradient {
  /** PRESET_ICONS id (`User.profileIcon`). */
  id: string;
  /** Display label, mirroring the web catalog. */
  label: string;
  /** Tailwind gradient classes, identical to the web catalog. */
  gradient: string;
  /**
   * `[from, to]` hex stops for `expo-linear-gradient`.
   * Same angle as the web's `bg-gradient-to-br` (top-left → bottom-right).
   */
  colors: [string, string];
}

export const PROFILE_ICON_GRADIENTS: readonly ProfileIconGradient[] = [
  { id: 'flame', label: 'Flame', gradient: 'from-orange-500 to-red-500', colors: ['#f97316', '#ef4444'] },
  { id: 'strength', label: 'Strength', gradient: 'from-violet-500 to-indigo-500', colors: ['#8b5cf6', '#6366f1'] },
  { id: 'bolt', label: 'Bolt', gradient: 'from-amber-400 to-yellow-500', colors: ['#fbbf24', '#eab308'] },
  { id: 'heart', label: 'Heart', gradient: 'from-rose-500 to-pink-500', colors: ['#f43f5e', '#ec4899'] },
  { id: 'summit', label: 'Summit', gradient: 'from-sky-500 to-blue-600', colors: ['#0ea5e9', '#2563eb'] },
  { id: 'sunrise', label: 'Sunrise', gradient: 'from-amber-400 to-orange-500', colors: ['#fbbf24', '#f97316'] },
  { id: 'focus', label: 'Focus', gradient: 'from-emerald-500 to-green-600', colors: ['#10b981', '#16a34a'] },
  { id: 'spark', label: 'Spark', gradient: 'from-fuchsia-500 to-violet-500', colors: ['#d946ef', '#8b5cf6'] },
  { id: 'leaf', label: 'Calm', gradient: 'from-green-500 to-teal-500', colors: ['#22c55e', '#14b8a6'] },
  { id: 'champion', label: 'Champion', gradient: 'from-yellow-400 to-amber-500', colors: ['#facc15', '#f59e0b'] },
];

const GRADIENT_BY_ID = new Map(PROFILE_ICON_GRADIENTS.map((g) => [g.id, g]));

/**
 * Gradient stops for a preset id, falling back to the first preset (flame) —
 * the same never-null contract as `presetIcon()` on both platforms.
 */
export function profileIconGradient(id: string | null | undefined): ProfileIconGradient {
  return (id && GRADIENT_BY_ID.get(id)) || PROFILE_ICON_GRADIENTS[0]!;
}
