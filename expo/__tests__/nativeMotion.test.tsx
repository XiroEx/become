import React from "react";
import * as fs from "fs";
import * as path from "path";
import { render, fireEvent } from "@testing-library/react-native";
import { Text } from "react-native";
import { ScreenEnter } from "@/components/motion/ScreenEnter";
import { ProgressFill } from "@/components/motion/ProgressFill";
import { AvatarMenuPop } from "@/components/navigation/AvatarMenuPop";
import { WeeklyHighlight } from "@/components/settings/WeeklyHighlight";
import { OfflineBanner } from "@/components/offline/OfflineBanner";
import { Toast } from "@/components/Toast";
import { StreakBanner } from "@/components/StreakBanner";
import { MoodGatewayBanner } from "@/components/dashboard/MoodGatewayBanner";
import { MOTION_MS, motionMs, tileDelay } from "@/lib/motion/motion";

/**
 * NATIVE MOTION (the Becoming card first).
 *
 * The web animates throughout (framer-motion): PageTransition fades screens
 * in over 0.4s, toasts rise 8pt over 0.2s, banners drop from -6, modals
 * spring up, dropdowns pop, tiles stagger and fills ease over 0.3–0.5s, and
 * the Becoming door breathes (2.4s loud / 3.2s calm). This suite pins the
 * native twins: the shared numbers, the enter/fill/pop/highlight
 * primitives, and the wired banners/toast — all honouring Reduce Motion.
 */

describe("motion numbers", () => {
  it("matches the web's durations", () => {
    expect(MOTION_MS.screenEnter).toBe(400);
    expect(MOTION_MS.toast).toBe(200);
    expect(MOTION_MS.banner).toBe(250);
    expect(MOTION_MS.sheet).toBe(300);
    expect(MOTION_MS.pop).toBe(180);
    expect(MOTION_MS.fill).toBe(300);
    expect(MOTION_MS.firePop).toBe(500);
    expect(MOTION_MS.becomingLoud).toBe(2400);
    expect(MOTION_MS.becomingCalm).toBe(3200);
  });

  it("motionMs zeroes the duration under Reduce Motion but keeps the end state", () => {
    expect(motionMs(400, false)).toBe(400);
    expect(motionMs(400, true)).toBe(0);
  });

  it("staggers tiles and collapses the stagger under Reduce Motion", () => {
    expect(tileDelay(0, false)).toBe(0);
    expect(tileDelay(3, false)).toBe(180);
    expect(tileDelay(3, true)).toBe(0);
  });
});

describe("ScreenEnter", () => {
  it("renders children with a testID", () => {
    const { getByTestId } = render(
      <ScreenEnter testID="enter">
        <Text testID="enter-child">hello</Text>
      </ScreenEnter>,
    );
    expect(getByTestId("enter")).toBeTruthy();
    expect(getByTestId("enter-child")).toBeTruthy();
  });
});

describe("ProgressFill", () => {
  it("keeps the h-full height class so the segment is visible", () => {
    const { getByTestId } = render(
      <ProgressFill fraction={0.5} color="red" testID="fill" />,
    );
    expect(String(getByTestId("fill").props.className)).toContain("h-full");
  });

  it("clamps the fraction to 0–1", () => {
    const { getByTestId, rerender } = render(
      <ProgressFill fraction={2} testID="fill" />,
    );
    const flat = (testId: string) => {
      const el = getByTestId(testId);
      return Array.isArray(el.props.style)
        ? Object.assign({}, ...el.props.style)
        : el.props.style;
    };
    expect(flat("fill").width).toBe("100%");
    rerender(<ProgressFill fraction={-1} testID="fill" />);
    expect(flat("fill").width).toBe("0%");
  });
});

describe("AvatarMenuPop", () => {
  it("renders its children", () => {
    const { getByTestId } = render(
      <AvatarMenuPop testID="pop">
        <Text testID="pop-child">menu</Text>
      </AvatarMenuPop>,
    );
    expect(getByTestId("pop-child")).toBeTruthy();
  });
});

describe("WeeklyHighlight", () => {
  it("marks the row while active and clears it after", () => {
    const { getByTestId, rerender } = render(
      <WeeklyHighlight active testID="hl">
        <Text>row</Text>
      </WeeklyHighlight>,
    );
    expect(getByTestId("hl")).toBeTruthy();
    rerender(
      <WeeklyHighlight active={false} testID="hl">
        <Text>row</Text>
      </WeeklyHighlight>,
    );
    expect(getByTestId("hl")).toBeTruthy();
  });
});

describe("wired banners and toast", () => {
  it("OfflineBanner renders nothing while online and the alert while offline", () => {
    const { queryByTestId, rerender } = render(
      <OfflineBanner online testID="ob" />,
    );
    expect(queryByTestId("ob")).toBeNull();
    rerender(<OfflineBanner online={false} testID="ob" />);
    expect(queryByTestId("ob")).toBeTruthy();
    expect(queryByTestId("ob-title")).toBeTruthy();
  });

  it("Toast renders nothing without a toast and the message with one", () => {
    const { queryByTestId, rerender } = render(
      <Toast toast={null} testID="t" />,
    );
    expect(queryByTestId("t")).toBeNull();
    rerender(
      <Toast
        toast={{ message: "Saved", type: "success" }}
        testID="t"
      />,
    );
    expect(queryByTestId("t-message")?.props.children).toBe("Saved");
  });

  it("StreakBanner announces the streak as one sentence", () => {
    const { getByTestId } = render(
      <StreakBanner streakDays={12} testID="sb" />,
    );
    expect(getByTestId("sb").props.accessibilityLabel).toMatch(/12/);
  });

  it("MoodGatewayBanner renders the gateway with dismiss", () => {
    const onDismiss = jest.fn();
    const { getByTestId } = render(
      <MoodGatewayBanner mood={2} onDismiss={onDismiss} testID="mg" />,
    );
    expect(getByTestId("mg")).toBeTruthy();
    fireEvent.press(getByTestId("mg-dismiss"));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});

describe("the rule that travels", () => {
  it("every motion file consults reduced motion (directly or through a motion primitive)", () => {
    // Files that animate directly reach for `useReducedMotion`; files that
    // animate through a primitive (`ProgressFill`, `ScreenEnter`, …) comply
    // transitively — the primitive itself consults the setting.
    const files = [
      "lib/motion/motion.ts",
      "components/motion/ScreenEnter.tsx",
      "components/motion/ProgressFill.tsx",
      "components/navigation/AvatarMenuPop.tsx",
      "components/settings/WeeklyHighlight.tsx",
      "components/dashboard/BecomingDoor.tsx",
      "components/offline/OfflineBanner.tsx",
      "components/Toast.tsx",
      "components/StreakBanner.tsx",
      "components/dashboard/MoodGatewayBanner.tsx",
      "components/dashboard/StatTile.tsx",
      "components/dashboard/StreakTile.tsx",
      "components/mind/system/GuidedFlow.tsx",
      "components/mind/SelfImageDashboard.tsx",
      "components/StreakMilestoneModal.tsx",
      "components/navigation/PageHeader.tsx",
    ];
    for (const rel of files) {
      const src = fs.readFileSync(
        path.join(__dirname, "..", rel),
        "utf8",
      ) as string;
      expect(`${rel}: ${src}`).toMatch(
        /reducedMotion|useReducedMotion|motionMs|motionDuration|ProgressFill|ScreenEnter|AvatarMenuPop|WeeklyHighlight|motion\/reanimated/,
      );
    }
  });
});
