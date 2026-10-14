#!/usr/bin/env node
// Regenerates expo/assets/sounds/rest-end.wav — the audible half of the
// rest-timer alert (NP-082, porting the web's NP-210 decision).
//
//   node scripts/generate-rest-alert-sound.mjs
//
// Why a script and not a file somebody downloaded: the web plays this alert by
// synthesising it (`webapp/lib/workout/restAlert.ts` — two 880 Hz sine beeps
// through the Web Audio API, 0.25 s apart). React Native has no oscillator, so
// native needs an actual asset; generating it from the SAME numbers is what
// stops the two apps from drifting into two different alerts, and it keeps the
// binary in the repo explainable — re-run this and you get the identical file
// back, byte for byte.
//
// No dependencies on purpose (same reason as generate-app-assets.mjs): a 16-bit
// PCM WAV is a 44-byte header plus samples, which is cheaper than a native
// encoder that has to install on every machine that touches the sound.

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const EXPO_DIR = join(HERE, "..");
const OUT_DIR = join(EXPO_DIR, "assets", "sounds");
const OUT = join(OUT_DIR, "rest-end.wav");

/** The web's `playRestAlertSound`: a sine at 880 Hz (A5). */
const FREQUENCY_HZ = 880;
/** 22.05 kHz is 25× the tone — inaudibly different from 44.1 and half the file. */
const SAMPLE_RATE = 22050;
const CHANNELS = 1;
const BITS_PER_SAMPLE = 16;
/** Each beep, in seconds, and the gap between the two (the web: 0.2 s apart). */
const BEEP_SECONDS = 0.12;
const GAP_SECONDS = 0.08;
/** Peak amplitude. The web ramps its gain to 0.3; keep the headroom here too,
 *  so the beep is a cue in a gym and not a startle. */
const PEAK = 0.3;
/** Linear attack/release, in seconds — a square-edged sine clicks. */
const EDGE_SECONDS = 0.008;

function envelope(t, duration) {
  if (t < EDGE_SECONDS) return t / EDGE_SECONDS;
  if (t > duration - EDGE_SECONDS) return Math.max(0, (duration - t) / EDGE_SECONDS);
  return 1;
}

/** Two beeps with a gap: [beep][gap][beep]. */
function renderSamples() {
  const beep = Math.round(BEEP_SECONDS * SAMPLE_RATE);
  const gap = Math.round(GAP_SECONDS * SAMPLE_RATE);
  const total = beep * 2 + gap;
  const samples = new Int16Array(total);
  for (let i = 0; i < total; i++) {
    // Which beep (if any) this sample belongs to.
    let local = -1;
    if (i < beep) local = i;
    else if (i >= beep + gap) local = i - beep - gap;
    if (local < 0) continue;
    const t = local / SAMPLE_RATE;
    const value =
      Math.sin(2 * Math.PI * FREQUENCY_HZ * t) *
      PEAK *
      envelope(t, BEEP_SECONDS);
    samples[i] = Math.max(-32768, Math.min(32767, Math.round(value * 32767)));
  }
  return samples;
}

function wavFile(samples) {
  const blockAlign = (CHANNELS * BITS_PER_SAMPLE) / 8;
  const dataBytes = samples.length * blockAlign;
  const buffer = Buffer.alloc(44 + dataBytes);
  buffer.write("RIFF", 0, "ascii");
  buffer.writeUInt32LE(36 + dataBytes, 4);
  buffer.write("WAVE", 8, "ascii");
  buffer.write("fmt ", 12, "ascii");
  buffer.writeUInt32LE(16, 16); // PCM fmt chunk size
  buffer.writeUInt16LE(1, 20); // audioFormat: 1 = PCM
  buffer.writeUInt16LE(CHANNELS, 22);
  buffer.writeUInt32LE(SAMPLE_RATE, 24);
  buffer.writeUInt32LE(SAMPLE_RATE * blockAlign, 28); // byte rate
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(BITS_PER_SAMPLE, 34);
  buffer.write("data", 36, "ascii");
  buffer.writeUInt32LE(dataBytes, 40);
  for (let i = 0; i < samples.length; i++) {
    buffer.writeInt16LE(samples[i], 44 + i * blockAlign);
  }
  return buffer;
}

mkdirSync(OUT_DIR, { recursive: true });
const file = wavFile(renderSamples());
writeFileSync(OUT, file);
console.log(
  `wrote ${OUT} (${file.length} bytes, ${SAMPLE_RATE} Hz, ${BITS_PER_SAMPLE}-bit mono)`,
);
