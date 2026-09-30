/**
 * Validates the Become marketing skill library against its own catalogue.
 *
 * Run from `marketing/`:  npm run skills:check
 *
 * Five checks, all cheap, all deterministic:
 *   1. Every skill's frontmatter `description` is byte-identical to its `_catalog.json` entry.
 *   2. Every skill's frontmatter `name` matches its directory name.
 *   3. Every `referenceFiles` path in the catalogue resolves on disk.
 *   4. Every backticked repo path in a SKILL.md body resolves on disk.
 *   5. Grep guard: no revived rep-counting claim anywhere in the library or the agent prompt.
 *
 * Exit 0 when everything passes, 1 otherwise. No network, no secrets, no writes.
 */

import {readFile, readdir} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const marketingRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(marketingRoot, '..');
const skillsDir = path.join(marketingRoot, '.claude', 'skills');
const catalogPath = path.join(skillsDir, '_catalog.json');
const agentPrompt = path.join(repoRoot, '.claude', 'agents', 'become-marketing.md');

/**
 * The claim this library spent a whole pass excising. Never let it back in.
 * Written with alternations rather than one literal run so the guard does not match
 * itself, and so it also catches the past tense. Prose that explains *why* the claim was
 * removed has to phrase it some other way; that is deliberate.
 */
const BANNED_CLAIM = /count(s|ed)? (your |the )?reps?\b|rep[- ]count|camera[- ]count/i;

/**
 * Paths the skills name on purpose while knowing they are not on disk. Each one is
 * either gitignored output or a file a skill is documenting the *absence* of. Prefix
 * match, so `marketing/out/videos/` is covered by `marketing/out/`.
 */
const KNOWN_ABSENT = [
	['marketing/out/', 'render output, gitignored'],
	['marketing/inspo/', 'competitor captures, gitignored and local only'],
	['marketing/node_modules/', 'not installed in a fresh worktree'],
	['webapp/.env.local', 'local secrets, never committed'],
	['webapp/app/robots.ts', 'seo-geo documents this as missing; creating it is the recommendation'],
	['webapp/app/sitemap.ts', 'seo-geo documents this as missing; creating it is the recommendation'],
	['webapp/public/llms.txt', 'seo-geo documents this as missing'],
];

const knownAbsent = (value) => KNOWN_ABSENT.some(([prefix]) => value.startsWith(prefix));

const failures = [];
const fail = (check, detail) => failures.push({check, detail});

/** Parse the leading `---` frontmatter block. Values may not span lines in these files. */
function parseFrontmatter(source) {
	if (!source.startsWith('---\n')) return null;
	const end = source.indexOf('\n---', 4);
	if (end === -1) return null;
	const fields = {};
	for (const line of source.slice(4, end).split('\n')) {
		const match = /^([A-Za-z_][\w-]*):\s?(.*)$/.exec(line);
		if (match) fields[match[1]] = match[2].trim();
	}
	return fields;
}

const catalog = JSON.parse(await readFile(catalogPath, 'utf8'));
const catalogByName = new Map(catalog.map((entry) => [entry.name, entry]));

const skillNames = (await readdir(skillsDir, {withFileTypes: true}))
	.filter((entry) => entry.isDirectory() && !entry.name.startsWith('_'))
	.map((entry) => entry.name)
	.sort();

// ── 1, 2, 4: per-skill checks ────────────────────────────────────────────────

