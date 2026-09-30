#!/usr/bin/env node
/**
 * Vendor script to copy the pure Mind modules from webapp/lib to shared/core/src
 * with module imports rewritten.
 *
 * Implements NP-017 / NP-062: the web file remains the source of truth, this
 * script writes the copy into `@become/core`, and the drift test in webapp CI
 * (webapp/tests/unit/mindDrift.test.ts) fails if any copy diverges from its web
 * source. The behavioural parity test (webapp/tests/unit/mindParity.test.ts)
 * fails if the two disagree on the fixtures.
 *
 * Usage:
 *   node scripts/vendor-mind.mjs            # write the copies
 *   node scripts/vendor-mind.mjs --check    # exit 1 if any copy is stale
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');

/**
 * The ONLY edits a copy is allowed: rewriting the webapp's `@/` import aliases,
 * which do not exist inside `@become/core`. Everything else stays verbatim.
 *
 * Keep in lockstep with REWRITES in webapp/tests/unit/mindDrift.test.ts.
 */
const MIND_REWRITES = [
  ["from '@/lib/mindContent'", "from '../mindContent'"],
  ["from '@/lib/ai/sanitize'", "from '../ai/sanitize'"],
  ["from '@/components/mind/system/GuidedFlow'", "from './guidedStep'"],
];

const AI_REWRITES = [
  ["from '@/components/mind/system/GuidedFlow'", "from '../mind/guidedStep'"],
];

function applyAll(content, rules) {
  return rules.reduce((acc, [from, to]) => acc.replaceAll(from, to), content);
}

/** `webapp/lib/mind/<name>.ts` -> `shared/core/src/mind/<name>.ts` */
const mindModule = (name) => ({
  source: `webapp/lib/mind/${name}.ts`,
  target: `shared/core/src/mind/${name}.ts`,
  rewrite: (content) => applyAll(content, MIND_REWRITES),
});

export const MODULE_MAPPINGS = [
  // Progression + content, which live at webapp/lib root.
  {
    source: 'webapp/lib/mindXP.ts',
    target: 'shared/core/src/mindXP.ts',
    rewrite: (content) => content,
  },
  {
    source: 'webapp/lib/mindContent.ts',
    target: 'shared/core/src/mindContent.ts',
    rewrite: (content) => content,
  },
  // No DOM — only the GuidedStep type came from a component, and that type is
  // copied alongside it as shared/core/src/mind/guidedStep.ts.
  {
    source: 'webapp/lib/ai/sanitize.ts',
    target: 'shared/core/src/ai/sanitize.ts',
    rewrite: (content) => applyAll(content, AI_REWRITES),
  },
  // The session path, composer, move builders, validators and helpers.
  mindModule('moves'),
  mindModule('composeSession'),
  mindModule('blueprints'),
  mindModule('bodies'),
  mindModule('openings'),
  mindModule('slots'),
  mindModule('moveBuilders'),
  mindModule('library'),
  mindModule('validateMove'),
  mindModule('sessionPath'),
  mindModule('recommendSegment'),
  mindModule('suggestActions'),
  mindModule('suggestedProtocols'),
  mindModule('moodBridge'),
  mindModule('autoStart'),
  mindModule('introFlows'),
  mindModule('speechMatch'),
  mindModule('recentFeeling'),
  mindModule('rotation'),
];

export function vendorMind({ check = false } = {}) {
  const stale = [];
  for (const { source, target, rewrite } of MODULE_MAPPINGS) {
    const sourcePath = path.join(REPO_ROOT, source);
    const targetPath = path.join(REPO_ROOT, target);

    const sourceContent = fs.readFileSync(sourcePath, 'utf8');
    const targetContent = rewrite(sourceContent);

    if (check) {
      const current = fs.existsSync(targetPath) ? fs.readFileSync(targetPath, 'utf8') : null;
      if (current !== targetContent) stale.push(target);
      continue;
    }

    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(targetPath, targetContent, 'utf8');
    console.log(`  ${source} -> ${target}`);
  }

  if (check) {
    if (stale.length > 0) {
      console.error('Stale vendored Mind modules (run `node scripts/vendor-mind.mjs`):');
      for (const t of stale) console.error(`  ${t}`);
      return false;
    }
    console.log(`All ${MODULE_MAPPINGS.length} vendored Mind modules are in lockstep with the web.`);
  }
  return true;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const check = process.argv.includes('--check');
  if (!check) console.log('Vendoring Mind modules from webapp/lib to shared/core/src...');
  const ok = vendorMind({ check });
  if (!check) console.log('Done.');
  if (!ok) process.exit(1);
}
