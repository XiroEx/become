import * as fs from "fs";
import * as path from "path";

const APP_JSON = path.resolve(__dirname, "..", "app.json");

describe("Android config — app.json", () => {
  const parsed = JSON.parse(fs.readFileSync(APP_JSON, "utf8")) as {
    expo: {
      androidStatusBar?: { translucent?: boolean; barStyle?: string };
      androidNavigationBar?: { barStyle?: string };
      android?: {
        package?: string;
        permissions?: string[];
        adaptiveIcon?: { foregroundImage?: string; backgroundColor?: string };
        intentFilters?: {
          action?: string;
          autoVerify?: boolean;
          data?: { scheme?: string; host?: string; pathPrefix?: string }[];
          category?: string[];
        }[];
      };
    };
  };

  it("enables edge-to-edge via translucent androidStatusBar", () => {
    expect(parsed.expo.androidStatusBar?.translucent).toBe(true);
  });

  it("uses light-content barStyle on the status bar", () => {
    expect(parsed.expo.androidStatusBar?.barStyle).toBe("light-content");
  });

  // Expo SDK 57's config schema rejects `androidNavigationBar` — Android is
  // edge-to-edge by default now and the nav bar style comes from the
  // `StatusBar`/`SystemBars` API at runtime, not from app.json. Keeping the key
  // fails `npx expo-doctor`'s schema check, so assert it stays gone.
  it("does not declare the removed androidNavigationBar key", () => {
    expect(parsed.expo.androidNavigationBar).toBeUndefined();
  });

  it("declares android.package = io.redbtn.become", () => {
    expect(parsed.expo.android?.package).toBe("io.redbtn.become");
  });

  // Its own file, not the store icon: the store icon is opaque and square, so
  // the launcher mask would crop a filled tile. The foreground is the mark on
  // transparency, inside the centre 66% every mask keeps.
  it("configures adaptiveIcon with foregroundImage + dark background", () => {
    expect(parsed.expo.android?.adaptiveIcon?.foregroundImage).toBe(
      "./assets/adaptive-icon.png",
    );
    expect(parsed.expo.android?.adaptiveIcon?.backgroundColor).toBe("#0a0a0a");
  });

  // Android has no usage string in the manifest — the sentence a member reads
  // is the app's own (`lib/media/capture.ts`), and the manifest just declares
  // what the app may ask for. CAMERA is declared because `ImagePicker`'s camera
  // launch needs it once it is in the manifest (NP-059); RECORD_AUDIO is NOT,
  // because nothing here records audio and both plugins are told to skip it.
  it("declares CAMERA, and nothing for the microphone", () => {
    const permissions = parsed.expo.android?.permissions ?? [];
    expect(permissions).toContain("android.permission.CAMERA");
    expect(permissions).not.toContain("android.permission.RECORD_AUDIO");
  });

  // The account-deletion restore link arrives by email and may open anywhere.
  // Android claims paths one at a time, so /account/restore needs a filter of
  // its own or the link always lands in a browser — which still works, but the
  // app has a screen for it and should get it.
  it("declares an /account/restore app-link intent filter with autoVerify=true", () => {
    const filters = parsed.expo.android?.intentFilters ?? [];
    const restoreFilter = filters.find((f) =>
      f.data?.some(
        (d) =>
          d.host === "become.redbtn.io" && d.pathPrefix === "/account/restore",
      ),
    );
    expect(restoreFilter).toBeDefined();
    expect(restoreFilter?.autoVerify).toBe(true);
    expect(restoreFilter?.action).toBe("VIEW");
    expect(restoreFilter?.category).toEqual(
      expect.arrayContaining(["BROWSABLE", "DEFAULT"]),
    );
  });

  it("declares a /verify app-link intent filter with autoVerify=true", () => {
    const filters = parsed.expo.android?.intentFilters ?? [];
    const verifyFilter = filters.find((f) =>
      f.data?.some(
        (d) => d.host === "become.redbtn.io" && d.pathPrefix === "/verify",
      ),
    );
    expect(verifyFilter).toBeDefined();
    expect(verifyFilter?.autoVerify).toBe(true);
    expect(verifyFilter?.action).toBe("VIEW");
    expect(verifyFilter?.category).toEqual(
      expect.arrayContaining(["BROWSABLE", "DEFAULT"]),
    );
  });
});
