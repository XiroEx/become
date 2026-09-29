const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");

const config = getDefaultConfig(__dirname);

const SHARED_ROOT = path.resolve(__dirname, "../shared");
const APP_NODE_MODULES = path.resolve(__dirname, "node_modules");

// `@become/api-client` lives at ../shared/api-client and is linked into
// node_modules by `"@become/api-client": "file:../shared/api-client"`, so what
// sits in node_modules is a SYMLINK and the real sources are outside this
// project root. Metro serves files from the project root plus `watchFolders`
// and nothing else, so without this line every screen that imports the client
// fails to bundle. tsc (tsconfig `paths`) and Jest (`moduleNameMapper`) each
// reach those sources by a different route, which is why both stay green while
// the bundler cannot build the app at all.
config.watchFolders = [...(config.watchFolders ?? []), SHARED_ROOT];

// The shared sources import `zod`, and Metro resolves it from THEIR location on
// disk, not from ours. A clean checkout has no node_modules beside them, so the
// lookup walks out of the repo and the export fails on `zod`. Naming this app's
// node_modules is what answers it.
config.resolver.nodeModulesPaths = [APP_NODE_MODULES];

// ...and this is the other half of the same answer. `nodeModulesPaths` is only
// consulted AFTER the ordinary walk up the directory tree (metro-resolver:
// hierarchical lookup first, these paths second), so on a machine where
// shared/api-client's own `npm ci` has run — CI does exactly that, because tsc
// needs its `zod` — the walk finds shared/api-client/node_modules/zod first and
// bundles a SECOND copy of zod (measured: 78 extra modules). Hiding those trees
// from Metro leaves one copy: the one this app declares and ships.
//
// The consequence is deliberate: a runtime dependency added to shared/ must
// also be declared in expo/package.json, or the bundle fails loudly here rather
// than shipping a duplicate.
const blockedSharedNodeModules = new RegExp(
  `^${SHARED_ROOT.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}[\\\\/].*[\\\\/]node_modules[\\\\/]`,
);
const existingBlockList = config.resolver.blockList;
config.resolver.blockList = [
  ...(Array.isArray(existingBlockList)
    ? existingBlockList
    : existingBlockList
      ? [existingBlockList]
      : []),
  blockedSharedNodeModules,
];

module.exports = withNativeWind(config, { input: "./global.css" });
