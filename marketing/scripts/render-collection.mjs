import {bundle} from '@remotion/bundler';
import {getCompositions, renderStill} from '@remotion/renderer';
import {mkdir, readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const campaigns = JSON.parse(await readFile(path.join(root, 'src/campaigns.json'), 'utf8'));
const serveUrl = await bundle({entryPoint: path.join(root, 'src/index.ts')});
const compositions = await getCompositions(serveUrl);
const byId = new Map(compositions.map((composition) => [composition.id, composition]));

let cursor = 0;
const worker = async () => {
  while (cursor < campaigns.length) {
    const index = cursor++;
    const campaign = campaigns[index];
    const composition = byId.get(campaign.id);
    if (!composition) throw new Error(`Missing composition ${campaign.id}`);
    const directory = path.join(root, 'out/collection', campaign.format);
    await mkdir(directory, {recursive: true});
    const output = path.join(directory, `${campaign.slug}.jpg`);
    await renderStill({
      composition,
      serveUrl,
      output,
      imageFormat: 'jpeg',
      jpegQuality: 90,
    });
    console.log(`[${index + 1}/${campaigns.length}] ${path.relative(root, output)}`);
  }
};

await Promise.all([worker(), worker(), worker()]);
