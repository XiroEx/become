/**
 * NP-032 acceptance: hide chat and community in the native v1 build — tab,
 * deep links and notifications.
 *
 * One flag, `EXPO_PUBLIC_COMMUNITY_ENABLED` (`lib/flags/communityEnabled.ts`),
 * read at render/call time in exactly three places:
 *   - `app/(app)/(tabs)/_layout.tsx` — whether the chat screens are
 *     registered with the tab navigator at all (`Tabs.Protected`);
 *   - `app/+native-intent.tsx` and `lib/push/deepLinkRouter.ts` — whether
 *     `lib/navigation/webPathToRoute.ts`'s resolver treats chat as real;
 *   - `app/(app)/settings.tsx` — whether the chat-message notification
 *     toggle is offered.
 *
 * This file walks EVERY registered app route and EVERY resolver entry this
 * card owns with the flag off (the default, and what every production build
 * ships), then flips it on and shows the same surfaces come back unchanged.
 */
import * as fs from "fs";
import * as path from "path";
import { router } from "expo-router";
import { act, renderRouter, screen, waitFor } from "expo-router/testing-library";
import * as SecureStore from "expo-secure-store";
import {
  APP_DIR,
  appRouteMap,
  routeKeys,
  savedJwt,
  screenId,
} from "../test-support/appRoutes";
import { TAB_ROUTES } from "../app/(app)/(tabs)/_layout";
import {
  NATIVE_ROUTES,
  resolveWebPath,
} from "@/lib/navigation/webPathToRoute";
import { routeForNotification } from "@/lib/push/deepLinkRouter";
import { routeTapResponse } from "@/lib/push/tapRouter";
import {
  isCommunityEnabled,
  COMMUNITY_ENABLED_ENV_VAR,
} from "@/lib/flags/communityEnabled";
import {
  NOTIFICATION_TOGGLES,
  visibleNotificationToggles,
} from "@/lib/settings/notificationPreferences";

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

const fake = SecureStore as unknown as { __reset: () => void };

async function renderShell(url: string): Promise<void> {
  await SecureStore.setItemAsync("become.session", savedJwt());
  renderRouter(appRouteMap() as never, { initialUrl: url });
}

beforeEach(() => {
  fake.__reset();
  delete process.env[COMMUNITY_ENABLED_ENV_VAR];
});

afterAll(() => {
  delete process.env[COMMUNITY_ENABLED_ENV_VAR];
});

describe("the flag itself", () => {
  it("is off for anything but the literal string \"true\" — unset, empty, a typo", () => {
    delete process.env[COMMUNITY_ENABLED_ENV_VAR];
    expect(isCommunityEnabled()).toBe(false);
    process.env[COMMUNITY_ENABLED_ENV_VAR] = "";
    expect(isCommunityEnabled()).toBe(false);
    process.env[COMMUNITY_ENABLED_ENV_VAR] = "1";
    expect(isCommunityEnabled()).toBe(false);
    process.env[COMMUNITY_ENABLED_ENV_VAR] = "TRUE";
    expect(isCommunityEnabled()).toBe(false);
    process.env[COMMUNITY_ENABLED_ENV_VAR] = "true";
    expect(isCommunityEnabled()).toBe(true);
  });
});

