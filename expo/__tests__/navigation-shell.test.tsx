/* eslint-disable import/first */
// THE TAB BAR, RENDERED — the test that would have caught the twenty slots.
//
// What it replaces: `TabLayout.test.tsx` asserted things about the TAB_ROUTES
// array — five entries, unique names, a file on disk for each. Every one of
// those assertions passed while the shipped tab bar had 20 buttons, because
// expo-router adds every unlisted child of `(tabs)` to the tab navigator and
// the array says nothing about that. `programming/[id]/workout/[idx]/live`
// was a tab. `profile` was not a route at all, so Settings was one too.
//
// So this renders the REAL layouts over the REAL app directory (see
// `__tests__/support/appRoutes.tsx`) and reads the bar that comes out.

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
import { act, renderRouter, screen } from "expo-router/testing-library";
import * as SecureStore from "expo-secure-store";
import {
  APP_DIR,
  appRouteMap,
  savedJwt,
  screenId,
  tabFolders,
} from "../test-support/appRoutes";
import { TAB_STACK_SCREEN_OPTIONS } from "@/components/navigation/TabStack";
/* eslint-enable import/first */

const fake = SecureStore as unknown as { __reset: () => void };

/** Every tab-bar button, by the label the OS reads out ("Home, tab, 1 of 7"). */
function tabButtons(): { label: string; total: number }[] {
  const seen = new Map<string, number>();
  for (const node of screen.UNSAFE_root.findAll((n) => {
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
    const name = label.slice(0, label.indexOf(", tab,"));
    const total = Number(label.slice(label.lastIndexOf(" of ") + 4));
    if (!seen.has(name)) seen.set(name, total);
  }
  return [...seen.entries()].map(([label, total]) => ({ label, total }));
}

function tabLabels(): string[] {
  return tabButtons().map((b) => b.label);
}

/** Render the shell of a signed-in member, starting on `url`. */
async function renderShell(url: string): Promise<void> {
  await SecureStore.setItemAsync("become.session", savedJwt());
  renderRouter(appRouteMap() as never, { initialUrl: url });
}

beforeEach(() => {
  fake.__reset();
});

describe("the tab bar", () => {
  it("has exactly the five intended buttons, in order", async () => {
    await renderShell("/(tabs)/dashboard");
    expect(
      await screen.findByTestId(screenId("(app)/(tabs)/dashboard/index")),
    ).toBeTruthy();

    expect(tabLabels()).toEqual([
      "Home",
      "Programs",
      "Mind",
      "Nutrition",
      "Chat",
    ]);
  });

  it("puts no nested screen in the tab navigator", async () => {
    await renderShell("/(tabs)/dashboard");
    await screen.findByTestId(screenId("(app)/(tabs)/dashboard/index"));

    // "Home, tab, 1 of N" counts the navigator's screens, hidden ones
    // included: the five tabs plus calendar and profile, which are in the
    // tree with `href: null`. It was 20 while every nested screen —
    // `programming/[id]/workout/[idx]/live`, `nutrition/recipes/[id]`,
    // `profile/health` and the rest — was a screen of the TAB navigator.
    for (const button of tabButtons()) {
      expect(button.total).toBe(7);
    }

    // And nothing that looks like a nested route reached the bar.
    for (const label of tabLabels()) {
      expect(label).not.toMatch(/[/[]/);
      expect(label).not.toMatch(
        /live|search|saved|settings|health|recipes|food|log|phase|workout|calendar|profile/i,
      );
    }
  });

  it("gives every folder under (tabs) a _layout.tsx — the mechanism", () => {
    // This is WHY the bar is five buttons: a folder without a layout is
    // flattened into the tab navigator. The render assertions above are the
    // gate; this one names the cause when they fail.
    for (const folder of tabFolders()) {
      const layout = path.join(APP_DIR, "(app)", "(tabs)", folder, "_layout.tsx");
      expect(fs.existsSync(layout)).toBe(true);
    }
  });
});

describe("detail screens push inside their tab", () => {
  const cases: { tab: string; from: string; to: string; detail: string }[] = [
    {
      tab: "Programs",
      from: "/(tabs)/programming",
      to: "/(tabs)/programming/p1",
      detail: "(app)/(tabs)/programming/[id]/index",
    },
    {
      tab: "Nutrition",
      from: "/(tabs)/nutrition",
      to: "/(tabs)/nutrition/food/f1",
      detail: "(app)/(tabs)/nutrition/food/[id]",
    },
    {
      tab: "Nutrition",
      from: "/(tabs)/nutrition",
      to: "/(tabs)/nutrition/recipes/r1",
      detail: "(app)/(tabs)/nutrition/recipes/[id]",
    },
    {
      tab: "Nutrition",
      from: "/(tabs)/nutrition",
      to: "/(tabs)/nutrition/log/2026-09-29",
      detail: "(app)/(tabs)/nutrition/log/[date]",
    },
  ];

  it.each(cases)(
    "$to pushes over the $tab tab and comes back",
    async ({ from, to, detail }) => {
      await SecureStore.setItemAsync("become.session", savedJwt());
      const rendered = renderRouter(appRouteMap() as never, {
        initialUrl: from,
      });
      const root = from.replace("/(tabs)", "(app)/(tabs)") + "/index";
      expect(await screen.findByTestId(screenId(root))).toBeTruthy();

      act(() => {
        router.push(to as never);
      });
      expect(await screen.findByTestId(screenId(detail))).toBeTruthy();

      // Pushed, not replaced: the tab bar is still there and the tab the
      // member started in is still the tab they are in.
      expect(tabLabels()).toEqual([
        "Home",
        "Programs",
        "Mind",
        "Nutrition",
        "Chat",
      ]);
      expect(rendered.getPathname()).toBe(to.replace("/(tabs)", ""));

      // …and Back — which is what the iOS edge swipe invokes — returns to the
      // list rather than leaving the tab.
      act(() => {
        router.back();
      });
      expect(await screen.findByTestId(screenId(root))).toBeTruthy();
      expect(rendered.getPathname()).toBe(from.replace("/(tabs)", ""));
    },
  );

  it("renders the detail in a native stack with the iOS back gesture on", async () => {
    await SecureStore.setItemAsync("become.session", savedJwt());
    renderRouter(appRouteMap() as never, {
      initialUrl: "/(tabs)/programming",
    });
    await screen.findByTestId(screenId("(app)/(tabs)/programming/index"));

    act(() => {
      router.push("/(tabs)/programming/p1" as never);
    });
    await screen.findByTestId(screenId("(app)/(tabs)/programming/[id]/index"));

    // react-native-screens renders one RNSScreen per stack entry, and
    // `gestureEnabled` is what the swipe reads. Two of them here — the list
    // and the detail on top of it — inside the programming tab.
    const gestures = screen.UNSAFE_root
      .findAll((n) => {
        const type = n.type as unknown as {
          displayName?: string;
          name?: string;
        };
        const named =
          typeof n.type === "string"
            ? String(n.type)
            : (type?.displayName ?? type?.name ?? "");
        return named === "RNSScreen";
      })
      .map((n) => (n.props as { gestureEnabled?: boolean }).gestureEnabled)
      .filter((value) => value !== undefined);
    expect(gestures.length).toBeGreaterThanOrEqual(2);
    expect(gestures.every((value) => value === true)).toBe(true);

    // The source of that: every tab stack asks for it explicitly.
    expect(
      (TAB_STACK_SCREEN_OPTIONS as { gestureEnabled?: boolean }).gestureEnabled,
    ).toBe(true);
  });
});
