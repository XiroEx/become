import { execFileSync } from "child_process";
import * as fs from "fs";
import * as path from "path";

// Metro is the only toolchain in this package that actually BUILDS the app, and
// it is the one that could not see `@become/api-client` at all: the package
// resolves for tsc through tsconfig `paths` and for Jest through
// `moduleNameMapper`, neither of which Metro reads. Both suites were green
// while `npx expo export` failed on the first screen that imports the client,
// so no build of any kind could be produced.
//
// These assertions are about configuration, so they read the REAL config rather
// than scan its text — a comment cannot satisfy them. It is loaded in a child
// Node process because `expo/metro-config` pulls in ESM-only dependencies that
// Jest's transform does not handle; that is a property of the bundler's own
// toolchain, not of this config.

const EXPO_ROOT = path.resolve(__dirname, "..");
const SHARED_ROOT = path.resolve(EXPO_ROOT, "../shared");
const APP_NODE_MODULES = path.resolve(EXPO_ROOT, "node_modules");

type LoadedConfig = {
  watchFolders: string[];
  nodeModulesPaths: string[];
  blockList: { source: string; flags: string }[];
};

const probe = `
  const config = require(${JSON.stringify(path.join(EXPO_ROOT, "metro.config.js"))});
  const resolver = config.resolver || {};
  const raw = resolver.blockList;
  const blockList = Array.isArray(raw) ? raw : raw ? [raw] : [];
  process.stdout.write(JSON.stringify({
    watchFolders: config.watchFolders || [],
    nodeModulesPaths: resolver.nodeModulesPaths || [],
    blockList: blockList.map((re) => ({ source: re.source, flags: re.flags })),
  }));
`;

const config = JSON.parse(
  execFileSync(process.execPath, ["-e", probe], {
    cwd: EXPO_ROOT,
    encoding: "utf8",
  }),
) as LoadedConfig;

const isBlocked = (filePath: string): boolean =>
  config.blockList.some(({ source, flags }) =>
    new RegExp(source, flags).test(filePath),
  );

describe("metro.config.js", () => {
  it("watches the sibling shared/ tree the linked package lives in", () => {
    // node_modules/@become/api-client is a SYMLINK out of this project root.
    // Metro serves the project root plus watchFolders and nothing else.
    expect(config.watchFolders).toContain(SHARED_ROOT);
  });

  it("looks packages up in this app's node_modules", () => {
    // The shared sources import `zod` from THEIR location on disk. A clean
    // checkout has no node_modules beside them, so without this the lookup
    // walks out of the repo and the export fails on `zod`.
    expect(config.nodeModulesPaths).toEqual([APP_NODE_MODULES]);
  });

  it("hides shared/'s own node_modules, so only one copy of zod is bundled", () => {
    // nodeModulesPaths is consulted only AFTER the ordinary walk up the tree,
    // so on a machine where shared/api-client's own `npm ci` has run — CI does
    // that, because tsc needs its zod — the walk finds that copy first and
    // bundles zod twice (measured: 78 extra modules in the iOS export).
    expect(
      isBlocked(path.join(SHARED_ROOT, "api-client/node_modules/zod/index.js")),
    ).toBe(true);

    // The shared sources themselves must stay reachable, and so must the app's
    // own packages, or nothing resolves at all.
    expect(isBlocked(path.join(SHARED_ROOT, "api-client/src/index.ts"))).toBe(
      false,
    );
    expect(isBlocked(path.join(APP_NODE_MODULES, "zod/index.js"))).toBe(false);
  });
});

describe("package.json", () => {
  const pkg = JSON.parse(
    fs.readFileSync(path.join(EXPO_ROOT, "package.json"), "utf8"),
  ) as { dependencies?: Record<string, string> };

  it("links @become/api-client into node_modules", () => {
    // Without this npm never creates the link and Metro has no route to the
    // package at all — the tsconfig path and the Jest mapper hide that.
    expect(pkg.dependencies?.["@become/api-client"]).toBe(
      "file:../shared/api-client",
    );
  });

  it("declares zod itself, because the app bundles exactly one copy of it", () => {
    expect(pkg.dependencies?.zod).toBeTruthy();
  });
});
