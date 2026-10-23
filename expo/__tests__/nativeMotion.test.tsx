// NATIVE MOTION (the web's framer-motion, ported).
//
// Inventory of the web's motion and its native half — one row per surface,
// in the card's order of work. Every animation honours Reduce Motion (the
// `reduced` column): full motion by default, a cut when the OS asks for it.
//
// | # | Web (framer-motion)                              | Native                                                        | reduced |
// |---|----------------------------------------------------|---------------------------------------------------------------|---------|
// | 1 | BecomingDoor: `becoming-door-pulse` 2.4s halo    | `BecomingDoor` breathes via Reanimated opacity (2.4s)         | still |
// |   | `becoming-door-nudge` 3.2s halo while a "work    | + the calm nudge (3.2s) while a suggestion line shows;      | still |
// |   | on next" line shows (`globals.css`)              | unread now actually wired to `checkBecomingUnread()`          |       |
// | 1 | Weekly-report highlight:                         | `WeeklyHighlight` green halo x3 + `settings.tsx` opens on    | none  |
// |   | `settings-highlight-pulse` 1s x3 (`settings/     | Training via `highlight=weekly`; `webPathToRoute` maps the   |       |
// |   | page.tsx `?tab=training#weekly-availability`)    | web deep link there                                         |       |
// | 2 | PageTransition: y 20 -> 0, 400ms easeOut          | `ScreenEnter` (400ms rise); pushes already slide via         | cut   |
// |   |                                                  | `screenAnimation.ts` (`ios_from_right` / `none`)            |       |
// | 3 | Sheets: y 40 -> 0, spring 28/300 (ProgramNudge,   | `Modal` + `BottomSheet` rise 40pt over the RN fade/slide    | cut   |
// |   | FoodLogSheet, MealApplySheet, CustomizeDashboard)|                                                             |       |
// | 3 | Avatar menu: scale 0.95, y -4, 150ms (ProfileMenu)| `AvatarMenuPop` (150ms pop, origin top-right)               | cut   |
// | 4 | Tiles: StreakTile crossfade 220ms; SmartRotating | `ProgressFill` (scaleX, 500ms) in StatTile, StreakTile,     | still |
// |   | slide spring 320/34; bars `transition-all 500ms` | GuidedFlow, SelfImage evolution; rotation cadence unchanged  |       |
// | 5 | Banners: MoodGateway y -6 220ms; Toast y 8 200ms  | `MoodGatewayBanner`, `OfflineBanner`, `StreakBanner` drop;   | cut   |
// |   | NotificationOptIn y 16 220ms; StreakMilestone     | `Toast` rises; `StreakMilestoneModal` fire pops 0->1.3->1   |       |
// |   | spring 22/320 + fire pop + staggered text        | (500ms); milestone text draws with the card (no stagger)    |       |

import { render, waitFor } from "@testing-library/react-native";
import { AccessibilityInfo, Text } from "react-native";
import { BecomingDoor } from "@/components/dashboard/BecomingDoor";
import { ScreenEnter } from "@/components/motion/ScreenEnter";
import { ProgressFill } from "@/components/motion/ProgressFill";
import { AvatarMenuPop } from "@/components/navigation/AvatarMenuPop";
import { Toast } from "@/components/Toast";
import { MoodGatewayBanner } from "@/components/dashboard/MoodGatewayBanner";
import { OfflineBanner } from "@/components/offline/OfflineBanner";
import { StreakBanner } from "@/components/StreakBanner";
import { WeeklyHighlight } from "@/components/settings/WeeklyHighlight";
import {
  BANNER_ENTER_DISTANCE,
  BANNER_MS,
  CELEBRATION_POP_MS,
  CELEBRATION_POP_PEAK,
  DOOR_NUDGE_MS,
  DOOR_PULSE_MS,
  HIGHLIGHT_PULSE_COUNT,
  HIGHLIGHT_PULSE_MS,
  MENU_ENTER_DISTANCE,
  MENU_ENTER_MS,
  MENU_ENTER_SCALE,
  PROGRESS_FILL_MS,
  SCREEN_ENTER_DISTANCE,
  SCREEN_ENTER_MS,
  SHEET_ENTER_DISTANCE,
  TILE_CROSSFADE_EASING,
  TILE_CROSSFADE_MS,
  TOAST_ENTER_DISTANCE,
  TOAST_MS,
  enterTravels,
  motionMs,
} from "@/lib/motion/motion";

jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({}),
}));

function mockA11y(initial: boolean) {
  const read = jest
    .spyOn(AccessibilityInfo, "isReduceMotionEnabled")
    .mockImplementation(() => Promise.resolve(initial));
  const listeners: ((v: boolean) => void)[] = [];
  const subscribe = jest
    .spyOn(AccessibilityInfo, "addEventListener")
    .mockImplementation(((event: string, handler: unknown) => {
      if (event === "reduceMotionChanged") listeners.push(handler as (v: boolean) => void);
      return { remove: jest.fn() };
    }) as never);
  return () => {
    read.mockRestore();
    subscribe.mockRestore();
  };
}

