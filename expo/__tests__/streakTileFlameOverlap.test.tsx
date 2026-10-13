// Card 96d409a5: the Home streak tile's Super Streak page drew the flame ON
// TOP OF the digits, on web and native. Found capturing store screenshots
// (2026-10-13, main abee3162). The "Day Streak" page, which has no fire, was
// fine — the difference is `FireNumber`.
//
// Two native causes, both fixed here:
//
//   1. `FireNumber` hung its tongues in a band 6px above the text box with
//      8–13px of flame below that, and its ember bed over the bottom 40% of
//      the number, so both decorations sat INSIDE the digits. They now live in
//      two bands wholly outside the text box — `bottom: "100%"` above and
//      `top: "100%"` below — each `overflow: "hidden"`, so a tongue taller
//      than its band is clipped at the digits' edge instead of painted over
//      them. Everything is a PERCENTAGE of the text's own box
//      (lib/streaks/fireNumberLayout, shared with the web), which is what
//      makes it hold at 1, 2 and 3 digits and at the largest text size.
//   2. `StreakTile` rendered `<FireNumber>` INSIDE a `<Text>`. A View nested
//      in a Text is an inline placeholder, so the bands had nothing reliable
//      to position against. The emphasised value is now a baseline ROW, the
//      way StreaksScreen's StreakValue and the web's `flex items-baseline`
//      already were.
//
// The same geometry is checked on the web half in
// webapp/tests/unit/fireNumber.test.tsx, which also fails if the two copies of
// the geometry ever disagree.

/* eslint-disable import/first */
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({}),
}));

import * as fs from "fs";
import * as path from "path";
import React from "react";
import { render, within } from "@testing-library/react-native";
import { StyleSheet } from "react-native";
import { FireNumber } from "@/components/streaks/FireNumber";
import { StreakTile } from "@/components/dashboard/StreakTile";
import {
  EMBER_BAND,
  FLAME_BAND,
  FLAME_TONGUES,
  fireNumberGeometry,
  percent,
  rectsOverlap,
} from "@/lib/streaks/fireNumberLayout";
import type { StreaksLite } from "@become/core";

function flat(style: unknown): Record<string, unknown> {
  return StyleSheet.flatten(style as never) as Record<string, unknown>;
}

const readExpo = (rel: string): string =>
  fs.readFileSync(path.join(__dirname, "..", rel), "utf8");

/** A member on a `superDays`-long super streak. */
const streaks = (superDays: number): StreaksLite => ({
  overall: {
    current: superDays,
    best: superDays,
    nextMilestone: null,
    activeToday: true,
    freezes: 1,
  },
  pillars: {
    workout: {
      unit: "days",
      current: superDays,
      best: superDays,
      thisWeek: 3,
      target: 4,
      weekLost: false,
    },
    nutrition: { current: superDays, best: superDays, activeToday: true },
    mindset: { current: superDays, best: superDays, activeToday: true },
    super: {
      current: superDays,
      best: superDays,
      activeToday: true,
      today: {
        nutrition: true,
        mindset: true,
        trained: true,
        restDay: false,
        weekOnTrack: true,
      },
    },
  },
});

