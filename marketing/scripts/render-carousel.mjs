import {bundle} from '@remotion/bundler';
import {getCompositions, renderStill} from '@remotion/renderer';
import {mkdir, readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const slides = JSON.parse(await readFile(path.join(root, 'src/carousels.json'), 'utf8'));

// Optional deck filter: `node scripts/render-carousel.mjs fuel`
const only = process.argv[2];
const wanted = only ? slides.filter((s) => s.deck === only) : slides;
if (wanted.length === 0) throw new Error(`No slides for deck "${only}"`);

const serveUrl = await bundle({entryPoint: path.join(root, 'src/index.ts')});
const compositions = await getCompositions(serveUrl);
const byId = new Map(compositions.map((c) => [c.id, c]));

let cursor = 0;
const worker = async () => {
  while (cursor < wanted.length) {
    const index = cursor++;
    const slide = wanted[index];
    const composition = byId.get(slide.id);
    if (!composition) throw new Error(`Missing composition ${slide.id}`);
    const directory = path.join(root, 'out/carousels', slide.deck);
    await mkdir(directory, {recursive: true});
    const output = path.join(directory, `${slide.slug}.jpg`);
    await renderStill({composition, serveUrl, output, imageFormat: 'jpeg', jpegQuality: 90});
    console.log(`[${index + 1}/${wanted.length}] ${path.relative(root, output)}`);
  }
};

await Promise.all([worker(), worker(), worker()]);
