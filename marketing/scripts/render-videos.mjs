import {bundle} from '@remotion/bundler';
import {getCompositions, renderMedia} from '@remotion/renderer';
import {mkdir, readFile, stat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const campaigns = JSON.parse(await readFile(path.join(root, 'src/campaigns.json'), 'utf8')).slice(0, 19);
const outputDirectory = path.join(root, 'out/videos');
await mkdir(outputDirectory, {recursive: true});

const serveUrl = await bundle({entryPoint: path.join(root, 'src/index.ts')});
const compositions = await getCompositions(serveUrl);
const byId = new Map(compositions.map((composition) => [composition.id, composition]));

for (const [index, campaign] of campaigns.entries()) {
  const id = 'Video' + campaign.id;
  const composition = byId.get(id);
  if (!composition) throw new Error('Missing composition ' + id);

  const outputLocation = path.join(outputDirectory, campaign.slug + '.mp4');
  let lastReported = -1;
  await renderMedia({
    composition,
    serveUrl,
    codec: 'h264',
    crf: 20,
    concurrency: 3,
    outputLocation,
    onProgress: ({progress}) => {
      const percent = Math.floor(progress * 10) * 10;
      if (percent !== lastReported && percent % 20 === 0) {
        lastReported = percent;
        console.log('[' + (index + 1) + '/19] ' + campaign.slug + ' ' + percent + '%');
      }
    },
  });
  const result = await stat(outputLocation);
  if (result.size < 100_000) throw new Error('Rendered file is unexpectedly small: ' + outputLocation);
  console.log('[' + (index + 1) + '/19] wrote ' + path.relative(root, outputLocation));
}