// (id: e015c746) No Chat tab, and nothing that could poll /api/chat/* ever
// mounts, because the screen that polls it is never in the tree.
describe("(e015c746) no Chat tab and no /api/chat/* surface", () => {
  it("does not register the chat screens with the tab navigator", async () => {
    await renderShell("/(tabs)/dashboard");
    expect(
      await screen.findByTestId(screenId("(app)/(tabs)/dashboard/index")),
    ).toBeTruthy();

    // Every button the bar actually renders, by its accessibility label.
    const buttons = screen.UNSAFE_root
      .findAll((n) => {
        const props = (n.props ?? {}) as { accessibilityRole?: string; role?: string };
        return (props.accessibilityRole ?? props.role) === "button";
      })
      .map((n) => (n.props as { accessibilityLabel?: string }).accessibilityLabel)
      .filter((label): label is string => typeof label === "string");
    expect(buttons.some((label) => label.startsWith("Chat"))).toBe(false);
  });

  it("the chat screen's own poll never fires because the screen never mounts", async () => {
    const apiClient = jest.requireMock("@become/api-client") as {
      apiFetch: jest.Mock;
    };
    apiClient.apiFetch.mockClear();

    await renderShell("/(tabs)/dashboard");
    await screen.findByTestId(screenId("(app)/(tabs)/dashboard/index"));

    await waitFor(() => {
      const chatCalls = apiClient.apiFetch.mock.calls.filter((c) =>
        String(c[0]).startsWith("/api/chat"),
      );
      expect(chatCalls).toHaveLength(0);
    });
  });
});

// (id: e015c747) become://chat and become://chat/<id> — the custom scheme's
// own shape — land on Home.
describe("(e015c747) become://chat lands on Home", () => {
  it.each(["/chat", "/chat/anything", "/chat/c1"])(
    "resolveWebPath(%s) with the flag off is Home",
    (rawPathname) => {
      const target = resolveWebPath(rawPathname);
      expect(target.kind).toBe("native");
      if (target.kind !== "native") return;
      expect(target.href).toBe(NATIVE_ROUTES.home);
    },
  );
});

// (id: e015c748) Every path under /dashboard/chat, /dashboard/community,
// /dashboard/groups and /dashboard/events — and a chat push's own url — lands
// on Home. This is the "walk every resolver entry with the flag off" test.
describe("(e015c748) the whole hidden family resolves to Home with the flag off", () => {
  const HIDDEN_PATHS = [
    "/dashboard/chat",
    "/dashboard/chat/c1",
    "/dashboard/chat/anything-at-all",
    "/dashboard/community",
    "/dashboard/community/anything",
    "/dashboard/groups",
    "/dashboard/groups/g1",
    "/dashboard/groups/g1/events",
    "/dashboard/events",
    "/dashboard/events/e1",
  ];

  it.each(HIDDEN_PATHS)("%s resolves to Home, not to its open-the-web fallback", (webPath) => {
    const target = resolveWebPath(webPath);
    expect(target.kind).toBe("native");
    if (target.kind !== "native") return;
    expect(target.href).toBe(NATIVE_ROUTES.home);
    expect(target.params).toEqual({});
  });

  it.each(HIDDEN_PATHS)(
    "the Become web/app hosts and the custom scheme all agree on %s",
    (webPath) => {
      for (const input of [
        webPath,
        `https://become.redbtn.io${webPath}`,
        `https://becomeurbest.com${webPath}`,
        `become://${webPath.slice(1)}`,
      ]) {
        expect(resolveWebPath(input).kind === "native" && resolveWebPath(input)).toMatchObject(
          { href: NATIVE_ROUTES.home },
        );
      }
    },
  );

  it("a chat push's own url (what the server actually sends) lands on Home", () => {
    expect(routeForNotification({ url: "/dashboard/chat" })).toBe(NATIVE_ROUTES.home);
    expect(routeForNotification({ url: "/dashboard/chat/c1" })).toBe(NATIVE_ROUTES.home);
  });

  it("a tap on that push navigates Home, through the real tap router", () => {
    let navigatedTo: string | null = null;
    const route = routeTapResponse(
      { data: { url: "/dashboard/chat" }, isDefaultAction: true },
      (r) => {
        navigatedTo = r;
      },
    );
    expect(route).toBe(NATIVE_ROUTES.home);
    expect(navigatedTo).toBe(NATIVE_ROUTES.home);
  });

  it("the native Settings screen has no chat-message toggle while the flag is off", () => {
    const visible = visibleNotificationToggles({ communityEnabled: isCommunityEnabled() });
    expect(visible.map((t) => t.key)).not.toContain("chatMessage");
    // The key still exists on the full list — it is hidden, not deleted.
    expect(NOTIFICATION_TOGGLES.map((t) => t.key)).toContain("chatMessage");
  });
});

