// The test that would have caught NP-004.
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
import { Text } from "react-native";
import { renderRouter, screen } from "expo-router/testing-library";
import RootLayout from "../app/_layout";

function StubScreen({ label }: { label: string }) {
  return <Text testID={`stub-${label}`}>{label}</Text>;
}

describe("app/_layout.tsx (real root layout)", () => {
  it("mounts through renderRouter without throwing", async () => {
    renderRouter(
      {
        _layout: RootLayout,
        index: () => <StubScreen label="index" />,
        login: () => <StubScreen label="login" />,
      },
      { initialUrl: "/" },
    );

    // The layout rendered and handed off to a child route.
    expect(await screen.findByTestId("stub-index")).toBeTruthy();
  });

  it("drives the cold-open redirect to /login when no token is stored", async () => {
    renderRouter(
      {
        _layout: RootLayout,
        index: () => <StubScreen label="index" />,
        login: () => <StubScreen label="login" />,
      },
      { initialUrl: "/" },
    );

    // ColdOpenGate lives inside the root layout: with the placeholder
    // in-memory token store empty it resolves to "login" and replaces the
    // route. That only happens if the layout actually mounted.
    expect(await screen.findByTestId("stub-login")).toBeTruthy();
    expect(screen.getByTestId("stub-login")).toBeTruthy();
  });
});
