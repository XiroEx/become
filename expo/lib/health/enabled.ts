/**
 * Is the Health sync surface shown to members?
 *
 * FALSE, deliberately. No HealthKit / Health Connect module is installed —
 * `lib/health/adapter.ts` is an adapter shell that throws without an injected
 * native impl — so the "Sync from Health" toggle syncs nothing. It shipped as a
 * switch that only wrote a flag, and until recently that flag landed on the
 * session key and signed the member out.
 *
 * NP-185 lands the real weight read/write behind separate permissions. Flip
 * this to true in THAT ticket, together with the copy that describes what the
 * integration actually does, and delete this comment.
 *
 * https://board.redbtn.io/b/6a70c4ea2fff468f8e253a89?card=6abb12672379586ae015cac4
 */
export const HEALTH_SYNC_ENABLED: boolean = false;
