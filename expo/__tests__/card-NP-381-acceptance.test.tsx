/* eslint-disable import/first */
// ─── Live & Track: the full-screen takeover and the web's spacing (NP-381) ──
//
// Jon, on the 0.1.x TestFlight/Play build:
//   "The native has a lot more spacing and needs to look exactly like the Web
//    app. It doesn't have any variation when logging and there's a lot of
//    spacing errors."
//   "Live view needs to take over the full screen like it does in the Web app.
//    And also just how the spacing is is terrible."
//
// Web source of truth:
//   • Live  — `webapp/app/dashboard/workout/[programId]/workout/live/LiveWorkoutClient.tsx`
//             `fixed inset-0 z-100`: the clip is the WHOLE viewport
//             (`absolute inset-0`), the exit/Track|Live/timer bar floats over
//             its top (`absolute top-0 … p-4`), the set story bars sit 4rem
//             down, and one bottom panel (`absolute bottom-0 … p-4`, a
//             gradient to transparent) carries the position line, the name,
//             the pills, the progress bar, the inputs and the actions —
//             mb-4 / mb-4 / mb-6 between those blocks and 4-6px INSIDE the
//             exercise block, not one uniform 8pt rhythm.
//   • Track — `…/workout/WorkoutFormClient.tsx`: an ordinary dashboard page
//             (it keeps the BottomNav), whose set row turns
//             `bg-green-100 dark:bg-green-900/20` the moment the set is done.
//
// What this pins:
//   1. (np381-fullscreen) the two live routes are immersive: the floating
//      glass tab bar renders NOTHING while one is focused, and the Stack
//      reserves no bottom band for it;
//   2. (np381-clip) the clip is the full-screen background the `live` surface
//      has always claimed to be (`lib/videoFraming.ts`), with the chrome over
//      it — not a 16:9 card with a column spread out underneath;
//   3. (np381-spacing) the panel's spacing is the web's numbers;
//   4. (np381-variation) a logged set LOOKS logged in Track, as on the web.

jest.mock("expo-secure-store", () => {
  const mem = new Map<string, string>();
  return {
    __esModule: true,
    async getItemAsync(key: string): Promise<string | null> {
      return mem.has(key) ? (mem.get(key) as string) : null;
    },
    async setItemAsync(key: string, value: string): Promise<void> {
      mem.set(key, value);
    },
    async deleteItemAsync(key: string): Promise<void> {
      mem.delete(key);
    },
    __reset(): void {
      mem.clear();
    },
  };
});

jest.mock("@become/api-client", () => {
  const actual = jest.requireActual("@become/api-client");
  return {
    __esModule: true,
    ...actual,
    apiFetch: jest.fn(async () => ({
      user: { _id: "u1", email: "jon@example.com" },
    })),
  };
});

import * as fs from "fs";
import * as path from "path";
import { router } from "expo-router";
import { act, render } from "@testing-library/react-native";
import { renderRouter, screen as routerScreen } from "expo-router/testing-library";
import { colorScheme } from "nativewind";
import * as SecureStore from "expo-secure-store";
import { appRouteMap, savedJwt, screenId } from "../test-support/appRoutes";
import {
  IMMERSIVE_WORKOUT_ROUTES,
  focusedLeafRouteName,
  isImmersiveNavigationState,
  isImmersiveRouteName,
} from "@/lib/navigation/immersiveRoutes";
import {
  LiveWorkoutClient,
  type LiveWorkoutViewModel,
} from "@/components/live/LiveWorkoutClient";
import { LIVE_PANEL_SPACING } from "@/components/live/LiveStepView";
/* eslint-enable import/first */

const EXPO_DIR = path.resolve(__dirname, "..");
const read = (rel: string) => fs.readFileSync(path.join(EXPO_DIR, rel), "utf8");
const fake = SecureStore as unknown as { __reset: () => void };

beforeEach(() => {
  fake.__reset();
  delete process.env.EXPO_PUBLIC_COMMUNITY_ENABLED;
  act(() => {
    colorScheme.set("dark");
  });
});

