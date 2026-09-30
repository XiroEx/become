import {copyFile, mkdir} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const marketingRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const appPublic = path.resolve(marketingRoot, '../webapp/public');
const output = path.join(marketingRoot, 'public');

// sharp is already a webapp dependency. No image dependency is added to marketing/.
const require = createRequire(import.meta.url);
const sharp = require(path.join(marketingRoot, '../webapp/node_modules/sharp'));

// Render inputs come from the v2 capture set (seeded dummy accounts, documented in
// webapp/public/screenshots/v2/manifest.json). The legacy screenshots/ss-*.png set that this
// script used until 2026-08-25 was captured on an UNSEEDED account: every one of those shots
// showed an empty state ("No workouts scheduled yet", "No weight logged yet", 0/4, 0%), which
// the hard constraints forbid shipping. Do not point this map back at ss-*.png.
const captures = [
  ['screenshots/v2/dashboard-light.webp', 'dashboard.png'],
  ['screenshots/v2/workout-hub-light.webp', 'programs.png'],
  ['screenshots/v2/mind-light.webp', 'mindset.png'],
  ['screenshots/v2/nutrition-day-light.webp', 'nutrition.png'],
  ['screenshots/v2/progress-light.webp', 'progress.png'],
];

// No v2 capture exists for the Calendar screen or the Chat screen.
// calendar.png is still on disk as a legacy empty-state shot and is NOT referenced by any row in
// src/campaigns.json (rows 03/17/18/34 were repointed to programs.png, whose This Week strip is
// the real weekly surface). reviewedCampaigns.ts rows 03/17/18 still reference it and are blocked
// on a v2 Calendar capture. chat.png is unreferenced everywhere: the in-app chat surface is
// admin-gated behind a "Coming Soon" FeatureGuard and may not be marketed.
const notRefreshed = ['calendar.png (no v2 capture)', 'chat.png (feature not available; unused)'];

await mkdir(output, {recursive: true});
await copyFile(path.join(appPublic, 'logo.png'), path.join(output, 'logo.png'));
await Promise.all(
  captures.map(([source, target]) =>
    sharp(path.join(appPublic, source))
      .png({compressionLevel: 9})
      .toFile(path.join(output, target)),
  ),
);

console.log(`Synced ${captures.length + 1} Become brand assets from the v2 capture set.`);
console.log(`Not refreshed: ${notRefreshed.join(', ')}`);
