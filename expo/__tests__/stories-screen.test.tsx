import { render } from "@testing-library/react-native";
// The GALLERY, not the route's default export: the default is wrapped in
// `devOnlyRoute`, which redirects to Home outside `__DEV__`. That wrapper is
// tested by `__tests__/dev-only-routes.test.tsx`; this file is about the cards.
import { StoriesGallery as StoriesScreen } from "../app/_stories";

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
  });

  it("matches a stable snapshot of the stories tree", () => {
    const { toJSON } = render(<StoriesScreen />);
    expect(toJSON()).toMatchSnapshot();
  });
});