/** Every tab-bar button, by the name the OS reads out ("Home, tab, 3 of 6"). */
function tabButtons(): string[] {
  const seen = new Set<string>();
  for (const node of routerScreen.UNSAFE_root.findAll((n) => {
    const props = (n.props ?? {}) as {
      accessibilityRole?: string;
      role?: string;
      accessibilityLabel?: string;
    };
    const role = props.accessibilityRole ?? props.role;
    return (
      role === "button" &&
      typeof props.accessibilityLabel === "string" &&
      /, tab, \d+ of \d+$/.test(props.accessibilityLabel)
    );
  })) {
    const label = String(
      (node.props as { accessibilityLabel: string }).accessibilityLabel,
    );
    seen.add(label.slice(0, label.indexOf(", tab,")));
  }
  return [...seen];
}

const BENCH: LiveWorkoutViewModel = {
  programId: "prog-1",
  workoutTitle: "Push A",
  exercises: [
    {
      slug: "bench",
      name: "Bench Press",
      sets: 2,
      repsLabel: "8-10",
      trackingType: "reps_weight",
      equipment: ["barbell"],
      restSec: 60,
    },
  ],
};

/** The style of a node, flattened whether it is an object or an array. */
function styleOf(node: { props: Record<string, unknown> }): Record<string, unknown> {
  const flat: Record<string, unknown> = {};
  const walk = (value: unknown) => {
    if (!value) return;
    if (Array.isArray(value)) {
      value.forEach(walk);
      return;
    }
    Object.assign(flat, value as Record<string, unknown>);
  };
  walk(node.props.style);
  return flat;
}

describe("(id: np381-fullscreen) Live takes over the whole screen", () => {
  it("the glass tab bar is gone while the live workout is focused, and back on the way out", async () => {
    await SecureStore.setItemAsync("become.session", savedJwt());
    renderRouter(appRouteMap() as never, {
      initialUrl: "/(tabs)/programming",
    });
    expect(
      await routerScreen.findByTestId(screenId("(app)/(tabs)/programming/index")),
    ).toBeTruthy();
    // The bar is there on the tab root.
    expect(tabButtons()).toHaveLength(5);

    act(() => {
      router.push("/(tabs)/programming/p1/workout/0/live" as never);
    });
    expect(
      await routerScreen.findByTestId(
        screenId("(app)/(tabs)/programming/[id]/workout/[idx]/live"),
      ),
    ).toBeTruthy();
    // …and nothing of it is left on the live screen: no capsule over the CTA.
    expect(tabButtons()).toEqual([]);
    expect(routerScreen.queryByTestId("glass-tab-bar")).toBeNull();
    expect(routerScreen.queryByTestId("glass-tab-bar-pill")).toBeNull();

    act(() => {
      router.back();
    });
    expect(
      await routerScreen.findByTestId(screenId("(app)/(tabs)/programming/index")),
    ).toBeTruthy();
    expect(tabButtons()).toHaveLength(5);
  });

  it("the quick session's live screen is immersive too", async () => {
    await SecureStore.setItemAsync("become.session", savedJwt());
    renderRouter(appRouteMap() as never, {
      initialUrl: "/(tabs)/programming/quick/live",
    });
    expect(
      await routerScreen.findByTestId(screenId("(app)/(tabs)/programming/quick/live")),
    ).toBeTruthy();
    expect(tabButtons()).toEqual([]);
  });

  it("Track keeps the bar — the web's Track page is an ordinary page under the same BottomNav", async () => {
    await SecureStore.setItemAsync("become.session", savedJwt());
    renderRouter(appRouteMap() as never, {
      initialUrl: "/(tabs)/programming/p1/workout/0",
    });
    expect(
      await routerScreen.findByTestId(
        screenId("(app)/(tabs)/programming/[id]/workout/[idx]/index"),
      ),
    ).toBeTruthy();
    expect(tabButtons()).toHaveLength(5);
  });

  it("names the immersive routes once, and nothing else on disk is called `live`", () => {
    expect([...IMMERSIVE_WORKOUT_ROUTES]).toEqual([
      "[id]/workout/[idx]/live",
      "quick/live",
    ]);
    // Every `live` route file under app/, as the programming stack names it.
    const found: string[] = [];
    const walk = (dir: string, prefix: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
        if (entry.isDirectory()) walk(path.join(dir, entry.name), rel);
        else if (/^live\.tsx?$/.test(entry.name)) found.push(rel.replace(/\.tsx?$/, ""));
      }
    };
    walk(path.join(EXPO_DIR, "app"), "");
    expect(found.sort()).toEqual([
      "(app)/(tabs)/programming/[id]/workout/[idx]/live",
      "(app)/(tabs)/programming/quick/live",
    ]);
    for (const route of found) {
      expect(isImmersiveRouteName(route)).toBe(true);
    }
    // A Track route, a tab root and nothing are not immersive.
    expect(isImmersiveRouteName("[id]/workout/[idx]/index")).toBe(false);
    expect(isImmersiveRouteName("index")).toBe(false);
    expect(isImmersiveRouteName(undefined)).toBe(false);
  });

  it("reads the DEEPEST focused route, so a tab's own name never decides it", () => {
    const state = {
      index: 0,
      routes: [
        {
          name: "programming",
          state: {
            index: 1,
            routes: [
              { name: "index" },
              { name: "[id]/workout/[idx]/live" },
            ],
          },
        },
        { name: "dashboard" },
      ],
    };
    expect(focusedLeafRouteName(state)).toBe("[id]/workout/[idx]/live");
    expect(isImmersiveNavigationState(state)).toBe(true);
    // A stack that has not mounted yet answers with the tab, which is not
    // immersive — the bar stays until the live screen is really on top.
    expect(isImmersiveNavigationState({ index: 0, routes: [{ name: "programming" }] })).toBe(
      false,
    );
    expect(isImmersiveNavigationState(undefined)).toBe(false);
  });

  it("the Stack reserves its bottom band for every pushed screen EXCEPT those two", () => {
    const stack = read("components/navigation/TabStack.tsx");
    // The band itself is unchanged (NP-351) …
    expect(stack).toContain("paddingBottom: tabBarInset");
    // … and the immersive screens opt out of it the same way the tab roots do.
    expect(stack).toContain("fullScreenRoutes");
    const layout = read("app/(app)/(tabs)/programming/_layout.tsx");
    expect(layout).toContain("fullScreenRoutes={IMMERSIVE_WORKOUT_ROUTES}");
  });
});

