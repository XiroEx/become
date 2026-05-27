// Verifies the tab navigator's route configuration without rendering the
// full Tabs component. Rendering Tabs requires mocking expo-router, which
// conflicts with NativeWind's babel preset injecting _ReactNativeCSSInterop
// bindings that the jest.mock hoisting check rejects. The contract under test
// here is: 5 routes, stable names, non-empty titles, and a route file on disk
// for every name.
import * as fs from "fs";
import * as path from "path";
import { TAB_ROUTES } from "../app/(tabs)/_layout";

describe("TabLayout config", () => {
  it("exports exactly 5 routes", () => {
    expect(TAB_ROUTES).toHaveLength(5);
  });

  it("declares the expected route names in order", () => {
    expect(TAB_ROUTES.map((r) => r.name)).toEqual([
      "dashboard",
      "programming",
      "mind",
      "nutrition",
      "chat",
    ]);
  });

  it("every route declares a non-empty title", () => {
    for (const r of TAB_ROUTES) {
      expect(r.title.length).toBeGreaterThan(0);
    }
  });

  it("route names are unique", () => {
    const names = TAB_ROUTES.map((r) => r.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("has an index.tsx file on disk for every route", () => {
    const base = path.resolve(__dirname, "..", "app", "(tabs)");
    for (const r of TAB_ROUTES) {
      const file = path.join(base, r.name, "index.tsx");
      expect(fs.existsSync(file)).toBe(true);
    }
  });
});
