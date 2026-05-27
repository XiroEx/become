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

  it("uses light-content barStyle on both system bars", () => {
    expect(parsed.expo.androidStatusBar?.barStyle).toBe("light-content");
    expect(parsed.expo.androidNavigationBar?.barStyle).toBe("light-content");
  });

  it("declares android.package = io.redbtn.become", () => {
    expect(parsed.expo.android?.package).toBe("io.redbtn.become");
  });

  it("configures adaptiveIcon with foregroundImage + dark background", () => {
    expect(parsed.expo.android?.adaptiveIcon?.foregroundImage).toBe(
      "./assets/icon.png",
    );
    expect(parsed.expo.android?.adaptiveIcon?.backgroundColor).toBe("#0a0a0a");
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
