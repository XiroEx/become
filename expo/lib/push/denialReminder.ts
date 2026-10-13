/**
 * The denied-permission reminder's storage keys, shared by the Home push
 * card and the native Notifications settings (NP-068).
 *
 * `PushOptInCard.tsx` owns the canonical key strings; this module re-exports
 * them so Settings reads and writes the SAME rows — a denial observed on one
 * surface anchors the 7-day/monthly cadence on the other.
 */

export {
  PUSH_CARD_DENIED_AT_KEY,
  PUSH_CARD_REPROMPT_SHOWN_AT_KEY,
  parseStoredTimestamp,
  resolveDeniedAt,
} from "@/components/push/PushOptInCard";
