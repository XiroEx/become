/* eslint-disable import/first */
// THE WAY IN, RENDERED — every training screen reached the way a member
// reaches it, from the tab bar.
//
// What this pins: `programming/search`, `programming/saved` and the hidden
// `calendar` tab were finished screens that nothing pushed, and the two Start
// buttons were wired to `?? (() => {})` defaults their routes never filled in.
// Every one of those bugs compiles, renders, and passes a component test —
// they are facts about the ROUTE TREE, so they need the route tree.
//
// Like `navigation-shell.test.tsx`, this renders the REAL layouts over the
// REAL `app/` directory (`test-support/appRoutes.tsx`) and loads the two
// screens that carry the entry points for real; every destination is a stub
// that names the file it is, so an assertion says which screen opened.

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

const mockApiFetch = jest.fn();
jest.mock("@become/api-client", () => {
  const actual = jest.requireActual("@become/api-client");
  return { __esModule: true, ...actual, apiFetch: mockApiFetch };
});

import * as fs from "fs";
import * as path from "path";
import {
  act,
  fireEvent,
  renderRouter,
  screen,
  waitFor,
} from "expo-router/testing-library";
import { router } from "expo-router";
import * as SecureStore from "expo-secure-store";
import { appRouteMap, savedJwt, screenId } from "../test-support/appRoutes";
/* eslint-enable import/first */

const fake = SecureStore as unknown as { __reset: () => void };

/** The two screens that own the entry points — loaded for real, not stubbed. */
const REAL_ROUTES = [
  "(app)/(tabs)/dashboard/index",
  "(app)/(tabs)/programming/index",
];

beforeEach(() => {
  fake.__reset();
  mockApiFetch.mockReset();
  mockApiFetch.mockImplementation(async (path: string) => {
    if (path.startsWith("/api/programs/current-workout")) {
      // The webapp route's shape: a 1-BASED phase and the DAY LABEL the web
      // addresses the session by (`…/workout?day=Day 3`).
      return {
        workout: { title: "Upper A", day: "Day 3", exercises: [{}, {}] },
        phase: 2,
        day: "Day 3",
        phaseInfo: { name: "Phase 2" },
      };
    }
    if (path === "/api/programs/active") {
      return { activePrograms: [{ programId: "p1", programName: "Hyper" }] };
    }
    if (path === "/api/programs") return [];
    if (path === "/api/streak") {
      return { streakDays: 3, longestStreak: 4, streakFreezes: 0 };
    }
    return { user: { _id: "u1", email: "jon@example.com" } };
  });
});

/** Render the shell of a signed-in member, starting on `url`. */
async function renderShell(url: string) {
  await SecureStore.setItemAsync("become.session", savedJwt());
  return renderRouter(appRouteMap({ real: REAL_ROUTES }) as never, {
    initialUrl: url,
  });
}

/** The tab-bar button the OS reads out as "Workout, tab, 1 of 7". */
function tabButton(label: string) {
  return screen.getAllByLabelText(new RegExp(`^${label}, tab,`))[0]!;
}

describe("Search, Saved and the calendar are two taps from the tab bar", () => {
  it.each([
    ["programming-open-search", "(app)/(tabs)/programming/search", "/programming/search"],
    ["programming-open-saved", "(app)/(tabs)/programming/saved", "/programming/saved"],
    ["programming-open-calendar", "(app)/(tabs)/calendar/index", "/calendar"],
  ])(
    "tap 1 = the Workout tab, tap 2 = %s",
    async (testID, destination, pathname) => {
      // Tap 1: the tab bar itself, from Home.
      const rendered = await renderShell("/(tabs)/dashboard");
      // The dashboard is one of the two REAL screens here, so it is its own
      // testID that turns up, not a stub's.
      expect(await screen.findByTestId("dashboard-screen")).toBeTruthy();

      fireEvent.press(tabButton("Workout"));
      expect(await screen.findByTestId("programming-index-route")).toBeTruthy();

      // Tap 2: the control in the programs header. Before this card there was
      // no second tap to make — these three screens were pushed from nowhere.
      fireEvent.press(screen.getByTestId(testID));

      expect(await screen.findByTestId(screenId(destination))).toBeTruthy();
      await waitFor(() => {
        expect(rendered.getPathname()).toBe(pathname);
      });
    },
  );

  it("pushes them, so Back returns to the programs list", async () => {
    const rendered = await renderShell("/(tabs)/programming");
    expect(await screen.findByTestId("programming-index-route")).toBeTruthy();

    fireEvent.press(screen.getByTestId("programming-open-saved"));
    expect(
      await screen.findByTestId(screenId("(app)/(tabs)/programming/saved")),
    ).toBeTruthy();

    act(() => {
      router.back();
    });
    expect(await screen.findByTestId("programming-index-route")).toBeTruthy();
    await waitFor(() => {
      expect(rendered.getPathname()).toBe("/programming");
    });
  });

  it("the dashboard opens the calendar too", async () => {
    const rendered = await renderShell("/(tabs)/dashboard");
    expect(await screen.findByTestId("dashboard-screen")).toBeTruthy();

    fireEvent.press(await screen.findByTestId("up-next-calendar"));

    expect(
      await screen.findByTestId(screenId("(app)/(tabs)/calendar/index")),
    ).toBeTruthy();
    await waitFor(() => {
      expect(rendered.getPathname()).toBe("/calendar");
    });
  });
});