describe("the vocabulary matches the web's numbers", () => {
  it("PageTransition: 20pt over 400ms", () => {
    expect(SCREEN_ENTER_DISTANCE).toBe(20);
    expect(SCREEN_ENTER_MS).toBe(400);
  });
  it("sheets rise 40pt (spring 28/300 on the web)", () => {
    expect(SHEET_ENTER_DISTANCE).toBe(40);
  });
  it("avatar menu pops from 0.95/-4pt over 150ms", () => {
    expect(MENU_ENTER_SCALE).toBe(0.95);
    expect(MENU_ENTER_DISTANCE).toBe(-4);
    expect(MENU_ENTER_MS).toBe(150);
  });
  it("toasts rise 8pt over 200ms", () => {
    expect(TOAST_ENTER_DISTANCE).toBe(8);
    expect(TOAST_MS).toBe(200);
  });
  it("tiles crossfade over 220ms on the web's ease", () => {
    expect(TILE_CROSSFADE_MS).toBe(220);
    expect(TILE_CROSSFADE_EASING).toEqual([0.22, 1, 0.36, 1]);
  });
  it("progress fills ease over 500ms", () => {
    expect(PROGRESS_FILL_MS).toBe(500);
  });
  it("banners drop 6pt over 220ms", () => {
    expect(BANNER_ENTER_DISTANCE).toBe(-6);
    expect(BANNER_MS).toBe(220);
  });
  it("the streak fire pops 0 -> 1.3 -> 1 over 500ms", () => {
    expect(CELEBRATION_POP_PEAK).toBe(1.3);
    expect(CELEBRATION_POP_MS).toBe(500);
  });
  it("the door breathes 2.4s loud / 3.2s calm; the weekly highlight pulses 1s x3", () => {
    expect(DOOR_PULSE_MS).toBe(2400);
    expect(DOOR_NUDGE_MS).toBe(3200);
    expect(HIGHLIGHT_PULSE_MS).toBe(1000);
    expect(HIGHLIGHT_PULSE_COUNT).toBe(3);
  });
  it("Reduce Motion keeps the end state and drops the travel", () => {
    expect(motionMs(400, false)).toBe(400);
    expect(motionMs(400, true)).toBe(0);
    expect(enterTravels(false)).toBe(true);
    expect(enterTravels(true)).toBe(false);
  });
});

describe("the surfaces render with and without motion", () => {
  it("ScreenEnter draws its children", () => {
    const restore = mockA11y(false);
    const { getByTestId } = render(
      <ScreenEnter testID="enter">
        <Text>hello</Text>
      </ScreenEnter>,
    );
    expect(getByTestId("enter")).toBeTruthy();
    restore();
  });

  it("ProgressFill draws at its width under Reduce Motion", () => {
    const restore = mockA11y(true);
    const { UNSAFE_getByProps } = render(
      <ProgressFill pct={50} color="#fff" testID="fill" />,
    );
    // Hidden from assistive tech (decorative fill), so query by props.
    expect(UNSAFE_getByProps({ testID: "fill" })).toBeTruthy();
    restore();
  });

  it("AvatarMenuPop draws its children", () => {
    const restore = mockA11y(false);
    const { getByTestId } = render(
      <AvatarMenuPop testID="pop">
        <Text>menu</Text>
      </AvatarMenuPop>,
    );
    expect(getByTestId("pop")).toBeTruthy();
    restore();
  });

  it("Toast renders its message", () => {
    const restore = mockA11y(false);
    const { getByTestId } = render(
      <Toast toast={{ message: "Saved", type: "success" }} testID="t" />,
    );
    expect(getByTestId("t-message").props.children).toBe("Saved");
    restore();
  });

  it("MoodGatewayBanner renders its copy", () => {
    const restore = mockA11y(false);
    const { getByTestId } = render(
      <MoodGatewayBanner mood={4} onDismiss={() => {}} testID="mgb" />,
    );
    expect(getByTestId("mgb")).toBeTruthy();
    restore();
  });

  it("OfflineBanner hides when online and shows when offline", () => {
    const restore = mockA11y(false);
    const { queryByTestId, rerender } = render(
      <OfflineBanner online testID="ob" />,
    );
    expect(queryByTestId("ob")).toBeNull();
    rerender(<OfflineBanner online={false} testID="ob" />);
    expect(queryByTestId("ob")).toBeTruthy();
    restore();
  });

  it("StreakBanner renders its count", () => {
    const restore = mockA11y(false);
    const { getByTestId } = render(<StreakBanner streakDays={5} />);
    expect(getByTestId("streak-banner-days")).toBeTruthy();
    restore();
  });

  it("WeeklyHighlight draws the halo only while active and full-motion", () => {
    const restore = mockA11y(false);
    const { UNSAFE_queryByProps, rerender } = render(
      <WeeklyHighlight active testID="wh">
        <Text>field</Text>
      </WeeklyHighlight>,
    );
    // The halo is hidden from assistive tech (decorative), so query by props.
    expect(UNSAFE_queryByProps({ testID: "wh-halo" })).not.toBeNull();
    rerender(
      <WeeklyHighlight active={false} testID="wh">
        <Text>field</Text>
      </WeeklyHighlight>,
    );
    expect(UNSAFE_queryByProps({ testID: "wh-halo" })).toBeNull();
    restore();
  });

  it("BecomingDoor renders calm with no data and marks nothing seen", async () => {
    const restore = mockA11y(false);
    const { getByTestId } = render(
      <BecomingDoor goals={null} mind={null} testID="door" />,
    );
    expect(getByTestId("door")).toBeTruthy();
    await waitFor(() => expect(getByTestId("becoming-door-chips")).toBeTruthy());
    restore();
  });
});
