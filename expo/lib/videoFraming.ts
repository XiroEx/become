/**
 * Smart video framing helper (NP-058 parity).
 * Re-exports the shared training implementation from @become/core.
 */

export {
  detectOrientation,
  resolveFraming,
  type VideoFit,
  type VideoSurface,
  type VideoOrientation,
  type VideoFramingOverride,
  type VideoFramingInput,
  type ResolvedFraming,
} from "@become/core";