describe("Start workout leads to the live screen", () => {
  it("dashboard → workout overview for the current program, day and phase", async () => {
    const rendered = await renderShell("/(tabs)/dashboard");
    expect(await screen.findByTestId("dashboard-screen")).toBeTruthy();

    // The card only renders once current-workout has answered.
    const start = await screen.findByTestId("dashboard-start-workout");
    fireEvent.press(start);

    expect(
      await screen.findByTestId(
        screenId("(app)/(tabs)/programming/[id]/workout/[idx]/index"),
      ),
    ).toBeTruthy();
    // "Day 3" → index 2, 1-based phase 2 → `?phase=1`.
    await waitFor(() => {
      expect(rendered.getPathname()).toBe("/programming/p1/workout/2");
    });
    expect(rendered.getSearchParams()).toEqual(
      expect.objectContaining({ phase: "1" }),
    );
  });

  it("workout overview → the live screen for the same program, phase and index", async () => {
    // The overview is loaded for real here; the live screen is the stub, so
    // the assertion is about which route opened, not what it renders.
    await SecureStore.setItemAsync("become.session", savedJwt());
    const rendered = renderRouter(
      appRouteMap({
        real: ["(app)/(tabs)/programming/[id]/workout/[idx]/index"],
      }) as never,
      { initialUrl: "/(tabs)/programming/p1/workout/2?phase=1" },
    );

    expect(
      await screen.findByTestId("programming-workout-route"),
    ).toBeTruthy();

    fireEvent.press(screen.getByTestId("workout-overview-start-live"));

    expect(
      await screen.findByTestId(
        screenId("(app)/(tabs)/programming/[id]/workout/[idx]/live"),
      ),
    ).toBeTruthy();
    await waitFor(() => {
      expect(rendered.getPathname()).toBe("/programming/p1/workout/2/live");
    });
    expect(rendered.getSearchParams()).toEqual(
      expect.objectContaining({ phase: "1" }),
    );
  });
});

// THE COMPILER IS THE GATE, and this names the thing it is gating.
//
// `tsc --noEmit` fails today if a route renders either screen without its
// Start callback (TS2741, "Property 'onStartWorkout' is missing … but required
// in type 'DashboardScreenProps'"). A type error cannot be asserted from
// inside Jest, so what this reads is the two properties that make it one: no
// `?` on the prop, and no `?? (() => {})` swallowing the omission at runtime.
describe("the Start callbacks are required props", () => {
  const sources: [string, string][] = [
    ["onStartWorkout", "components/DashboardScreen.tsx"],
    ["onStartLive", "components/programs/WorkoutOverview.tsx"],
  ];

  it.each(sources)("%s is not optional in %s", (prop, file) => {
    const src = fs.readFileSync(path.resolve(__dirname, "..", file), "utf8");
    expect(src).toMatch(new RegExp(`^\\s*${prop}: \\(\\) => void;`, "m"));
    expect(src).not.toMatch(new RegExp(`${prop}\\?:`));
  });

  it.each(sources)("%s has no no-op default in %s", (prop, file) => {
    // The line the card is about: `onPress={onStartWorkout ?? (() => {})}`
    // rendered a live button that did nothing, in a file that compiled. The
    // button now presses straight through to the prop. (The comments in those
    // files quote the old line, which is why this looks at the JSX.)
    const src = fs.readFileSync(path.resolve(__dirname, "..", file), "utf8");
    expect(src).toMatch(new RegExp(`onPress=\\{${prop}\\}`));
    expect(src).not.toMatch(new RegExp(`onPress=\\{${prop}\\s*\\?\\?`));
  });
});
