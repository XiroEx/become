import {bundle} from '@remotion/bundler';
import {getCompositions, renderMedia} from '@remotion/renderer';
import {mkdir, stat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const {reviewedCampaigns} = await import(path.join(root, 'src/reviewedCampaigns.ts'));
const outputDirectory = path.join(root, 'out/videos-reviewed');
await mkdir(outputDirectory, {recursive: true});

const serveUrl = await bundle({entryPoint: path.join(root, 'src/index.ts')});
const compositions = await getCompositions(serveUrl);
const byId = new Map(compositions.map((composition) => [composition.id, composition]));

for (const [index, campaign] of reviewedCampaigns.entries()) {
  const composition = byId.get(campaign.id);
  if (!composition) throw new Error('Missing composition ' + campaign.id);
  const outputLocation = path.join(outputDirectory, campaign.slug + '.mp4');
  await renderMedia({
    composition,
    serveUrl,
    codec: 'h264',
    crf: 18,
    concurrency: 3,
    outputLocation,
  });
  const result = await stat(outputLocation);
  if (result.size < 150_000) throw new Error('Rendered file is unexpectedly small: ' + outputLocation);
  console.log('[' + (index + 1) + '/19] ' + path.relative(root, outputLocation));
}
