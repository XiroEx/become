import React from "react";
import { render, fireEvent, waitFor } from "@testing-library/react-native";
import {
  CustomizeDashboardModal,
  buildRows,
  metaForRow,
  CATALOG,
  POOL_OPTIONS,
  MAX_TILES,
} from "@/components/dashboard/CustomizeDashboardModal";
import { DashboardScreen } from "@/components/DashboardScreen";
import {
  DashboardLayoutSchema,
  type DashboardTile,
} from "@become/api-client";

const mockPush = jest.fn();
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({}),
}));

const mockApiFetch = jest.fn();
jest.mock("@become/api-client", () => {
  const actual = jest.requireActual("@become/api-client");
  return {
    ...actual,
    apiFetch: (...args: unknown[]) => mockApiFetch(...args),
  };
});

describe("NP-157: Native Dashboard Customizer", () => {
  const sampleLayout: DashboardTile[] = [
    { id: "streak", kind: "stat", size: "1x1" },
    { id: "mood", kind: "stat", size: "1x1" },
    { id: "weekly", kind: "stat", size: "1x1" },
    {
      id: "smart",
      kind: "smart-rotating",
      size: "2x1",
      settings: { pool: ["stat:streak", "stat:mood"], intervalMs: 6000 },
    },
  ];

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("1. Rendering & Structure", () => {
    it("renders customizer sheet with current tiles and controls", () => {
      const { getByTestId, getByText } = render(
        <CustomizeDashboardModal
          visible={true}
          layout={sampleLayout}
          onClose={jest.fn()}
          onSaved={jest.fn()}
        />,
      );

      expect(getByText("Customize Dashboard")).toBeTruthy();
      expect(getByText("Day Streak")).toBeTruthy();
      expect(getByText("Today's Mood")).toBeTruthy();
      expect(getByText("This Week")).toBeTruthy();
      expect(getByText("Smart Tile")).toBeTruthy();
      expect(getByTestId("customizer-add-tile")).toBeTruthy();
      expect(getByTestId("customizer-cancel")).toBeTruthy();
      expect(getByTestId("customizer-save")).toBeTruthy();
    });

    it("displays helper model utilities accurately", () => {
      const rows = buildRows(sampleLayout);
      expect(rows).toHaveLength(4);
      expect(rows[0]!.kind).toBe("stat");
      expect(rows[3]!.kind).toBe("smart-rotating");
      expect(metaForRow(rows[0]!).label).toBe("Day Streak");
      expect(metaForRow(rows[3]!).label).toBe("Smart Tile");
      expect(CATALOG.length).toBeGreaterThan(10);
      expect(POOL_OPTIONS.length).toBeGreaterThan(5);
    });
  });

  describe("2. Resize (1x1 ⇄ 2x1)", () => {
    it("toggles a tile size between square and wide", () => {
      const onSaved = jest.fn();
      const { getByTestId } = render(
        <CustomizeDashboardModal
          visible={true}
          layout={sampleLayout}
          onClose={jest.fn()}
          onSaved={onSaved}
        />,
      );

      const rows = buildRows(sampleLayout);
      const firstRowId = rows[0]!.rowId;

      const squareBtn = getByTestId(`customizer-size-square-${firstRowId}`);
      const wideBtn = getByTestId(`customizer-size-wide-${firstRowId}`);

      expect(squareBtn.props.accessibilityState.selected).toBe(true);
      expect(wideBtn.props.accessibilityState.selected).toBe(false);

      // Change to wide
      fireEvent.press(wideBtn);
      expect(squareBtn.props.accessibilityState.selected).toBe(false);
      expect(wideBtn.props.accessibilityState.selected).toBe(true);

      // Change back to square
      fireEvent.press(squareBtn);
      expect(squareBtn.props.accessibilityState.selected).toBe(true);
      expect(wideBtn.props.accessibilityState.selected).toBe(false);
    });
  });

  describe("3. Deletion & Constraints", () => {
    it("removes a tile from the layout when delete is pressed", () => {
      const { getByTestId, queryByText } = render(
        <CustomizeDashboardModal
          visible={true}
          layout={sampleLayout}
          onClose={jest.fn()}
          onSaved={jest.fn()}
        />,
      );

      const rows = buildRows(sampleLayout);
      expect(rows).toHaveLength(4);

      // Delete This Week tile
      fireEvent.press(getByTestId(`customizer-delete-${rows[2]!.rowId}`));
      expect(queryByText("This Week")).toBeNull();
    });

    it("disables delete button when only 1 tile remains", () => {
      const singleTileLayout: DashboardTile[] = [
        { id: "streak", kind: "stat", size: "1x1" },
      ];
      const { getByTestId } = render(
        <CustomizeDashboardModal
          visible={true}
          layout={singleTileLayout}
          onClose={jest.fn()}
          onSaved={jest.fn()}
        />,
      );

      const rows = buildRows(singleTileLayout);
      const deleteBtn = getByTestId(`customizer-delete-${rows[0]!.rowId}`);
      expect(deleteBtn.props.accessibilityState.disabled).toBe(true);

      // Pressing it does not remove the tile
      fireEvent.press(deleteBtn);
      expect(getByTestId(`customizer-row-${rows[0]!.rowId}`)).toBeTruthy();
    });
  });

  describe("4. Searchable Tile Picker (Change & Add)", () => {
    it("opens picker to change a tile and replaces its type", () => {
      const { getByTestId, getByText, queryByTestId } = render(
        <CustomizeDashboardModal
          visible={true}
          layout={sampleLayout}
          onClose={jest.fn()}
          onSaved={jest.fn()}
        />,
      );

      const rows = buildRows(sampleLayout);
      // Press "Tap to change" on first row (Day Streak)
      fireEvent.press(getByTestId(`customizer-change-${rows[0]!.rowId}`));

      // Picker is open
      expect(getByText("Change tile")).toBeTruthy();
      expect(getByTestId("customizer-picker-search")).toBeTruthy();

      // Pick Calories option
      fireEvent.press(getByTestId("customizer-picker-option-calories"));

      // Picker is closed, tile is changed to Calories
      expect(queryByTestId("customizer-picker-search")).toBeNull();
      expect(getByText("Calories")).toBeTruthy();
    });

    it("filters options by search query in picker", () => {
      const { getByTestId, queryByTestId, getByText } = render(
        <CustomizeDashboardModal
          visible={true}
          layout={sampleLayout}
          onClose={jest.fn()}
          onSaved={jest.fn()}
        />,
      );

      const rows = buildRows(sampleLayout);
      fireEvent.press(getByTestId(`customizer-change-${rows[0]!.rowId}`));

      // Type "water" into search
      fireEvent.changeText(
        getByTestId("customizer-picker-search"),
        "water",
      );

      expect(getByTestId("customizer-picker-option-water")).toBeTruthy();
      expect(queryByTestId("customizer-picker-option-workouts")).toBeNull();

      // Cancel picker
      fireEvent.press(getByTestId("customizer-picker-back"));
      expect(queryByTestId("customizer-picker-search")).toBeNull();
      expect(getByText("Day Streak")).toBeTruthy();
    });

    it("appends a new tile when Add tile is chosen", () => {
      const { getByTestId, getByText } = render(
        <CustomizeDashboardModal
          visible={true}
          layout={sampleLayout}
          onClose={jest.fn()}
          onSaved={jest.fn()}
        />,
      );

      // Open Add tile picker
      fireEvent.press(getByTestId("customizer-add-tile"));
      expect(getByText("Add a tile")).toBeTruthy();

      // Pick water
      fireEvent.press(getByTestId("customizer-picker-option-water"));

      // Water tile is now added
      expect(getByText("Water")).toBeTruthy();
    });

    it("disables options already on the dashboard in picker", () => {
      const { getByTestId } = render(
        <CustomizeDashboardModal
          visible={true}
          layout={sampleLayout}
          onClose={jest.fn()}
          onSaved={jest.fn()}
        />,
      );

      fireEvent.press(getByTestId("customizer-add-tile"));

      // streak and mood are already on dashboard
      const streakOpt = getByTestId("customizer-picker-option-streak");
      expect(streakOpt.props.accessibilityState.disabled).toBe(true);

      const waterOpt = getByTestId("customizer-picker-option-water");
      expect(waterOpt.props.accessibilityState.disabled).toBe(false);
    });
  });

  describe("5. 20-Tile Limit (e015ca35)", () => {
    it("refuses a 21st tile by disabling the Add tile button at 20 tiles", () => {
      // Create a 20-tile layout
      const twentyTiles: DashboardTile[] = Array.from(
        { length: MAX_TILES },
        (_, i) => ({
          id: `tile-${i}`,
          kind: "stat",
          size: "1x1",
        }),
      );

      const { getByTestId } = render(
        <CustomizeDashboardModal
          visible={true}
          layout={twentyTiles}
          onClose={jest.fn()}
          onSaved={jest.fn()}
        />,
      );

      const addBtn = getByTestId("customizer-add-tile");
      expect(addBtn.props.accessibilityState.disabled).toBe(true);

      // Pressing it does nothing
      fireEvent.press(addBtn);
      // Still on customizer, picker did not open
      expect(getByTestId("customizer-save")).toBeTruthy();
    });
  });

  describe("6. Smart Tile Settings", () => {
    it("configures smart tile rotation speed and pool options", () => {
      const { getByTestId, getByText, queryByTestId } = render(
        <CustomizeDashboardModal
          visible={true}
          layout={sampleLayout}
          onClose={jest.fn()}
          onSaved={jest.fn()}
        />,
      );

      const rows = buildRows(sampleLayout);
      const smartRow = rows[3]!;

      // Open settings
      fireEvent.press(getByTestId(`customizer-settings-${smartRow.rowId}`));
      expect(getByText("Smart tile settings")).toBeTruthy();
      expect(getByText("Rotation speed")).toBeTruthy();
      expect(getByText("Cards to rotate through")).toBeTruthy();

      // Change speed to 10s (relaxed)
      const speed10s = getByTestId("customizer-speed-10000");
      fireEvent.press(speed10s);
      expect(speed10s.props.accessibilityState.selected).toBe(true);

      // Toggle pool: add weekly
      const poolWeekly = getByTestId("customizer-pool-weekly");
      expect(poolWeekly.props.accessibilityState.checked).toBe(false);
      fireEvent.press(poolWeekly);
      expect(poolWeekly.props.accessibilityState.checked).toBe(true);

      // Close settings
      fireEvent.press(getByTestId("customizer-settings-back"));
      expect(queryByTestId("customizer-settings-back")).toBeNull();
    });

    it("prevents deselecting the last card in the smart pool", () => {
      const singlePoolLayout: DashboardTile[] = [
        {
          id: "smart",
          kind: "smart-rotating",
          size: "1x1",
          settings: { pool: ["stat:streak"] },
        },
      ];

      const { getByTestId } = render(
        <CustomizeDashboardModal
          visible={true}
          layout={singlePoolLayout}
          onClose={jest.fn()}
          onSaved={jest.fn()}
        />,
      );

      const rows = buildRows(singlePoolLayout);
      fireEvent.press(getByTestId(`customizer-settings-${rows[0]!.rowId}`));

      const streakPool = getByTestId("customizer-pool-streak");
      expect(streakPool.props.accessibilityState.checked).toBe(true);

      // Tapping it does not uncheck because it is the only card
      fireEvent.press(streakPool);
      expect(streakPool.props.accessibilityState.checked).toBe(true);
    });
  });

  describe("7. Saving & Validation (e015ca34, e015ca36)", () => {
    it("saves the full layout and notifies parent", async () => {
      const onSaved = jest.fn();
      const onSave = jest.fn().mockImplementation((layout) => layout);

      const { getByTestId } = render(
        <CustomizeDashboardModal
          visible={true}
          layout={sampleLayout}
          onClose={jest.fn()}
          onSave={onSave}
          onSaved={onSaved}
        />,
      );

      fireEvent.press(getByTestId("customizer-save"));

      await waitFor(() => {
        expect(onSave).toHaveBeenCalledTimes(1);
        expect(onSaved).toHaveBeenCalledTimes(1);
      });

      const savedLayout = onSaved.mock.calls[0][0];
      // Verifies cross-platform schema compatibility
      const parsed = DashboardLayoutSchema.safeParse(savedLayout);
      expect(parsed.success).toBe(true);
    });

    it("displays error message when saving fails", async () => {
      const onSave = jest.fn().mockRejectedValue(new Error("Network failed"));
      const onSaved = jest.fn();

      const { getByTestId, getByText } = render(
        <CustomizeDashboardModal
          visible={true}
          layout={sampleLayout}
          onClose={jest.fn()}
          onSave={onSave}
          onSaved={onSaved}
        />,
      );

      fireEvent.press(getByTestId("customizer-save"));

      await waitFor(() => {
        expect(getByText("Network failed")).toBeTruthy();
        expect(getByTestId("customizer-error")).toBeTruthy();
      });
      expect(onSaved).not.toHaveBeenCalled();
    });

    it("never calls legacy pinned-tiles endpoint (e015ca36)", async () => {
      mockApiFetch.mockResolvedValueOnce({
        success: true,
        layout: sampleLayout,
      });
      const onSaved = jest.fn();

      const { getByTestId } = render(
        <CustomizeDashboardModal
          visible={true}
          layout={sampleLayout}
          onClose={jest.fn()}
          onSaved={onSaved}
        />,
      );

      fireEvent.press(getByTestId("customizer-save"));

      await waitFor(() => {
        expect(mockApiFetch).toHaveBeenCalledWith(
          "/api/dashboard/layout",
          expect.anything(),
          expect.objectContaining({ method: "PATCH" }),
        );
      });

      // Confirm legacy endpoint was never targeted
      for (const call of mockApiFetch.mock.calls) {
        expect(call[0]).not.toContain("pinned-tiles");
        expect(call[0]).not.toContain("statPref");
      }
    });
  });

  describe("8. DashboardScreen Integration", () => {
    it("opens customize tiles modal when Customize tiles link is pressed", () => {
      const baseProps = {
        streakDays: 7,
        todayWorkout: null,
        onStartWorkout: jest.fn(),
        onOpenCalendar: jest.fn(),
        onSubmitCheckIn: jest.fn(),
      };

      const { getByTestId, getByText } = render(
        <DashboardScreen
          {...baseProps}
          layout={sampleLayout}
        />,
      );

      expect(getByTestId("dashboard-customize-tiles")).toBeTruthy();
      fireEvent.press(getByTestId("dashboard-customize-tiles"));

      // Customizer modal is now visible
      expect(getByText("Customize Dashboard")).toBeTruthy();
      expect(getByTestId("customizer-save")).toBeTruthy();
    });
  });
});
