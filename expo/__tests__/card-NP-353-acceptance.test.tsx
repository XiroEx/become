// Card NP-353: Spacing/type: Customize Dashboard - neutral trash icon in idle state,
// badge accent colors, button styling
//
// Full visual pass (native vs web), Android S23 Ultra (One UI 7, font scale
// 0.9, logical 412x915, DPR 3.5), build 24f4e34d.
//
// 1. Trash / Remove Button: Web trash button defaults to subtle neutral grey
//    `text-zinc-400 dark:text-zinc-500` and turns red only on hover (`hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/50 dark:hover:text-red-400`).
//    Native rendered a solid destructive RED trash icon (`colors.destructive`) in its default idle state.
//    Fixed to render neutral muted grey (`colors["muted-foreground"]`) in idle state and destructive red
//    (`colors.destructive` + `tint("destructive", 0.15)`) when pressed.
// 2. Tile Badge Accent Colors: Web uses distinct badge colors for tile categories:
//    Smart Tile is indigo (`bg-indigo-100 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400`),
//    Streak is amber (`bg-amber-100 text-amber-600`), Goal is purple (`bg-purple-100 text-purple-600`).
//    Native rendered Smart Tile in dark grey, Streak in peach, and Goal in yellow-gold.
//    Fixed to align with web tokens: indigo for smart, amber for streak, purple for goal.
// 3. Modal Action Buttons: Web Cancel button is `border border-zinc-200 dark:border-zinc-700 py-2.5 sm:py-3`
//    and Save is `bg-zinc-900 dark:bg-white py-2.5 sm:py-3`. Native used `minHeight: 44, paddingVertical: 12, borderRadius: 10`.
//    Fixed to match web button height and corner radius (`minHeight: 44, paddingVertical: 10, borderRadius: 12`).

/* eslint-disable import/first */
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({}),
}));

jest.mock("@become/api-client", () => {
  const actual = jest.requireActual("@become/api-client");
  return { __esModule: true, ...actual, apiFetch: jest.fn() };
});

import * as fs from "fs";
import * as path from "path";
import React from "react";
import { render, fireEvent, within } from "@testing-library/react-native";
import { StyleSheet, View } from "react-native";
import { Trash2, Sparkles, Flame, Target } from "lucide-react-native";
import {
  CustomizeDashboardModal,
  TileBadge,
  buildRows,
} from "@/components/dashboard/CustomizeDashboardModal";
import { lightTokens, darkTokens, tintToken } from "@/lib/theme/tokens";
import type { DashboardTile } from "@become/api-client";

function flat(style: unknown): Record<string, unknown> {
  return StyleSheet.flatten(style as never) as Record<string, unknown>;
}

const EXPO_DIR = path.resolve(__dirname, "..");
const readExpo = (rel: string): string =>
  fs.readFileSync(path.join(EXPO_DIR, rel), "utf8");

const rgb = (triplet: string) => `rgb(${triplet})`;

const sampleLayout: DashboardTile[] = [
  { id: "streak", kind: "stat", size: "1x1" },
  { id: "goal", kind: "stat", size: "1x1" },
  { id: "weekly", kind: "stat", size: "1x1" },
  {
    id: "smart",
    kind: "smart-rotating",
    size: "2x1",
    settings: { pool: ["stat:streak", "stat:mood"], intervalMs: 6000 },
  },
];