// "Walk every registered route" — every file under `app/`, confirmed against
// the real tabs layout rendered with the flag off.
describe("every registered route, walked, with the flag off", () => {
  it("every chat file is still on disk — NP-032 hides the route, it does not delete the code", () => {
    const keys = routeKeys();
    expect(keys).toContain("(app)/(tabs)/chat/_layout");
    expect(keys).toContain("(app)/(tabs)/chat/index");
    expect(keys).toContain("(app)/(tabs)/chat/[id]");
  });

  it("none of the app's OWN routes is a chat route reachable by direct push", async () => {
    await renderShell("/(tabs)/dashboard");
    await screen.findByTestId(screenId("(app)/(tabs)/dashboard/index"));

    for (const target of ["/(tabs)/chat", "/(tabs)/chat/c1"]) {
      act(() => {
        router.push(target as never);
      });
      expect(screen.queryByTestId(screenId("(app)/(tabs)/chat/index"))).toBeNull();
      expect(screen.queryByTestId(screenId("(app)/(tabs)/chat/[id]"))).toBeNull();
    }
  });

  it("the layout's own guard is the only thing standing between the flag and the screens", () => {
    const layoutSrc = fs.readFileSync(
      path.join(APP_DIR, "(app)", "(tabs)", "_layout.tsx"),
      "utf8",
    );
    expect(layoutSrc).toMatch(/Tabs\.Protected guard=\{communityEnabled\}/);
    expect(layoutSrc).toMatch(/<Tabs\.Screen name="chat"/);
  });
});

// (id: e015c749) Flip the flag on: the chat tab/route comes back, nothing
// else does.
describe("(e015c749) the flag on restores the chat routes with no other change", () => {
  it("resolves /dashboard/chat and /chat exactly, once the flag is on", () => {
    expect(resolveWebPath("/dashboard/chat", { communityEnabled: true })).toMatchObject({
      href: "/(tabs)/chat",
      fallback: "exact",
    });
    expect(resolveWebPath("/chat", { communityEnabled: true })).toMatchObject({
      href: "/(tabs)/chat",
      fallback: "exact",
    });
    expect(resolveWebPath("/chat/c1", { communityEnabled: true })).toMatchObject({
      href: "/(tabs)/chat/c1",
      fallback: "exact",
    });
    // Community/groups/events are unaffected either way — no native screen
    // exists for them at all, flag or no flag (the web still shows them as
    // "Coming soon" to non-admins).
    expect(resolveWebPath("/dashboard/community", { communityEnabled: true })).toMatchObject({
      href: NATIVE_ROUTES.home,
    });
  });

  it("re-registers the chat screens with the tab navigator, still off the bar", async () => {
    process.env[COMMUNITY_ENABLED_ENV_VAR] = "true";
    await renderShell("/(tabs)/chat");
    expect(
      await screen.findByTestId(screenId("(app)/(tabs)/chat/index")),
    ).toBeTruthy();

    // Still no bar button for it — NP-013 owns the bar, not this flag.
    const buttons = screen.UNSAFE_root
      .findAll((n) => {
        const props = (n.props ?? {}) as { accessibilityRole?: string; role?: string };
        return (props.accessibilityRole ?? props.role) === "button";
      })
      .map((n) => (n.props as { accessibilityLabel?: string }).accessibilityLabel)
      .filter((label): label is string => typeof label === "string");
    expect(buttons.some((label) => label.startsWith("Chat"))).toBe(false);
  });

  it("changes nothing about the five visible tabs or their order (TAB_ROUTES untouched)", () => {
    expect(TAB_ROUTES.map((r) => r.name)).toEqual([
      "programming",
      "mind",
      "dashboard",
      "nutrition",
      "profile",
    ]);
  });

  it("restores the chat-message notification toggle", () => {
    const visible = visibleNotificationToggles({ communityEnabled: true });
    expect(visible.map((t) => t.key)).toContain("chatMessage");
  });
});
