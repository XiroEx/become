// iOS config plugin: gives expo-widgets' extension target (ExpoWidgetsTarget)
// an asset catalog, so the Live Activity and the widgets can draw the Become
// arrow (`<Image assetName="BecomeArrow" />`) instead of an emoji.
// expo-widgets creates the target with Sources/Frameworks phases only, and
// `Image(name)` looks in the EXTENSION's own bundle, not the app's.
// The catalog's source lives in `assets/widgets/` (one template imageset).
const fs = require("fs");
const path = require("path");
const { withDangerousMod, withXcodeProject } = require("expo/config-plugins");

const TARGET = "ExpoWidgetsTarget";
const CATALOG = "Assets.xcassets";

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(from, to);
    else fs.copyFileSync(from, to);
  }
}

function withCatalogFiles(config) {
  return withDangerousMod(config, [
    "ios",
    (mod) => {
      const src = path.join(mod.modRequest.projectRoot, "assets", "widgets");
      const dest = path.join(mod.modRequest.platformProjectRoot, TARGET, CATALOG);
      copyDir(src, dest);
      return mod;
    },
  ]);
}

function withCatalogInTarget(config) {
  return withXcodeProject(config, (mod) => {
    const project = mod.modResults;
    const target = project.pbxTargetByName(TARGET);
    if (!target) {
      throw new Error(`withWidgetAssets: no "${TARGET}" target (list this plugin BEFORE expo-widgets in app.json: config mods run in reverse order)`);
    }
    const targetUuid = Object.entries(project.pbxNativeTargetSection()).find(
      ([, t]) => t === target,
    )[0];
    const objects = project.hash.project.objects;
    const already = Object.values(objects.PBXFileReference || {}).some(
      (ref) => ref && ref.path === `"${CATALOG}"` && ref.lastKnownFileType === "folder.assetcatalog",
    );
    if (already) return mod;

    const groupKey = project.findPBXGroupKey({ name: TARGET }) || project.findPBXGroupKey({ path: TARGET });
    const file = project.addFile(CATALOG, groupKey, { lastKnownFileType: "folder.assetcatalog" });
    file.uuid = project.generateUuid();
    file.target = targetUuid;
    project.addToPbxBuildFileSection(file);
    project.addBuildPhase([], "PBXResourcesBuildPhase", "Resources", targetUuid);
    const phase = project.pbxResourcesBuildPhaseObj(targetUuid);
    phase.files.push({ value: file.uuid, comment: `${CATALOG} in Resources` });
    return mod;
  });
}

module.exports = function withWidgetAssets(config) {
  return withCatalogInTarget(withCatalogFiles(config));
};
