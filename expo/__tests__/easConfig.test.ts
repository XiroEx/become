import * as fs from "fs";
import * as path from "path";

interface BuildProfile {
  developmentClient?: boolean;
  distribution?: string;
  channel?: string;
  autoIncrement?: boolean;
  ios?: { resourceClass?: string; simulator?: boolean };
  android?: { buildType?: string; gradleCommand?: string };
}
interface EasJson {
  cli?: { version?: string; appVersionSource?: string };
  build?: Record<string, BuildProfile>;
  submit?: {
    production?: {
      ios?: { appleId?: string; ascAppId?: string; appleTeamId?: string };
      android?: { serviceAccountKeyPath?: string; track?: string };
    };
  };
}

const EAS_JSON = path.resolve(__dirname, "..", "eas.json");
const APP_JSON = path.resolve(__dirname, "..", "app.json");
const RELEASE_MD = path.resolve(__dirname, "..", "RELEASE.md");

describe("eas.json", () => {
  const raw = fs.readFileSync(EAS_JSON, "utf8");
  const cfg = JSON.parse(raw) as EasJson;

  it("declares exactly 3 build profiles: development / preview / production", () => {
    const profiles = Object.keys(cfg.build ?? {}).sort();
    expect(profiles).toEqual(["development", "preview", "production"]);
  });

  it("production profile has BOTH iOS + Android entries", () => {
    expect(cfg.build?.production?.ios).toBeDefined();
    expect(cfg.build?.production?.android).toBeDefined();
  });

  it("production Android builds an app-bundle (.aab) for Play submission", () => {
    expect(cfg.build?.production?.android?.buildType).toBe("app-bundle");
  });

  it("production profile auto-increments versionCode/buildNumber", () => {
    expect(cfg.build?.production?.autoIncrement).toBe(true);
  });

  it("development profile is dev-client + internal distribution", () => {
    expect(cfg.build?.development?.developmentClient).toBe(true);
    expect(cfg.build?.development?.distribution).toBe("internal");
  });

  it("preview profile is internal distribution", () => {
    expect(cfg.build?.preview?.distribution).toBe("internal");
  });

  it("submit.production has both iOS + Android credentials slots", () => {
    expect(cfg.submit?.production?.ios).toBeDefined();
    expect(cfg.submit?.production?.android).toBeDefined();
  });

  it("Android submit defaults to the 'internal' track", () => {
    expect(cfg.submit?.production?.android?.track).toBe("internal");
  });

  it("cli.appVersionSource = 'remote' so EAS owns the versionCode counter", () => {
    expect(cfg.cli?.appVersionSource).toBe("remote");
  });
});

describe("app.json — identifiers locked for EAS distribution", () => {
  const cfg = JSON.parse(fs.readFileSync(APP_JSON, "utf8")) as {
    expo: {
      ios?: { bundleIdentifier?: string };
      android?: { package?: string };
    };
  };

  it("ios.bundleIdentifier is io.redbtn.become", () => {
    expect(cfg.expo.ios?.bundleIdentifier).toBe("io.redbtn.become");
  });

  it("android.package is io.redbtn.become", () => {
    expect(cfg.expo.android?.package).toBe("io.redbtn.become");
  });
});

describe("RELEASE.md — distribution docs", () => {
  const md = fs.readFileSync(RELEASE_MD, "utf8");

  it("documents prerequisites + eas build + eas submit", () => {
    expect(md).toMatch(/Prerequisites/i);
    expect(md).toMatch(/eas build --platform all --profile production/);
    expect(md).toMatch(/eas submit --platform all --profile production/);
  });

  it("documents the rollback strategy for both platforms", () => {
    expect(md).toMatch(/Rollback/i);
    expect(md).toMatch(/Apple/i);
    expect(md).toMatch(/Play/i);
  });

  it("includes the Apple App Privacy + Google Data Safety form drafts", () => {
    expect(md).toMatch(/App Privacy/i);
    expect(md).toMatch(/Data Safety/i);
    // Push token + email + JWT (the three declared types) all mentioned
    expect(md).toMatch(/Push notification token/);
    expect(md).toMatch(/Email/);
    expect(md).toMatch(/JWT/);
  });
});