for (const skillName of skillNames) {
	const skillPath = path.join(skillsDir, skillName, 'SKILL.md');
	if (!existsSync(skillPath)) {
		fail('skill-file', `${skillName}/SKILL.md is missing`);
		continue;
	}

	const source = await readFile(skillPath, 'utf8');
	const frontmatter = parseFrontmatter(source);
	if (!frontmatter) {
		fail('frontmatter', `${skillName}/SKILL.md has no parseable frontmatter block`);
		continue;
	}

	// 2. name == directory
	if (frontmatter.name !== skillName) {
		fail('name-matches-dir', `${skillName}/SKILL.md declares name: ${frontmatter.name ?? '(none)'}`);
	}

	// 1. description == catalog description, byte for byte
	const entry = catalogByName.get(skillName);
	if (!entry) {
		fail('catalog-parity', `${skillName} has no entry in _catalog.json`);
	} else if (entry.description !== frontmatter.description) {
		fail(
			'catalog-parity',
			`${skillName}: frontmatter and _catalog.json descriptions differ.\n` +
				`      frontmatter: ${preview(frontmatter.description)}\n` +
				`      catalog:     ${preview(entry.description)}`,
		);
	}

	// 4. backticked repo paths in the body resolve
	for (const repoPath of repoPathsIn(source.slice(source.indexOf('\n---', 4)))) {
		if (knownAbsent(repoPath)) continue;
		if (!existsSync(path.join(repoRoot, repoPath))) {
			fail('repo-path', `${skillName}/SKILL.md references \`${repoPath}\`, which does not exist`);
		}
	}
}

// ── 3. referenceFiles resolve ────────────────────────────────────────────────

for (const entry of catalog) {
	for (const relative of entry.referenceFiles ?? []) {
		const full = path.join(skillsDir, entry.name, relative);
		if (!existsSync(full)) {
			fail('reference-file', `${entry.name}: referenceFiles lists ${relative}, which does not exist`);
		}
	}
	if (!skillNames.includes(entry.name)) {
		fail('catalog-parity', `_catalog.json lists ${entry.name}, which has no directory`);
	}
}

// ── 5. grep guard ────────────────────────────────────────────────────────────

const guarded = [];
for await (const file of walk(skillsDir)) guarded.push(file);
if (existsSync(agentPrompt)) guarded.push(agentPrompt);

for (const file of guarded) {
	const lines = (await readFile(file, 'utf8')).split('\n');
	lines.forEach((line, index) => {
		if (!BANNED_CLAIM.test(line)) return;
		fail(
			'rep-counting-claim',
			`${path.relative(repoRoot, file)}:${index + 1} — the camera does not tally ` +
				`repetitions. LIVE mode logs the set you enter.\n      ${line.trim()}`,
		);
	});
}

// ── Report ───────────────────────────────────────────────────────────────────

const checks = [
	'catalog-parity',
	'name-matches-dir',
	'reference-file',
	'repo-path',
	'rep-counting-claim',
	'frontmatter',
	'skill-file',
];

for (const check of checks) {
	const found = failures.filter((failure) => failure.check === check);
	if (found.length === 0) {
		console.log(`PASS  ${check}`);
		continue;
	}
	console.log(`FAIL  ${check} (${found.length})`);
	for (const failure of found) console.log(`      ${failure.detail}`);
}

console.log(
	failures.length === 0
		? `\nAll checks passed across ${skillNames.length} skills.`
		: `\n${failures.length} problem${failures.length === 1 ? '' : 's'} across ${skillNames.length} skills.`,
);

process.exit(failures.length === 0 ? 0 : 1);

// ── Helpers ──────────────────────────────────────────────────────────────────

function preview(value) {
	if (value === undefined) return '(none)';
	return value.length > 90 ? `${value.slice(0, 90)}...` : value;
}

/**
 * Pull backticked repo paths out of a SKILL.md body. Only strings that clearly
 * name a file or directory in this repo are checked: a leading segment we
 * recognise, and no spaces, globs, or template placeholders.
 */
function* repoPathsIn(body) {
	const roots = /^(webapp|marketing|db|\.claude|\.github)\//;
	const seen = new Set();
	for (const [, candidate] of body.matchAll(/`([^`\n]+)`/g)) {
		const value = candidate.trim();
		if (!roots.test(value)) continue;
		if (/[\s*?<>{}]/.test(value)) continue;
		if (value.includes('[') || value.includes('...')) continue;
		// Strip a trailing line reference (`FramedVideo.tsx:39`) and stray punctuation.
		const clean = value.replace(/:\d+(-\d+)?$/, '').replace(/[.,;:)]+$/, '');
		if (seen.has(clean)) continue;
		seen.add(clean);
		yield clean;
	}
}

async function* walk(dir) {
	for (const entry of await readdir(dir, {withFileTypes: true})) {
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			yield* walk(full);
		} else if (entry.name.endsWith('.md')) {
			yield full;
		}
	}
}
