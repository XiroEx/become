import {copyFile, mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const marketingRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const appPublic = path.resolve(marketingRoot, '../webapp/public');
const output = path.join(marketingRoot, 'public');

const assets = [
  ['logo.png', 'logo.png'],
  ['screenshots/ss-dashboard.png', 'dashboard.png'],
  ['screenshots/ss-programming.png', 'programs.png'],
  ['screenshots/ss-mind.png', 'mindset.png'],
  ['screenshots/ss-nutrition.png', 'nutrition.png'],
  ['screenshots/ss-progress.png', 'progress.png'],
  ['screenshots/ss-calendar.png', 'calendar.png'],
  ['screenshots/ss-chat.png', 'chat.png'],
];

await mkdir(output, {recursive: true});
await Promise.all(
  assets.map(([source, target]) => copyFile(path.join(appPublic, source), path.join(output, target))),
);

console.log(`Synced ${assets.length} Become brand assets.`);