describe("NP-353: Customize Dashboard native parity pass", () => {
  describe("(id: np353-01) Trash / Remove button neutral idle state and pressed destructive state", () => {
    it("renders trash icon in neutral muted-foreground in default idle state", () => {
      const rows = buildRows(sampleLayout);
      const { getByTestId } = render(
        <CustomizeDashboardModal
          visible={true}
          layout={sampleLayout}
          onClose={jest.fn()}
          onSaved={jest.fn()}
        />,
      );

      const deleteBtn = getByTestId(`customizer-delete-${rows[0]!.rowId}`);
      const trashIcon = within(deleteBtn).UNSAFE_getByType(Trash2);
      expect(trashIcon.props.color).toBe(rgb(lightTokens["muted-foreground"]));
      expect(trashIcon.props.color).not.toBe(rgb(lightTokens.destructive));
    });

    it("switches to destructive red and tinted background on pressed state (pressIn)", () => {
      const rows = buildRows(sampleLayout);
      const { getByTestId } = render(
        <CustomizeDashboardModal
          visible={true}
          layout={sampleLayout}
          onClose={jest.fn()}
          onSaved={jest.fn()}
        />,
      );

      const deleteBtn = getByTestId(`customizer-delete-${rows[0]!.rowId}`);
      fireEvent(deleteBtn, "pressIn");

      const trashIcon = within(deleteBtn).UNSAFE_getByType(Trash2);
      expect(trashIcon.props.color).toBe(rgb(lightTokens.destructive));

      const style = flat(deleteBtn.props.style);
      expect(style.backgroundColor).toBe(
        tintToken("destructive", "light", 0.15),
      );

      fireEvent(deleteBtn, "pressOut");
      const revertedTrash = within(deleteBtn).UNSAFE_getByType(Trash2);
      expect(revertedTrash.props.color).toBe(rgb(lightTokens["muted-foreground"]));
    });

    it("does not activate destructive red when button is disabled (single tile)", () => {
      const singleLayout: DashboardTile[] = [
        { id: "streak", kind: "stat", size: "1x1" },
      ];
      const rows = buildRows(singleLayout);
      const { getByTestId } = render(
        <CustomizeDashboardModal
          visible={true}
          layout={singleLayout}
          onClose={jest.fn()}
          onSaved={jest.fn()}
        />,
      );

      const deleteBtn = getByTestId(`customizer-delete-${rows[0]!.rowId}`);
      expect(deleteBtn.props.accessibilityState.disabled).toBe(true);

      fireEvent(deleteBtn, "pressIn");
      const trashIcon = within(deleteBtn).UNSAFE_getByType(Trash2);
      expect(trashIcon.props.color).toBe(rgb(lightTokens["muted-foreground"]));
      expect(trashIcon.props.color).not.toBe(rgb(lightTokens.destructive));
    });

    it("source code uses usePressed and neutral muted-foreground default", () => {
      const src = readExpo("components/dashboard/CustomizeDashboardModal.tsx");
      expect(src).toContain("DeleteRowButton");
      expect(src).toContain("usePressed");
      expect(src).toContain('colors["muted-foreground"]');
      expect(src).toContain("colors.destructive");
    });
  });

  describe("(id: np353-02) Tile badge accent colors (indigo for smart, amber for streak, purple for goal)", () => {
    it("renders Smart Tile badge in indigo (bg-indigo tint + indigo icon)", () => {
      const { UNSAFE_getByType } = render(
        <TileBadge kind="smart-rotating" id="smart" />,
      );
      const icon = UNSAFE_getByType(Sparkles);
      expect(icon.props.color).toBe(rgb(lightTokens.indigo));
      expect(icon.props.color).not.toBe(rgb(lightTokens.primary));
    });

    it("renders Streak badge in amber (bg-amber tint + amber icon)", () => {
      const { UNSAFE_getByType } = render(
        <TileBadge kind="stat" id="streak" />,
      );
      const icon = UNSAFE_getByType(Flame);
      expect(icon.props.color).toBe(rgb(lightTokens.amber));
    });

    it("renders Goal badge in purple (bg-purple tint + purple icon)", () => {
      const { UNSAFE_getByType } = render(
        <TileBadge kind="stat" id="goal" />,
      );
      const icon = UNSAFE_getByType(Target);
      expect(icon.props.color).toBe(rgb(lightTokens.purple));
      expect(icon.props.color).not.toBe(rgb(lightTokens.accent));
    });

    it("TileBadge source maps category badges to indigo, amber, and purple tokens", () => {
      const src = readExpo("components/dashboard/CustomizeDashboardModal.tsx");
      expect(src).toContain('tint("indigo", 0.15)');
      expect(src).toContain("colors.indigo");
      expect(src).toContain('streak: { Icon: Flame, color: colors.amber, bg: tint("amber", 0.15) }');
      expect(src).toContain('goal: { Icon: Target, color: colors.purple, bg: tint("purple", 0.15) }');
    });

    it("token system defines purple in lightTokens, darkTokens, and global.css", () => {
      expect(lightTokens.purple).toBe("147 51 234");
      expect(darkTokens.purple).toBe("192 132 252");
      const css = readExpo("global.css");
      expect(css).toContain("--purple: 147 51 234;");
      expect(css).toContain("--purple: 192 132 252;");
    });
  });

  describe("(id: np353-03) Modal action button styling (height and corner radius)", () => {
    it("renders Cancel button with matched height and corner radius (minHeight 44, paddingVertical 10, borderRadius 12)", () => {
      const { getByTestId } = render(
        <CustomizeDashboardModal
          visible={true}
          layout={sampleLayout}
          onClose={jest.fn()}
          onSaved={jest.fn()}
        />,
      );

      const cancelBtn = getByTestId("customizer-cancel");
      const style = flat(cancelBtn.props.style);
      expect(style.minHeight).toBe(44);
      expect(style.paddingVertical).toBe(10);
      expect(style.borderRadius).toBe(12);
      expect(style.borderWidth).toBe(1);
    });

    it("renders Save button with matched height and corner radius (minHeight 44, paddingVertical 10, borderRadius 12)", () => {
      const { getByTestId } = render(
        <CustomizeDashboardModal
          visible={true}
          layout={sampleLayout}
          onClose={jest.fn()}
          onSaved={jest.fn()}
        />,
      );

      const saveBtn = getByTestId("customizer-save");
      const style = flat(saveBtn.props.style);
      expect(style.minHeight).toBe(44);
      expect(style.paddingVertical).toBe(10);
      expect(style.borderRadius).toBe(12);
    });

    it("source code explicitly matches web py-2.5 and rounded-xl", () => {
      const src = readExpo("components/dashboard/CustomizeDashboardModal.tsx");
      const cancelBlock = src.slice(
        src.indexOf('testID="customizer-cancel"'),
        src.indexOf('testID="customizer-save"'),
      );
      expect(cancelBlock).toContain("minHeight: 44");
      expect(cancelBlock).toContain("paddingVertical: 10");
      expect(cancelBlock).toContain("borderRadius: 12");

      const saveBlock = src.slice(
        src.indexOf('testID="customizer-save"'),
        src.indexOf("</View>\n          </View>"),
      );
      expect(saveBlock).toContain("minHeight: 44");
      expect(saveBlock).toContain("paddingVertical: 10");
      expect(saveBlock).toContain("borderRadius: 12");
    });
  });
});
