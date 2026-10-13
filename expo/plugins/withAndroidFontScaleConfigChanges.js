// Android config plugin: adds fontScale and density to MainActivity's configChanges
// so that changing system font size or display density does not recreate the activity
// and restart the app on Home, preserving current screen state (card NP-326).
const { withAndroidManifest, AndroidConfig } = require("expo/config-plugins");

module.exports = function withAndroidFontScaleConfigChanges(config) {
  return withAndroidManifest(config, (mod) => {
    const mainActivity = AndroidConfig.Manifest.getMainActivityOrThrow(
      mod.modResults,
    );
    const existing = mainActivity.$["android:configChanges"] || "";
    const items = existing.split("|").filter(Boolean);
    if (!items.includes("fontScale")) {
      items.push("fontScale");
    }
    if (!items.includes("density")) {
      items.push("density");
    }
    mainActivity.$["android:configChanges"] = items.join("|");
    return mod;
  });
};
