import React from "react";
import { render, fireEvent } from "@testing-library/react-native";
import { TileGrid } from "@/components/dashboard/TileGrid";
import { TileErrorBoundary } from "@/components/dashboard/TileErrorBoundary";
import {
  writeCachedLayout,
  readCachedLayout,
  getCachedLayoutSync,
} from "@/lib/dashboard/tileLayout";
import { clearAll } from "@/lib/cache/lastKnown";
import { Text, View } from "react-native";
import type { DashboardTile } from "@become/api-client";

const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({}),
}));

describe("TileGrid and Dashboard Tiles (NP-104)", () => {
  beforeEach(async () => {
    mockPush.mockReset();
    await clearAll();
  });

  // ─── Acceptance Criterion 1: e015c902 ──────────────────────────────────────
  describe("e015c902: Layout order and sizes parity", () => {
    it("renders tiles arranged on the web in the exact same order and sizes natively", () => {
      const webLayout: DashboardTile[] = [
        { id: "mindset", kind: "stat", size: "1x1" },
        { id: "workoutNow", kind: "stat", size: "2x1" },
        { id: "nutrition", kind: "stat", size: "1x1" },
        { id: "smart", kind: "smart-rotating", size: "2x1" },
        { id: "streak", kind: "stat", size: "1x1" },
      ];

      const { getByTestId } = render(<TileGrid layout={webLayout} />);
      const grid = getByTestId("tilegrid");

      // Verify all tiles are present
      expect(getByTestId("tile-mindset")).toBeTruthy();
      expect(getByTestId("tile-workoutNow")).toBeTruthy();
      expect(getByTestId("tile-nutrition")).toBeTruthy();
      expect(getByTestId("tile-smart")).toBeTruthy();
      expect(getByTestId("tile-streak")).toBeTruthy();

      // Check order of children
      const children = grid.props.children;
      expect(children).toHaveLength(5);
      expect(children[0].key).toContain("mindset");
      expect(children[1].key).toContain("workoutNow");
      expect(children[2].key).toContain("nutrition");
      expect(children[3].key).toContain("smart");
      expect(children[4].key).toContain("streak");

      // Check sizes: 1x1 has column width, 2x1 spans full row width (100%)
      expect(children[0].props.style).toEqual(
        expect.arrayContaining([expect.objectContaining({ width: expect.any(Number) })]),
      );
      expect(children[1].props.style).toEqual(
        expect.arrayContaining([expect.objectContaining({ width: "100%" })]),
      );
      expect(children[2].props.style).toEqual(
        expect.arrayContaining([expect.objectContaining({ width: expect.any(Number) })]),
      );
      expect(children[3].props.style).toEqual(
        expect.arrayContaining([expect.objectContaining({ width: "100%" })]),
      );
      expect(children[4].props.style).toEqual(
        expect.arrayContaining([expect.objectContaining({ width: expect.any(Number) })]),
      );
    });
  });

  // ─── Acceptance Criterion 2: e015c903 ──────────────────────────────────────
  describe("e015c903: Metric and smart tiles render placeholders without error", () => {
    it("renders metric and smart-rotating tiles as placeholders, never throwing an error", () => {
      const mixedLayout: DashboardTile[] = [
        { id: "volume-load", kind: "metric", size: "1x1" },
        { id: "prs-trend", kind: "metric", size: "2x1" },
        {
          id: "smart",
          kind: "smart-rotating",
          size: "2x1",
          locked: null,
          settings: { pool: ["stat:streak", "stat:mood"], intervalMs: 6000 },
        },
        {
          id: "smart-2",
          kind: "smart-rotating",
          size: "1x1",
          locked: "stat:streak",
        },
      ];

      expect(() => {
        const { getByTestId } = render(<TileGrid layout={mixedLayout} />);
        expect(getByTestId("tile-volume-load")).toBeTruthy();
        expect(getByTestId("tile-prs-trend")).toBeTruthy();
        expect(getByTestId("tile-smart")).toBeTruthy();
        expect(getByTestId("tile-smart-2")).toBeTruthy();
      }).not.toThrow();
    });

    it("renders stat tiles as placeholders until NP-107 and NP-108 land", () => {
      const statLayout: DashboardTile[] = [
        { id: "streak", kind: "stat", size: "1x1" },
        { id: "mood", kind: "stat", size: "1x1" },
        { id: "weekly", kind: "stat", size: "1x1" },
        { id: "goal", kind: "stat", size: "1x1" },
        { id: "calories", kind: "stat", size: "1x1" },
        { id: "water", kind: "stat", size: "1x1" },
        { id: "weight", kind: "stat", size: "1x1" },
        { id: "workouts", kind: "stat", size: "1x1" },
      ];

      const { getByTestId } = render(<TileGrid layout={statLayout} />);
      for (const t of statLayout) {
        expect(getByTestId(`tile-${t.id}`)).toBeTruthy();
      }
    });
  });

  // ─── Acceptance Criterion 3: e015c904 ──────────────────────────────────────
  describe("e015c904: Tile error boundary and isolation", () => {
    it("shows empty/fallback state when a tile throws, and the rest of the grid still renders", () => {
      // Temporarily silence console.error for expected caught error
      const consoleErrorSpy = jest
        .spyOn(console, "error")
        .mockImplementation(() => {});

      function BrokenTile(): React.ReactElement {
        throw new Error("Simulated tile load failure");
      }

      function WorkingTile(): React.ReactElement {
        return (
          <View testID="working-tile">
            <Text>Working</Text>
          </View>
        );
      }

      const { getByTestId, queryByTestId } = render(
        <View testID="test-grid">
          <TileErrorBoundary label="broken" testID="tile-error-broken">
            <BrokenTile />
          </TileErrorBoundary>
          <TileErrorBoundary label="working" testID="tile-error-working">
            <WorkingTile />
          </TileErrorBoundary>
        </View>,
      );

      // The broken tile is replaced by fallback
      expect(getByTestId("tile-error-broken")).toBeTruthy();
      expect(getByTestId("tile-error-broken").props.children.props.children).toContain(
        "broken unavailable",
      );

      // The working tile still renders!
      expect(getByTestId("working-tile")).toBeTruthy();
      expect(queryByTestId("tile-error-working")).toBeNull();

      consoleErrorSpy.mockRestore();
    });
  });

  // ─── Acceptance Criterion 4: e015c905 ──────────────────────────────────────
  describe("e015c905: Cache persistence and offline relaunch", () => {
    it("relaunching with no network shows the last layout from the cache", async () => {
      const cachedLayout: DashboardTile[] = [
        { id: "mindset", kind: "stat", size: "1x1" },
        { id: "nutrition", kind: "stat", size: "2x1" },
        { id: "workoutNow", kind: "stat", size: "1x1" },
      ];

      // Pre-seed the last-known cache
      await writeCachedLayout(cachedLayout);

      // Verify readCachedLayout retrieves it synchronously and asynchronously
      expect(getCachedLayoutSync()).toEqual(cachedLayout);
      const asyncRead = await readCachedLayout();
      expect(asyncRead).toEqual(cachedLayout);

      // Render uncontrolled TileGrid without network (simulating offline relaunch)
      const { getByTestId } = render(<TileGrid />);

      // The grid displays the tiles from cache!
      expect(getByTestId("tile-mindset")).toBeTruthy();
      expect(getByTestId("tile-nutrition")).toBeTruthy();
      expect(getByTestId("tile-workoutNow")).toBeTruthy();
    });
  });

  // ─── Action Tiles Porting ──────────────────────────────────────────────────
  describe("Action Tiles Porting (mindset, nutrition, workoutNow)", () => {
    it("mindset tile triggers onOpenMind callback or navigates to Mind tab with start=1", () => {
      const layout: DashboardTile[] = [{ id: "mindset", kind: "stat", size: "1x1" }];
      const onOpenMind = jest.fn();

      // With custom callback
      const { getByTestId, rerender } = render(
        <TileGrid layout={layout} onOpenMind={onOpenMind} />,
      );
      fireEvent.press(getByTestId("tile-mindset"));
      expect(onOpenMind).toHaveBeenCalledTimes(1);

      // Default router fallback
      rerender(<TileGrid layout={layout} />);
      fireEvent.press(getByTestId("tile-mindset"));
      expect(mockPush).toHaveBeenCalledWith("/(tabs)/mind?start=1");
    });

    it("nutrition tile triggers onOpenNutrition callback or navigates to Nutrition tab", () => {
      const layout: DashboardTile[] = [{ id: "nutrition", kind: "stat", size: "1x1" }];
      const onOpenNutrition = jest.fn();

      // With custom callback
      const { getByTestId, rerender } = render(
        <TileGrid layout={layout} onOpenNutrition={onOpenNutrition} />,
      );
      fireEvent.press(getByTestId("tile-nutrition"));
      expect(onOpenNutrition).toHaveBeenCalledTimes(1);

      // Default router fallback
      rerender(<TileGrid layout={layout} />);
      fireEvent.press(getByTestId("tile-nutrition"));
      expect(mockPush).toHaveBeenCalledWith("/(tabs)/nutrition");
    });

    it("workoutNow tile triggers onOpenWorkoutNow callback or navigates to programming quick session", () => {
      const layout: DashboardTile[] = [{ id: "workoutNow", kind: "stat", size: "2x1" }];
      const onOpenWorkoutNow = jest.fn();

      // With custom callback
      const { getByTestId, rerender } = render(
        <TileGrid layout={layout} onOpenWorkoutNow={onOpenWorkoutNow} />,
      );
      fireEvent.press(getByTestId("tile-workoutNow"));
      expect(onOpenWorkoutNow).toHaveBeenCalledTimes(1);

      // Default router fallback
      rerender(<TileGrid layout={layout} />);
      fireEvent.press(getByTestId("tile-workoutNow"));
      expect(mockPush).toHaveBeenCalledWith("/(tabs)/programming?quick=true");
    });
  });
});
