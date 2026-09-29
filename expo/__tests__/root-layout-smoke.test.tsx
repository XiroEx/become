/* eslint-disable import/first */
// The test that would have caught NP-004 — and now NP-002.
//
// Every other suite renders a screen or a component in isolation, so nothing
// ever imported `app/_layout.tsx` itself. That file pulls in
// `react-native-gesture-handler`, which loads React Native's renderer at module
// load time, and that renderer throws "Incompatible React versions" unless
// `react` is exactly the version React Native ships. With `react` pinned away
// from the renderer's version (19.2.6 against a 19.2.3 renderer) this file
// throws on import — the same throw a device build takes at launch, because
// Metro bundles with `inlineRequires: false`.
//
// So: render the REAL root layout through the real router, with stub screens in
// place of the app's routes. If the dependency set cannot boot, this fails.
//
// It also pins the launch decision: the cold-open gate reads the REAL secure
// store (a fake Keychain, below), so a saved session lands in the app and an
// empty one lands on sign-in. Against the in-memory placeholder stores the
// second case was the only case.

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

// The provider rolls the session against the real backend on launch. Stub the
// call: a unit test must never reach become.redbtn.io.
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

import { Text } from "react-native";
import { renderRouter, screen } from "expo-router/testing-library";
import * as SecureStore from "expo-secure-store";
import RootLayout from "../app/_layout";
/* eslint-enable import/first */

const fake = SecureStore as unknown as { __reset: () => void };

/** Unexpired, so the local `exp` check trusts it without the network. */
const SAVED_JWT = `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(
  JSON.stringify({ userId: "u1", exp: Math.floor(Date.now() / 1000) + 3600 }),
  "utf8",
).toString("base64url")}.signature`;

function StubScreen({ label }: { label: string }) {
  return <Text testID={`stub-${label}`}>{label}</Text>;
}

const ROUTES = {
  _layout: RootLayout,
  index: () => <StubScreen label="index" />,
  login: () => <StubScreen label="login" />,
  "(tabs)/dashboard/index": () => <StubScreen label="dashboard" />,
};

beforeEach(() => {
  fake.__reset();
});

describe("app/_layout.tsx (real root layout)", () => {
  it("mounts through renderRouter without throwing", async () => {
    renderRouter(ROUTES, { initialUrl: "/" });

    // The layout rendered and handed off to a child route.
    expect(await screen.findByTestId("stub-index")).toBeTruthy();
  });

  it("drives the cold-open redirect to /login when no token is stored", async () => {
    renderRouter(ROUTES, { initialUrl: "/" });

    // ColdOpenGate lives inside the root layout: with nothing in the secure
    // store it resolves to "login" and replaces the route. That only happens
    // if the layout actually mounted.
    expect(await screen.findByTestId("stub-login")).toBeTruthy();
  });

  it("lands a saved session in the app, not on sign-in", async () => {
    // What a force-quit and relaunch looks like: the JWT is still in the
    // Keychain and the process knows nothing else.
    await SecureStore.setItemAsync("become.session", SAVED_JWT);

    renderRouter(ROUTES, { initialUrl: "/" });

    expect(await screen.findByTestId("stub-dashboard")).toBeTruthy();
    expect(screen.queryByTestId("stub-login")).toBeNull();
  });
});
