// Card NP-351: Spacing/type: Home (Dashboard) - metric tile grid equal heights
// & horizontal layout, chart gridlines & domain, Becoming door & card padding parity.

import * as fs from "fs";
import * as path from "path";

const EXPO_DIR = path.resolve(__dirname, "..");
const readExpo = (rel: string): string =>
  fs.readFileSync(path.join(EXPO_DIR, rel), "utf8");

describe("NP-351 Acceptance Tests: Home (Dashboard) Spacing, Layout & Parity", () => {
  // 1. Header & global chrome parity
  describe("1. Header & Global Chrome Parity", () => {
    it("DashboardScreen defines header greeting, subtext, profile avatar, settings button, and scroll container", () => {
      const src = readExpo("components/DashboardScreen.tsx");
      expect(src).toContain('testID="dashboard-greeting"');
      expect(src).toContain("Track your fitness journey");
      expect(src).toContain('testID="dashboard-header-avatar"');
      expect(src).toContain('testID="dashboard-open-settings"');
      expect(src).toContain('testID="dashboard-scroll"');
    });
  });

  // 2. Becoming Door (BecomingDoor.tsx)
  describe("2. Becoming Door Parity", () => {
    it("BecomingDoor assigns violet to Mind, destructive red to Fuel, success green to Training", () => {
      const src = readExpo("components/dashboard/BecomingDoor.tsx");
      expect(src).toContain('colors["mind-violet"]');
      expect(src).toContain("colors.destructive");
      expect(src).toContain("colors.success");
    });

    it("BecomingDoor chips use borderRadius: 8, iconBadge uses borderRadius: 12", () => {
      const src = readExpo("components/dashboard/BecomingDoor.tsx");
      expect(src).toContain("borderRadius: 8");
      expect(src).toContain("borderRadius: 12");
    });

    it("BecomingDoor chip values and subtitles specify single line truncation", () => {
      const src = readExpo("components/dashboard/BecomingDoor.tsx");
      expect(src).toContain('numberOfLines={1}');
      expect(src).toContain('ellipsizeMode="tail"');
    });
  });

  // 3. Metric Tile Grid - Fixed Equal Height (TileGrid.tsx, StatTile.tsx, StreakTile.tsx)
  describe("3. Metric Tile Grid Fixed Equal Height", () => {
    it("TileGrid enforces fixed 96px equal height across all cells", () => {
      const src = readExpo("components/dashboard/TileGrid.tsx");
      expect(src).toContain("height: 96");
    });

    it("StatTile, StreakTile, and StatActionTile cards have minHeight 96 and height 100%", () => {
      const statSrc = readExpo("components/dashboard/StatTile.tsx");
      const streakSrc = readExpo("components/dashboard/StreakTile.tsx");
      const actionSrc = readExpo("components/dashboard/StatActionTile.tsx");

      expect(statSrc).toContain("minHeight: 96");
      expect(statSrc).toContain('height: "100%"');

      expect(streakSrc).toContain("minHeight: 96");
      expect(streakSrc).toContain('height: "100%"');

      expect(actionSrc).toContain("minHeight: 96");
      expect(actionSrc).toContain('height: "100%"');
    });
  });

  // 4. Metric Tile Grid - 1x1 Tile Layout
  describe("4. Metric Tile Grid 1x1 Layout", () => {
    it("StatTile 1x1 layout has circular 36x36 badge on left and stacked label + 2xl font-extrabold value on right", () => {
      const src = readExpo("components/dashboard/StatTile.tsx");
      expect(src).toContain("badge1x1: {");
      expect(src).toContain("width: 36");
      expect(src).toContain("height: 36");
      expect(src).toContain("borderRadius: 18");
      expect(src).toContain("squareTopRow: {");
      expect(src).toContain("squareMeta: {");
      expect(src).toContain("text-2xl font-extrabold tracking-tight leading-none");
    });

    it("StreakTile 1x1 layout has circular 36x36 badge and stacked label + 2xl font-extrabold value", () => {
      const src = readExpo("components/dashboard/StreakTile.tsx");
      expect(src).toContain("badge1x1: {");
      expect(src).toContain("width: 36");
      expect(src).toContain("height: 36");
      expect(src).toContain("borderRadius: 18");
      expect(src).toContain("squareTopRow: {");
      expect(src).toContain("squareMeta: {");
      expect(src).toContain("text-2xl font-extrabold tracking-tight leading-none");
    });
  });

  // 5. Super Streak Tile
  describe("5. Super Streak Tile Value Styling", () => {
    it("StreakTile renders super streak value in FireNumber without text-foreground overriding it", () => {
      const src = readExpo("components/dashboard/StreakTile.tsx");
      const renderValBlock = src.slice(
        src.indexOf("const renderValue ="),
        src.indexOf("return (", src.indexOf("const renderValue =")),
      );
      expect(renderValBlock).toContain("<FireNumber>{p.value}</FireNumber>");
      expect(renderValBlock).not.toContain('text-foreground"');
    });
  });

  // 6. 2x1 Smart Tile Layout (StatTile.tsx & SmartRotatingTile.tsx)
  describe("6. 2x1 Smart Tile Layout & Forwarding", () => {
    it("StatTile 2x1 layout has 44x44 badge with 3xl font-extrabold value in left column, and full-width bar + caption in right column", () => {
      const src = readExpo("components/dashboard/StatTile.tsx");
      expect(src).toContain("badge: {");
      expect(src).toContain("width: 44");
      expect(src).toContain("height: 44");
      expect(src).toContain("borderRadius: 12");
      expect(src).toContain("text-3xl font-extrabold tracking-tight leading-none");
      expect(src).toContain("wideRight: {");
      expect(src).toContain("flex: 1");
    });

    it("SmartRotatingTile forwards tile.size to stat and action tiles", () => {
      const src = readExpo("components/dashboard/SmartRotatingTile.tsx");
      expect(src).toContain("tile={{ id: item.id, kind: \"stat\", size: tile.size }}");
      expect(src).not.toContain("tile={{ id: item.id, kind: \"stat\", size: \"1x1\" }}");
    });
  });

  // 7. Suggestion / Nudge Card (SuggestionTile.tsx)
  describe("7. Suggestion / Nudge Card Styling", () => {
    it("SuggestionTile container uses borderRadius: 12, padding: 12", () => {
      const src = readExpo("components/dashboard/SuggestionTile.tsx");
      expect(src).toContain("container: {");
      expect(src).toContain("borderRadius: 12");
      expect(src).toContain("padding: 12");
    });

    it("SuggestionTile dismiss button has circular ring container (36x36, borderRadius: 18, borderWidth: 1)", () => {
      const src = readExpo("components/dashboard/SuggestionTile.tsx");
      expect(src).toContain("dismissBtn: {");
      expect(src).toContain("width: 36");
      expect(src).toContain("height: 36");
      expect(src).toContain("borderRadius: 18");
      expect(src).toContain("borderWidth: 1");
    });

    it("SuggestionTile pill CTA button uses rounded-full pill styling with 12px font", () => {
      const src = readExpo("components/dashboard/SuggestionTile.tsx");
      expect(src).toContain("actionBtn: {");
      expect(src).toContain("paddingHorizontal: 12");
      expect(src).toContain("paddingVertical: 4");
      expect(src).toContain("borderRadius: 999");
      expect(src).toContain("fontSize: 12");
      expect(src).toContain('fontWeight: "500"');
    });
  });

  // 8. Customize Tiles Link Margins
  describe("8. Customize Tiles Link Margins", () => {
    it("DashboardScreen sets Customize tiles wrapper marginTop: 8 and marginBottom: 0", () => {
      const src = readExpo("components/DashboardScreen.tsx");
      expect(src).toContain("marginTop: 8");
      expect(src).toContain("marginBottom: 0");
    });
  });

  // 9. Weight Progress Chart (ProgressChart.tsx)
  describe("9. Weight Progress Chart Data-Driven Domain & Gridlines", () => {
    it("ProgressChart calculates data-driven Y-domain without inflating with targetWeight", () => {
      const src = readExpo("components/dashboard/ProgressChart.tsx");
      expect(src).toContain("const minVal = Math.min(...values);");
      expect(src).toContain("const maxVal = Math.max(...values);");
      expect(src).toContain("let yMin = minVal - 2;");
      expect(src).toContain("let yMax = maxVal + 2;");
      // Must not inflate minVal/maxVal with targetWeight
      expect(src).not.toContain("minVal = Math.min(minVal, targetWeight);");
    });

    it("ProgressChart omits target line when targetWeight is outside domain", () => {
      const src = readExpo("components/dashboard/ProgressChart.tsx");
      expect(src).toContain("targetWeight >= yMin &&");
      expect(src).toContain("targetWeight <= yMax");
    });

    it("ProgressChart renders 4 horizontal gridlines and numeric ticks", () => {
      const src = readExpo("components/dashboard/ProgressChart.tsx");
      expect(src).toContain("[0, 1 / 3, 2 / 3, 1].map((ratio, idx) => {");
      expect(src).toContain("grid-h-");
    });

    it("ProgressChart renders 5 vertical gridlines and 5 evenly spaced date ticks", () => {
      const src = readExpo("components/dashboard/ProgressChart.tsx");
      expect(src).toContain("weightChartXTickIndices(pts.length, 5)");
      expect(src).toContain("grid-v-");
    });
  });

  // 10. Nutrition Card (NutritionCard.tsx)
  describe("10. Nutrition Card Button & Text Styling", () => {
    it("NutritionCard primary and secondary buttons use paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8", () => {
      const src = readExpo("components/dashboard/NutritionCard.tsx");
      expect(src).toContain("primaryButton: {");
      expect(src).toContain("paddingVertical: 8");
      expect(src).toContain("paddingHorizontal: 12");
      expect(src).toContain("borderRadius: 8");
    });

    it("NutritionCard Quick Add button uses mode-aware text color", () => {
      const src = readExpo("components/dashboard/NutritionCard.tsx");
      expect(src).toContain('const quickAddColor = isDark ? "rgb(212, 212, 216)" : "rgb(63, 63, 70)";');
      expect(src).toContain("color: quickAddColor");
    });
  });

  // 11. Current Program Card (CurrentProgramCard.tsx)
  describe("11. Current Program Card Progress Link Color", () => {
    it("CurrentProgramCard progress link uses text-muted-foreground instead of text-blue", () => {
      const src = readExpo("components/dashboard/CurrentProgramCard.tsx");
      expect(src).toContain('className="text-xs text-muted-foreground font-medium"');
      expect(src).not.toContain('text-xs text-blue-600');
    });
  });

  // 12. Mindset Card (MindsetCard.tsx)
  describe("12. Mindset Card Badge, Status Text & CTA Styling", () => {
    it("MindsetCard brain badge is 40x40 with borderRadius: 12", () => {
      const src = readExpo("components/dashboard/MindsetCard.tsx");
      expect(src).toContain("brainBadge: {");
      expect(src).toContain("width: 40");
      expect(src).toContain("height: 40");
      expect(src).toContain("borderRadius: 12");
    });

    it("MindsetCard status text specifies fontSize: 14 and fontWeight: '500'", () => {
      const src = readExpo("components/dashboard/MindsetCard.tsx");
      expect(src).toContain("statusText: {");
      expect(src).toContain("fontSize: 14");
      expect(src).toContain('fontWeight: "500"');
    });

    it("MindsetCard CTA button specifies borderRadius: 8 and paddingVertical: 10", () => {
      const src = readExpo("components/dashboard/MindsetCard.tsx");
      expect(src).toContain("ctaButton: {");
      expect(src).toContain("borderRadius: 8");
      expect(src).toContain("paddingVertical: 10");
    });
  });

  // 13. Quick Links (DashboardQuickLinks.tsx & DashboardScreen.tsx)
  describe("13. Quick Links Connect Card", () => {
    it("DashboardQuickLinks includes 4th card Connect with MessageCircle icon and wires onOpenChat", () => {
      const src = readExpo("components/dashboard/DashboardQuickLinks.tsx");
      expect(src).toContain('testID="dashboard-quick-link-connect"');
      expect(src).toContain("MessageCircle");
      expect(src).toContain("Connect");
      expect(src).toContain("Chat with trainers");
      expect(src).toContain("onOpenChat");
    });

    it("DashboardScreen wires onOpenChat to DashboardQuickLinks", () => {
      const src = readExpo("components/DashboardScreen.tsx");
      expect(src).toContain("onOpenChat={onOpenChat}");
    });
  });

  // 14. Dashboard Card Padding & Gap
  describe("14. Dashboard Card Padding & Gap", () => {
    it("DashboardScreen contentContainerStyle specifies padding: 16 and gap: 12", () => {
      const src = readExpo("components/DashboardScreen.tsx");
      expect(src).toContain("contentContainerStyle={{ padding: 16, gap: 12 }}");
    });
  });
});
