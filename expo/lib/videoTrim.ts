/**
 * Non-destructive video trim (NP-058 parity).
 * Re-exports the shared training implementation from @become/core.
 */

export {
  resolveTrim,
  formatTimecode,
  MIN_TRIM_DURATION,
  type VideoTrimOverride,
  type ResolvedTrim,
} from "@become/core";
