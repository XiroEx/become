/**
 * migrate-video-dimensions.ts — DEFERRED.
 *
 * One-shot migration that walks every Exercise with `videoStorageKey` set but
 * `videoWidth/videoHeight` missing, and backfills the intrinsic dimensions.
 *
 * Status: NOT IMPLEMENTED. The smart-framing feature self-heals as users play
 * each video (client → PATCH /api/exercises/[slug]/video/dimensions back-write),
 * so this script is a nice-to-have rather than a blocker.
 *
 * Why we punted:
 *   1. We don't ship ffprobe in the deploy environment.
 *   2. Parsing the MP4 `moov` box header from the first ~1MB is doable but
 *      MOV/QuickTime + WebM each need their own parser. The complexity isn't
 *      worth it when the auto-detect on first play covers the same ground for
 *      every video that's still in regular use.
 *
 * If we ever need eager backfill:
 *   - Easiest path: spin up a Node script that drives a headless Chromium
 *     (`puppeteer`), navigates to each video URL, reads
 *     `videoElement.videoWidth/Height`, and PATCHes the dims endpoint.
 *   - Alternative: pull the first 1MB via `Range: bytes=0-1048576`, locate the
 *     `moov.trak.tkhd` atom, decode width/height from offsets 76/80 (32-bit
 *     fixed). See https://developer.apple.com/documentation/quicktime-file-format
 *     for the schema. MP4 uses the same ISO base media layout.
 *
 * No-op for now:
 */
async function main() {
  console.log('migrate-video-dimensions: deferred. See file header for rationale.')
  console.log('Self-heal path: the client back-writes dims on first play via')
  console.log('  PATCH /api/exercises/[slug]/video/dimensions')
}

if (require.main === module) {
  void main()
}

export {}