describe("(id: np381-clip) the clip is the full-screen background, with the chrome over it", () => {
  it("fills the screen behind the chrome instead of sitting in a 16:9 card", () => {
    const { getByTestId } = render(
      <LiveWorkoutClient workout={BENCH} initialView="live" />,
    );
    const media = styleOf(getByTestId("live-workout-live-media"));
    expect(media.position).toBe("absolute");
    expect(media.top).toBe(0);
    expect(media.bottom).toBe(0);
    expect(media.left).toBe(0);
    expect(media.right).toBe(0);
    // `fill` is what turns FramedVideo's 16:9 rounded card into a background.
    const src = read("components/live/LiveStepView.tsx");
    expect(src).toMatch(/<FramedVideo[^>]*\n?\s*fill/);
  });

  it("the top bar and the bottom panel float over it, each with its own scrim", () => {
    const { getByTestId } = render(
      <LiveWorkoutClient workout={BENCH} initialView="live" activeSeconds={5} />,
    );
    // The web's `bg-linear-to-b from-black/60 to-transparent` over the top
    // chrome and `from-black/80 via-black/40 to-transparent` under the panel,
    // drawn from the theme's own background (NP-288: never a white literal).
    expect(getByTestId("live-workout-live-top-scrim")).toBeTruthy();
    expect(getByTestId("live-workout-live-panel")).toBeTruthy();
    const src = read("components/live/LiveStepView.tsx");
    expect(src).not.toMatch(/#fff|#FFF|"white"|rgba\(255/);
  });

  it("keeps the dot rail pinned to the right edge, vertically centred (NP-365)", () => {
    const { getByTestId } = render(
      <LiveWorkoutClient
        workout={BENCH}
        initialView="live"
        manageExercises={{ onOpen: jest.fn(), label: "Exercises (1)" }}
      />,
    );
    const rail = styleOf(getByTestId("live-workout-live-exercises"));
    expect(rail.position).toBe("absolute");
    expect(rail.right).toBe(12);
    expect(rail.top).toBe(0);
    expect(rail.bottom).toBe(0);
    expect(rail.justifyContent).toBe("center");
  });
});

describe("(id: np381-spacing) the panel's spacing is the web's numbers", () => {
  it("is the web's p-4 panel with mb-4/mb-4/mb-6 between blocks and 4-6px inside the exercise block", () => {
    // One place, so a future pass cannot drift one of them.
    expect(LIVE_PANEL_SPACING).toEqual({
      panelPaddingX: 16,
      panelPaddingTop: 12,
      panelPaddingBottom: 8,
      blockGap: 16,
      infoGap: 6,
      actionGap: 12,
      panelMaxHeight: "72%",
    });
  });

  it("caps the panel so the clip behind it is never swallowed whole", () => {
    const { getByTestId } = render(
      <LiveWorkoutClient workout={BENCH} initialView="live" />,
    );
    const panel = styleOf(getByTestId("live-workout-live-panel"));
    expect(panel.maxHeight).toBe("72%");
    // It gives up height before the clip does, so the actions are never
    // pushed off the bottom by a tall exercise.
    expect(panel.flexShrink).toBe(1);
  });

  it("applies them: the panel pads 16, the blocks sit 16 apart, the info lines 6", () => {
    const { getByTestId } = render(
      <LiveWorkoutClient workout={BENCH} initialView="live" />,
    );
    const content = (
      getByTestId("live-workout-live-panel-scroll").props as {
        contentContainerStyle: Record<string, unknown>;
      }
    ).contentContainerStyle;
    expect(content.paddingHorizontal).toBe(16);
    expect(content.gap).toBe(16);
    const info = styleOf(getByTestId("live-workout-live-exercise-bench"));
    expect(info.gap).toBe(6);
    const actions = styleOf(getByTestId("live-workout-live-actions"));
    expect(actions.gap).toBe(12);
  });

  it("no longer spaces the whole screen on one uniform 8pt rhythm", () => {
    const src = read("components/live/LiveStepView.tsx");
    // The clip used to be a flex child with a hand-typed margin above it.
    expect(src).not.toContain("marginTop: 8");
  });
});

describe("(id: np381-variation) a logged set looks logged", () => {
  it("Track's set row takes the web's green wash the moment it is complete", () => {
    // Untouched: the card surface, as before.
    const { getByTestId } = render(<LiveWorkoutClient workout={BENCH} />);
    expect(getByTestId("live-workout-bench-set-0").props.className).not.toContain(
      "bg-green-100",
    );
    expect(getByTestId("live-workout-bench-set-0").props.className).toContain(
      "bg-card",
    );

    // Logged (a resumed session's first set): the web's green wash.
    const { getByTestId: get2 } = render(
      <LiveWorkoutClient
        workout={BENCH}
        restoredGrid={{
          bench: [
            {
              reps: 8,
              weight: 135,
              durationSec: null,
              distance: null,
              speed: null,
              completed: true,
            },
            {
              reps: null,
              weight: null,
              durationSec: null,
              distance: null,
              speed: null,
              completed: false,
            },
          ],
        }}
      />,
    );
    expect(get2("live-workout-bench-set-0").props.className).toContain(
      "bg-green-100",
    );
    expect(get2("live-workout-bench-set-0").props.className).toContain(
      "dark:bg-green-900/20",
    );
    // …and an untouched set still reads as untouched.
    expect(get2("live-workout-bench-set-1").props.className).toContain("bg-card");
  });

  it("Track's quick-pick loads are ONE scrolling strip, not a wrapping grid that doubles the row", () => {
    const { getByTestId } = render(<LiveWorkoutClient workout={BENCH} />);
    const strip = getByTestId("live-workout-bench-set-0-quick-picks");
    expect(strip.props.horizontal).toBe(true);
    expect(styleOf(strip).flexWrap).toBeUndefined();
    // The picks still fill the box they belong to.
    expect(getByTestId("live-workout-bench-set-0-quick-pick-135")).toBeTruthy();
  });
});