describe("96d409a5: the Super Streak tile's flame never lands on the digits", () => {
  describe("(id: 96d409a6) flame and number do not overlap", () => {
    it("hangs the tongues in a clipped band wholly ABOVE the digits' box", () => {
      const { getByTestId } = render(<FireNumber>7</FireNumber>);
      const band = flat(getByTestId("fire-flames").props.style);

      expect(band.position).toBe("absolute");
      // `bottom: "100%"` puts the band's BOTTOM edge on the text box's TOP
      // edge: the whole band is above the digits. A `top` here (the old
      // `top: -6`) would put part of it back over them.
      expect(band.bottom).toBe("100%");
      expect(band.top).toBeUndefined();
      expect(band.height).toBe(percent(FLAME_BAND));
      expect(band.overflow).toBe("hidden");
    });

    it("beds the embers in a clipped band wholly BELOW the digits' box", () => {
      const { getByTestId } = render(<FireNumber>7</FireNumber>);
      const band = flat(getByTestId("fire-embers").props.style);

      expect(band.position).toBe("absolute");
      expect(band.top).toBe("100%");
      expect(band.bottom).toBeUndefined();
      expect(band.height).toBe(percent(EMBER_BAND));
      // The glow is soft and spreads: without the clip it would bleed back up
      // over the numerals, which is the overlap in the screenshot.
      expect(band.overflow).toBe("hidden");
    });

    it("keeps the digits out of both bands — they are siblings, not children", () => {
      const { getByTestId } = render(<FireNumber>7</FireNumber>);
      expect(
        within(getByTestId("fire-flames")).queryByTestId("fire-number"),
      ).toBeNull();
      expect(
        within(getByTestId("fire-embers")).queryByTestId("fire-number"),
      ).toBeNull();
      expect(getByTestId("fire-number")).toBeTruthy();
    });

    it("bottom-anchors every tongue inside its band and makes it taller than it, so the clip is what holds the fire", () => {
      const { getByTestId } = render(<FireNumber>7</FireNumber>);
      FLAME_TONGUES.forEach((f, i) => {
        const tongue = flat(getByTestId(`fire-lick-${i}`).props.style);
        expect(tongue.position).toBe("absolute");
        expect(tongue.bottom).toBe(0);
        expect(tongue.top).toBeUndefined();
        expect(tongue.left).toBe(percent(f.left));
        expect(tongue.width).toBe(percent(f.width));
        expect(tongue.height).toBe(percent(f.height / FLAME_BAND));
        expect(f.height).toBeGreaterThan(FLAME_BAND);
      });
    });

    it("renders the tile's emphasised value as a baseline ROW, not a FireNumber nested in a Text", () => {
      const { getByTestId } = render(<StreakTile streaks={streaks(9)} />);
      const row = getByTestId("streak-super-value");
      const style = flat(row.props.style);
      expect(style.flexDirection).toBe("row");
      expect(style.alignItems).toBe("baseline");

      // The fire is inside the row, the number inside the fire, and the unit
      // beside it as its own text.
      const fire = within(row).getByTestId("fire-number-container");
      expect(fire).toBeTruthy();
      expect(within(fire).getByText("9")).toBeTruthy();
      expect(within(row).getByText("days")).toBeTruthy();

      const src = readExpo("components/dashboard/StreakTile.tsx");
      expect(src).toContain('<View testID="streak-super-value"');
      // Never a <Text> again: that nesting is half of this bug.
      expect(src).not.toMatch(/<Text[^>]*testID="streak-super-value"/);
    });

    it("leaves the Day Streak page plain — no fire to overlap anything", () => {
      const { getByTestId, queryByTestId } = render(
        <StreakTile streaks={streaks(0)} />,
      );
      expect(getByTestId("tile-streak-value")).toBeTruthy();
      expect(queryByTestId("fire-number")).toBeNull();
      expect(queryByTestId("fire-flames")).toBeNull();
    });
  });

  describe("(id: 96d409a7) checked at 1, 2 and 3 digit streaks and the largest text size", () => {
    it.each([
      ["1 digit", 4],
      ["2 digits", 42],
      ["3 digits", 124],
    ])(
      "draws %s with the same bands, sized off the text's own box",
      (_label, superDays) => {
        const { getByTestId } = render(
          <StreakTile streaks={streaks(superDays as number)} />,
        );
        const row = getByTestId("streak-super-value");
        expect(
          within(row).getByText(String(superDays)),
        ).toBeTruthy();

        // Digit count cannot move the bands: they are percentages of the text
        // box, and the tongues are percentages of the number's width.
        const band = flat(getByTestId("fire-flames").props.style);
        expect(band.bottom).toBe("100%");
        expect(band.height).toBe(percent(FLAME_BAND));
        expect(flat(getByTestId("fire-embers").props.style).top).toBe("100%");
        FLAME_TONGUES.forEach((f, i) => {
          const tongue = flat(getByTestId(`fire-lick-${i}`).props.style);
          expect(tongue.left).toBe(percent(f.left));
          expect(tongue.width).toBe(percent(f.width));
        });
      },
    );

    it("holds at the largest text size: every decoration length is a percentage, never a fixed px", () => {
      // A phone at its largest accessibility text size scales the digits but
      // not a number written down in px — which is how the old band (top: -6,
      // height: 14, tongues 8–13px) ended up proportionally deeper into the
      // bigger digits. Percentages cannot drift.
      const { getByTestId } = render(
        <FireNumber style={{ fontSize: 64 }}>124</FireNumber>,
      );
      const lengths = [
        flat(getByTestId("fire-flames").props.style),
        flat(getByTestId("fire-embers").props.style),
        ...FLAME_TONGUES.map((_f, i) =>
          flat(getByTestId(`fire-lick-${i}`).props.style),
        ),
      ];
      for (const style of lengths) {
        for (const key of ["height", "width", "top", "bottom"] as const) {
          const value = style[key];
          if (value === undefined || value === 0) continue;
          expect(typeof value).toBe("string");
          expect(String(value).endsWith("%")).toBe(true);
        }
      }
    });

    it("the shared geometry is disjoint from the digits at 1–3 digits and 16–64px", () => {
      for (const digits of [1, 2, 3]) {
        for (const boxPx of [16, 24, 30, 48, 64]) {
          const g = fireNumberGeometry({ digits, boxPx });
          const where = `${digits} digit(s) at ${boxPx}px`;
          expect([where, rectsOverlap(g.flameBand, g.digits)]).toEqual([
            where,
            false,
          ]);
          expect([where, rectsOverlap(g.emberBand, g.digits)]).toEqual([
            where,
            false,
          ]);
          for (const painted of g.paintedTongues) {
            expect([where, rectsOverlap(painted, g.digits)]).toEqual([
              where,
              false,
            ]);
            expect(painted.width * painted.height).toBeGreaterThan(0);
            expect(painted.left + painted.width).toBeLessThanOrEqual(
              g.digits.left + g.digits.width + 1e-9,
            );
          }
        }
      }
    });
  });
});
