/**
 * Formatting helpers for training volume and work time.
 */

export function formatVolume(volume: number, unit: 'lbs' | 'kg'): string {
  if (!Number.isFinite(volume) || volume <= 0) return `0 ${unit}`
  if (volume < 1000) return `${Math.round(volume)} ${unit}`
  const k = volume / 1000
  return `${k >= 100 ? Math.round(k) : k.toFixed(1)}k ${unit}`
}

export function formatWorkTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '0m'
  const mins = Math.round(seconds / 60)
  if (mins < 60) return `${mins}m`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m === 0 ? `${h}h` : `${h}h ${m}m`
}
