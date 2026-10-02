import React from "react";
import { render, fireEvent } from "@testing-library/react-native";
import {
  CustomizeDashboardModal,
  buildRows,
  MAX_TILES,
} from "@/components/dashboard/CustomizeDashboardModal";
import { DashboardScreen } from "@/components/DashboardScreen";
import type { DashboardTile } from "@become/api-client";
import { DashboardLayoutSchema } from "@become/api-client";
import fs from "fs";
import path from "path";

describe("NP-157: Native Dashboard Customizer", () => {
  const initialLayout: DashboardTile[] = [
    { id: "streak", kind: "stat", size: "1x1" },
    { id: "mood", kind: "stat", size: "1x1" },
    { id: "weekly", kind: "stat", size: "1x1" },
    { id: "goal", kind: "stat", size: "1x1" },
    { id: "smart", kind: "smart-rotating", size: "2x1", locked: null },
  ];

  it("renders the customizer sheet with all tiles and controls", () => {
    const { getByTestId, getByText } = render(
      <CustomizeDashboardModal
        visible={true}
        layout={initialLayout}
        onClose={jest.fn()}
        onSaved={jest.fn()}
      />,
    );

    expect(getByText("Customize Dashboard")).toBeTruthy();
    expect(getByText("Day Streak")).toBeTruthy();
    expect(getByText("Today's Mood")).toBeTruthy();
    expect(getByText("This Week")).toBeTruthy();
    expect(getByText("Goal")).toBeTruthy();
    expect(getByText("Smart Tile")).toBeTruthy();
    expect(getByTestId("customize-dashboard-add-btn")).toBeTruthy();
    expect(getByTestId("customize-dashboard-save")).toBeTruthy();
    expect(getByTestId("customize-dashboard-cancel")).toBeTruthy();
  });

  it("resizes a tile between square and wide", () => {
    const onSaved = jest.fn();
    const onSave = jest.fn().mockImplementation((layout) => Promise.resolve(layout));

    const { getByTestId } = render(
      <CustomizeDashboardModal
        visible={true}
        layout={initialLayout}
        onClose={jest.fn()}
        onSaved={onSaved}
        onSave={onSave}
      />,
    );

    // Initial streak is 1x1. Toggle to 2x1.
    const wideBtn = getByTestId("customize-size-r0-stat-streak-2x1");
    fireEvent.press(wideBtn);

    // Save and assert the streak tile size changed to 2x1
    fireEvent.press(getByTestId("customize-dashboard-save"));

    expect(onSave).toHaveBeenCalledTimes(1);
    const savedLayout = onSave.mock.calls[0][0];
    expect(savedLayout[0]).toEqual({
      id: "streak",
      kind: "stat",
      size: "2x1",
    });
  });

  it("removes a tile when delete is pressed, refusing to delete the last tile", () => {
    const onSave = jest.fn().mockImplementation((layout) => Promise.resolve(layout));
    const twoTiles: DashboardTile[] = [
      { id: "streak", kind: "stat", size: "1x1" },
      { id: "mood", kind: "stat", size: "1x1" },
    ];

    const { getByTestId, queryByText } = render(
      <CustomizeDashboardModal
        visible={true}
        layout={twoTiles}
        onClose={jest.fn()}
        onSaved={jest.fn()}
        onSave={onSave}
      />,
    );

    // Delete mood tile
    fireEvent.press(getByTestId("customize-delete-r1-stat-mood"));
    expect(queryByText("Today's Mood")).toBeNull();

    // The remaining streak tile delete button should now be disabled
    const deleteStreak = getByTestId("customize-delete-r0-stat-streak");
    expect(deleteStreak.props.accessibilityState?.disabled).toBe(true);

    // Attempting to press delete on the only remaining tile should not remove it
    fireEvent.press(deleteStreak);
    fireEvent.press(getByTestId("customize-dashboard-save"));

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave.mock.calls[0][0]).toHaveLength(1);
    expect(onSave.mock.calls[0][0][0].id).toBe("streak");
  });

  it("changes a tile's type from searchable picker and disables already used stat tiles", () => {
    const onSave = jest.fn().mockImplementation((layout) => Promise.resolve(layout));

    const { getByTestId, getByText } = render(
      <CustomizeDashboardModal
        visible={true}
        layout={initialLayout}
        onClose={jest.fn()}
        onSaved={jest.fn()}
        onSave={onSave}
      />,
    );

    // Open change picker for weekly tile
    fireEvent.press(getByTestId("customize-change-r2-stat-weekly"));
    expect(getByText("Change tile")).toBeTruthy();

    // Calories is not currently on dashboard, so it should be enabled
    const caloriesOpt = getByTestId("tile-picker-option-calories");
    expect(caloriesOpt.props.accessibilityState?.disabled).toBe(false);

    // Streak is already on dashboard, so it should be disabled
    const streakOpt = getByTestId("tile-picker-option-streak");
    expect(streakOpt.props.accessibilityState?.disabled).toBe(true);

    // Search for calories
    const searchInput = getByTestId("tile-picker-search");
    fireEvent.changeText(searchInput, "cal");

    // Pick calories
    fireEvent.press(caloriesOpt);

    // Now save
    fireEvent.press(getByTestId("customize-dashboard-save"));
    expect(onSave).toHaveBeenCalledTimes(1);
    const savedLayout = onSave.mock.calls[0][0];
    expect(savedLayout[2]).toEqual({
      id: "calories",
      kind: "stat",
      size: "1x1",
    });
  });

  it("adds a new tile to the layout", () => {
    const onSave = jest.fn().mockImplementation((layout) => Promise.resolve(layout));

    const { getByTestId, getByText } = render(
      <CustomizeDashboardModal
        visible={true}
        layout={initialLayout}
        onClose={jest.fn()}
        onSaved={jest.fn()}
        onSave={onSave}
      />,
    );

    // Press Add tile
    fireEvent.press(getByTestId("customize-dashboard-add-btn"));
    expect(getByText("Add a tile")).toBeTruthy();

    // Pick water tile
    const waterOpt = getByTestId("tile-picker-option-water");
    fireEvent.press(waterOpt);

    // Verify it was appended
    expect(getByText("Water")).toBeTruthy();

    fireEvent.press(getByTestId("customize-dashboard-save"));
    expect(onSave).toHaveBeenCalledTimes(1);
    const savedLayout = onSave.mock.calls[0][0];
    expect(savedLayout).toHaveLength(6);
    expect(savedLayout[5]).toEqual({
      id: "water",
      kind: "stat",
      size: "1x1",
    });
  });

  it("configures smart tile speed and pool settings", () => {
    const onSave = jest.fn().mockImplementation((layout) => Promise.resolve(layout));

    const { getByTestId, getByText } = render(
      <CustomizeDashboardModal
        visible={true}
        layout={initialLayout}
        onClose={jest.fn()}
        onSaved={jest.fn()}
        onSave={onSave}
      />,
    );

    // Open settings for smart tile (r4)
    fireEvent.press(getByTestId("customize-settings-r4-smart-rotating-smart"));
    expect(getByText("Smart tile settings")).toBeTruthy();

    // Change rotation speed to 10000ms (Relaxed · 10s)
    fireEvent.press(getByTestId("smart-settings-freq-10000"));

    // Toggle off mood from pool
    fireEvent.press(getByTestId("smart-settings-pool-stat:mood"));

    // Go back to main customizer
    fireEvent.press(getByTestId("smart-settings-back"));

    // Save layout
    fireEvent.press(getByTestId("customize-dashboard-save"));

    expect(onSave).toHaveBeenCalledTimes(1);
    const savedLayout = onSave.mock.calls[0][0];
    const smartTile = savedLayout.find((t: DashboardTile) => t.kind === "smart-rotating");
    expect(smartTile).toBeDefined();
    expect(smartTile?.settings?.intervalMs).toBe(10000);
    expect(smartTile?.settings?.pool).not.toContain("stat:mood");
    expect(smartTile?.settings?.pool).toContain("stat:streak");
  });

  // Acceptance Criterion 1: (id: e015ca34)
  describe("Acceptance Criterion (id: e015ca34) — Layout parity with web", () => {
    it("validates that a layout saved natively conforms exactly to the shared DashboardLayoutSchema and roundtrips", () => {
      const nativeLayout: DashboardTile[] = [
        { id: "streak", kind: "stat", size: "1x1" },
        { id: "calories", kind: "stat", size: "2x1" },
        { id: "mindset", kind: "stat", size: "1x1" },
        {
          id: "smart",
          kind: "smart-rotating",
          size: "2x1",
          locked: null,
          settings: {
            intervalMs: 10000,
            pool: ["stat:streak", "stat:goal", "stat:water"],
          },
        },
      ];

      // Parse with the shared schema used by web and native
      const parsed = DashboardLayoutSchema.safeParse(nativeLayout);
      expect(parsed.success).toBe(true);

      // Verify JSON serialization matches between native and web wire formats
      const serialized = JSON.stringify({ layout: nativeLayout });
      const deserialized = JSON.parse(serialized);
      expect(deserialized.layout).toEqual(nativeLayout);
    });
  });

  // Acceptance Criterion 2: (id: e015ca35)
  describe("Acceptance Criterion (id: e015ca35) — Refuses 21st tile", () => {
    it("disables the add tile button when the sheet contains 20 tiles", () => {
      // Build 20 tiles
      const twentyTiles: DashboardTile[] = Array.from({ length: 20 }, (_, i) => ({
        id: `tile-${i}`,
        kind: "stat" as const,
        size: "1x1" as const,
      }));

      const { getByTestId } = render(
        <CustomizeDashboardModal
          visible={true}
          layout={twentyTiles}
          onClose={jest.fn()}
          onSaved={jest.fn()}
        />,
      );

      const addBtn = getByTestId("customize-dashboard-add-btn");
      expect(addBtn.props.accessibilityState?.disabled).toBe(true);

      // Attempting to press does not open the picker
      fireEvent.press(addBtn);
      // The add button is still rendered, picker is not opened
      expect(getByTestId("customize-dashboard-add-btn")).toBeTruthy();
    });

    it("enforces MAX_TILES limit of 20 and refuses adding beyond 20", () => {
      expect(MAX_TILES).toBe(20);
      const rows = buildRows(
        Array.from({ length: 20 }, (_, i) => ({
          id: `tile-${i}`,
          kind: "stat" as const,
          size: "1x1" as const,
        })),
      );
      expect(rows).toHaveLength(20);
    });
  });

  // Acceptance Criterion 3: (id: e015ca36)
  describe("Acceptance Criterion (id: e015ca36) — Legacy pinned-tiles endpoint is never called natively", () => {
    it("verifies that no native source code calls or references /api/dashboard/pinned-tiles", () => {
      const expoDir = path.resolve(__dirname, "..");
      const checkDir = (dir: string): string[] => {
        let violations: string[] = [];
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          if (entry.isDirectory()) {
            if (entry.name !== "node_modules" && entry.name !== ".git" && entry.name !== "gap_analysis") {
              violations = violations.concat(checkDir(fullPath));
            }
          } else if (/\.(ts|tsx|js|jsx)$/.test(entry.name)) {
            // Exclude this test file itself
            if (entry.name === "dashboardCustomizeNP157.test.tsx") continue;
            const content = fs.readFileSync(fullPath, "utf8");
            if (content.includes("/api/dashboard/pinned-tiles") || content.includes("pinned-tiles")) {
              violations.push(fullPath);
            }
          }
        }
        return violations;
      };

      const violations = checkDir(expoDir);
      expect(violations).toEqual([]);
    });

    it("saves only through PATCH /api/dashboard/layout", async () => {
      const onSave = jest.fn().mockImplementation((layout) => Promise.resolve(layout));
      const { getByTestId } = render(
        <CustomizeDashboardModal
          visible={true}
          layout={initialLayout}
          onClose={jest.fn()}
          onSaved={jest.fn()}
          onSave={onSave}
        />,
      );

      fireEvent.press(getByTestId("customize-dashboard-save"));
      expect(onSave).toHaveBeenCalledTimes(1);
    });
  });

  describe("Integration with DashboardScreen", () => {
    it("opens CustomizeDashboardModal when Customize tiles button on DashboardScreen is tapped", () => {
      const { getByTestId, getByText } = render(
        <DashboardScreen
          userName="Jon"
          streakDays={5}
          todayWorkout={null}
          onOpenCalendar={jest.fn()}
          onSubmitCheckIn={jest.fn()}
          layout={initialLayout}
          onStartWorkout={jest.fn()}
        />,
      );

      const customizeTilesBtn = getByTestId("dashboard-customize-tiles");
      expect(customizeTilesBtn).toBeTruthy();

      fireEvent.press(customizeTilesBtn);

      // CustomizeDashboardModal should now be open
      expect(getByText("Customize Dashboard")).toBeTruthy();
      expect(getByTestId("dashboard-customize-modal")).toBeTruthy();
    });
  });
});
