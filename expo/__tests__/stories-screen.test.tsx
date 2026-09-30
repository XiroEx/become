import { render } from "@testing-library/react-native";
import { colorScheme } from "nativewind";
import { darkTokens, lightTokens } from "@/lib/theme/tokens";
// The GALLERY, not the route's default export: the default is wrapped in
// `devOnlyRoute`, which redirects to Home outside `__DEV__`. That wrapper is
// tested by `__tests__/dev-only-routes.test.tsx`; this file is about the cards.
import { StoriesGallery as StoriesScreen } from "../app/_stories";

// The gallery is the one screen whose whole job is showing what the components
// look like, so since NP-123 it is snapshotted in a KNOWN scheme rather than in
// whatever the test environment defaults to — and the surface is asserted in
// both, because that is the thing the card changed.
beforeEach(() => {
  colorScheme.set("dark");
});

describe("StoriesScreen", () => {
  it("mounts the stories container", () => {
    const { getByTestId } = render(<StoriesScreen />);
    expect(getByTestId("stories-screen")).toBeTruthy();
  });

  it("renders every component card section", () => {
    const { getByTestId } = render(<StoriesScreen />);
    expect(getByTestId("card-default")).toBeTruthy();
    expect(getByTestId("card-buttons")).toBeTruthy();
    expect(getByTestId("card-inputs")).toBeTruthy();
    expect(getByTestId("card-toggle")).toBeTruthy();
    expect(getByTestId("card-badges")).toBeTruthy();
    expect(getByTestId("card-overlays")).toBeTruthy();
    expect(getByTestId("card-media")).toBeTruthy();
  });

  it("shows the permission refusal with its way to Settings (NP-059)", () => {
    const { getByTestId } = render(<StoriesScreen />);
    expect(getByTestId("media-permission-denied-settings")).toBeTruthy();
    expect(
      String(getByTestId("media-permission-denied-message").props.children),
    ).toMatch(/Settings/);
  });

  it("takes its surface from the system's scheme, both ways", () => {
    const dark = render(<StoriesScreen />);
    expect(dark.getByTestId("stories-screen").props.style).toMatchObject({
      backgroundColor: `rgb(${darkTokens.background})`,
    });
    dark.unmount();

    colorScheme.set("light");
    const light = render(<StoriesScreen />);
    expect(light.getByTestId("stories-screen").props.style).toMatchObject({
      backgroundColor: `rgb(${lightTokens.background})`,
    });
  });

  it("matches a stable snapshot of the stories tree", () => {
    const { toJSON } = render(<StoriesScreen />);
    expect(toJSON()).toMatchSnapshot();
  });
});
