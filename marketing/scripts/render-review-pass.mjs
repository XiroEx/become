import {bundle} from '@remotion/bundler';
import {getCompositions, renderStill} from '@remotion/renderer';
import {spawnSync} from 'node:child_process';
import {mkdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const pass = Number(process.argv[2]);
if (!Number.isInteger(pass) || pass < 1 || pass > 10) {
  throw new Error('Pass must be an integer from 1 through 10');
}

const reviewFrames = [20, 45, 70, 90, 110, 130, 150, 170, 200, 225];
const frame = reviewFrames[pass - 1];
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outputDirectory = path.join(root, 'out/reviews', 'pass-' + String(pass).padStart(2, '0'));
await mkdir(outputDirectory, {recursive: true});

const serveUrl = await bundle({entryPoint: path.join(root, 'src/index.ts')});
const compositions = await getCompositions(serveUrl);
const selected = compositions.filter((composition) => /^Reviewed\d{2}$/.test(composition.id));
if (selected.length !== 19) throw new Error('Expected 19 reviewed compositions, got ' + selected.length);

let cursor = 0;
const worker = async () => {
  while (cursor < selected.length) {
    const index = cursor++;
    const composition = selected[index];
    await renderStill({
      composition,
      serveUrl,
      frame,
      scale: 0.4,
      output: path.join(outputDirectory, String(index + 1).padStart(2, '0') + '.png'),
      imageFormat: 'png',
    });
  }
};
await Promise.all([worker(), worker(), worker(), worker()]);

const sheet = path.join(outputDirectory, 'sheet.png');
const ffmpeg = spawnSync(
  'ffmpeg',
  [
    '-y',
    '-framerate', '1',
    '-start_number', '1',
    '-i', path.join(outputDirectory, '%02d.png'),
    '-vf', 'tile=5x4:padding=12:margin=12:color=#202024',
    '-frames:v', '1',
    sheet,
  ],
  {encoding: 'utf8'},
);
if (ffmpeg.status !== 0) throw new Error(ffmpeg.stderr || 'ffmpeg contact sheet failed');
console.log('pass=' + pass + ' frame=' + frame + ' sheet=' + path.relative(root, sheet));
