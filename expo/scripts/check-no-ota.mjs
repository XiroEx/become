#!/usr/bin/env node
// Guard: no over-the-air updates, and no Expo-hosted services, in this repo.
//
// George, 2026-09-30: no EAS Build, EAS Submit, EAS Update, Expo Push Service
// or expo.dev project — ever. Expo LIBRARIES and the CLI (`expo prebuild`,
// `expo export`, expo-router, …) are fine; the hosted services are not. For v1
// that means **no OTA at all**: every JS or native change ships as a store
// build, and the minimum-version gate (NP-041, `lib/version/versionGate.ts` +
// `GET /api/app/config`) is the lever that forces an urgent upgrade.
//
// Nothing at runtime enforces that, because the way OTA comes back is a
// dependency and a config file, not code: someone runs `eas build:configure`,
// `eas.json` reappears, `expo-updates` lands in the lockfile and the first
// store build after that quietly starts fetching bundles from a server. So
// this script fails the build on the four footprints that would do it:
//
//   1. an `eas.json` anywhere in the repo;
//   2. `expo-updates` in expo/package.json (any dependency field);
//   3. `expo-updates` anywhere in expo/package-lock.json — which is how it
//      arrives transitively, via a preset or another Expo module;
//   4. OTA / EAS keys in expo/app.json (`updates`, `runtimeVersion`,
//      `extra.eas`, `owner`) or an `eas` script in expo/package.json.
//
// Run from anywhere: `node expo/scripts/check-no-ota.mjs`. Pass
// `--root <dir>` to check a different tree (the suite uses that to prove the
// script actually fails on a violation).

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = path.resolve(HERE, "..", "..");

const SKIP_DIRS = new Set([
  "node_modules",
  ".git",
  ".next",
  "dist",
  "build",
  "ios",
  "android",
  "coverage",
  "playwright-report",
  "test-results",
  "__MACOSX",
]);

/** Every `eas.json` in the tree, relative to root, skipping generated dirs. */
function findEasJson(root) {
  const hits = [];
  /** @param {string} dir */
  const walk = (dir) => {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        walk(full);
      } else if (entry.name === "eas.json") {
        hits.push(path.relative(root, full));
      }
    }
  };
  walk(root);
  return hits.sort();
}

function readJson(file) {
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

/**
 * @param {string} root repo root to check
 * @returns {string[]} one line per violation; empty means clean
 */
export function findOtaViolations(root) {
  const problems = [];
  const rel = (p) => path.relative(root, p) || p;

  for (const hit of findEasJson(root)) {
    problems.push(
      `${hit} exists. EAS Build/Submit/Update are not used (George, 2026-09-30) — ` +
        `delete it and release through the stores (expo/RELEASE.md).`,
    );
  }

  const pkgPath = path.join(root, "expo", "package.json");
  const pkg = readJson(pkgPath);
  if (pkg) {
    const fields = [
      "dependencies",
      "devDependencies",
      "peerDependencies",
      "optionalDependencies",
    ];
    for (const field of fields) {
      const names = Object.keys(pkg[field] ?? {});
      for (const name of names) {
        if (name === "expo-updates" || name === "expo-updates-interface") {
          problems.push(
            `${rel(pkgPath)} declares ${name} in ${field}. There is no OTA in v1 — ` +
              `ship a store build and raise the minimum version instead (NP-041).`,
          );
        }
      }
    }
    for (const [name, body] of Object.entries(pkg.scripts ?? {})) {
      if (/(^|[^\w-])eas(\s|$)/.test(String(body))) {
        problems.push(
          `${rel(pkgPath)} script "${name}" runs the EAS CLI: ${body}`,
        );
      }
    }
  }

  // The lockfile is the only place a TRANSITIVE expo-updates shows up, and a
  // transitive one still ships the native module into the binary.
  const lockPath = path.join(root, "expo", "package-lock.json");
  if (fs.existsSync(lockPath)) {
    const lock = readJson(lockPath);
    const named = new Set();
    for (const key of Object.keys(lock?.packages ?? {})) {
      if (/(^|\/)expo-updates(\/|$)/.test(key)) named.add(key);
    }
    for (const key of Object.keys(lock?.dependencies ?? {})) {
      if (key === "expo-updates") named.add(key);
    }
    for (const key of [...named].sort()) {
      problems.push(
        `${rel(lockPath)} resolves ${key} — expo-updates is in the dependency tree ` +
          `(directly or via a preset). Remove it; v1 has no OTA.`,
      );
    }
  }

  const appJsonPath = path.join(root, "expo", "app.json");
  const appJson = readJson(appJsonPath);
  if (appJson?.expo) {
    const expoCfg = appJson.expo;
    const banned = [
      ["updates", expoCfg.updates],
      ["runtimeVersion", expoCfg.runtimeVersion],
      ["owner", expoCfg.owner],
      ["extra.eas", expoCfg.extra?.eas],
    ];
    for (const [key, value] of banned) {
      if (value !== undefined) {
        problems.push(
          `${rel(appJsonPath)} sets expo.${key}. That is OTA / expo.dev configuration ` +
            `and this app uses neither.`,
        );
      }
    }
  }

  return problems;
}

function main(argv) {
  const rootFlag = argv.indexOf("--root");
  const root =
    rootFlag > -1 && argv[rootFlag + 1]
      ? path.resolve(argv[rootFlag + 1])
      : DEFAULT_ROOT;

  const problems = findOtaViolations(root);
  if (problems.length > 0) {
    console.error("No-OTA guard FAILED:\n");
    for (const problem of problems) console.error(`  • ${problem}`);
    console.error(
      "\nv1 ships through the App Store and Play Store only. An urgent fix is a " +
        "store build plus the minimum-version gate (NP-041). See " +
        '"Releasing a fix" in expo/RELEASE.md.',
    );
    return 1;
  }
  console.log(
    "No-OTA guard OK: no eas.json, no expo-updates in the dependency tree, " +
      "no OTA keys in app.json.",
  );
  return 0;
}

// Only exit the process when run as a script; importing it must be harmless.
const invokedDirectly =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (invokedDirectly) process.exit(main(process.argv.slice(2)));
